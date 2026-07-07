'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { requirePermission } = require('../middleware/permissions');
const {
  reversePaidLeaveUse,
  useBalanceForPaidLeave,
  listBalances,
} = require('../lib/staff-leave-credit');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function buildLeaveDateFilter(queryParams) {
  const { month, from, to } = queryParams || {};
  if (from && to && DATE_RE.test(String(from)) && DATE_RE.test(String(to))) {
    const start = String(from);
    const end = String(to);
    return start <= end ? { $gte: start, $lte: end } : { $gte: end, $lte: start };
  }
  if (month && MONTH_RE.test(String(month))) {
    const [y, m] = String(month).split('-');
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    return {
      $gte: `${month}-01`,
      $lte: `${month}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  return null;
}

function mapLeaveRow(r) {
  return {
    id: String(r._id),
    staffId: String(r.staffId),
    staffName: r.staffName || '',
    date: r.date,
    type: r.type,
    reason: r.reason || '',
    fromBalance: Boolean(r.fromBalance),
    balanceDaysUsed: Number(r.balanceDaysUsed) || 0,
  };
}

router.get(
  '/summary',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'view'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { staffId } = req.query;
      const dateFilter = buildLeaveDateFilter(req.query);
      if (!dateFilter) {
        return res.status(400).json({
          success: false,
          error: 'Provide month (YYYY-MM) or from and to (YYYY-MM-DD)',
        });
      }

      const match = { branchId, date: dateFilter };
      if (staffId && mongoose.Types.ObjectId.isValid(String(staffId))) {
        match.staffId = new mongoose.Types.ObjectId(String(staffId));
      }

      const { Staff, StaffLeaveRecord } = req.businessModels;

      const agg = await StaffLeaveRecord.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$staffId',
            staffName: { $first: '$staffName' },
            unpaidDays: { $sum: { $cond: [{ $eq: ['$type', 'unpaid'] }, 1, 0] } },
            halfDays: { $sum: { $cond: [{ $eq: ['$type', 'half_day'] }, 1, 0] } },
            paidDays: { $sum: { $cond: [{ $eq: ['$type', 'paid'] }, 1, 0] } },
            entries: { $sum: 1 },
          },
        },
      ]);

      const byStaffId = new Map(
        agg.map((row) => [
          String(row._id),
          {
            staffName: row.staffName || '',
            unpaidDays: row.unpaidDays || 0,
            halfDays: row.halfDays || 0,
            paidDays: row.paidDays || 0,
            entries: row.entries || 0,
          },
        ])
      );

      let staffQuery = { branchId, isActive: true };
      if (staffId && mongoose.Types.ObjectId.isValid(String(staffId))) {
        staffQuery._id = staffId;
      }

      const staffList = await Staff.find(staffQuery).select('name').sort({ name: 1 }).lean();
      const balances = await listBalances(req.businessModels, branchId, {
        from: dateFilter.$gte,
        to: dateFilter.$lte,
      });
      const balanceByStaff = new Map(balances.map((b) => [b.staffId, b]));

      const data = staffList.map((s) => {
        const id = String(s._id);
        const stats = byStaffId.get(id) || {
          staffName: s.name || '',
          unpaidDays: 0,
          halfDays: 0,
          paidDays: 0,
          entries: 0,
        };
        const bal = balanceByStaff.get(id);
        const lwpDays = stats.unpaidDays + stats.halfDays * 0.5;
        const totalDays = stats.unpaidDays + stats.paidDays + stats.halfDays * 0.5;
        return {
          staffId: id,
          staffName: stats.staffName || s.name || '',
          unpaidDays: stats.unpaidDays,
          halfDays: stats.halfDays,
          paidDays: stats.paidDays,
          lwpDays,
          totalDays,
          entries: stats.entries,
          savedLeaveBalance: bal?.balance ?? 0,
          earnedInPeriod: bal?.earnedInPeriod ?? 0,
          usedInPeriod: bal?.usedInPeriod ?? 0,
        };
      });

      const filtered = staffId
        ? data
        : data.filter((row) => row.entries > 0 || row.savedLeaveBalance > 0);

      res.json({
        success: true,
        data: filtered,
        meta: {
          from: dateFilter.$gte,
          to: dateFilter.$lte,
        },
      });
    } catch (error) {
      logger.error('[staff-leaves] summary failed:', error);
      res.status(500).json({ success: false, error: 'Failed to load leave summary' });
    }
  }
);

router.get(
  '/',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'view'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { staffId, month, from, to } = req.query;
      const query = { branchId };
      if (staffId && mongoose.Types.ObjectId.isValid(String(staffId))) {
        query.staffId = staffId;
      }
      const dateFilter = buildLeaveDateFilter({ month, from, to });
      if (dateFilter) {
        query.date = dateFilter;
      }

      const { StaffLeaveRecord } = req.businessModels;
      const rows = await StaffLeaveRecord.find(query).sort({ date: -1 }).limit(500).lean();

      res.json({
        success: true,
        data: rows.map(mapLeaveRow),
      });
    } catch (error) {
      logger.error('[staff-leaves] list failed:', error);
      res.status(500).json({ success: false, error: 'Failed to load leaves' });
    }
  }
);

router.post(
  '/',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'edit'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { staffId, date, type, reason, useBalance } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(String(staffId || ''))) {
        return res.status(400).json({ success: false, error: 'Invalid staffId' });
      }
      if (!DATE_RE.test(String(date || ''))) {
        return res.status(400).json({ success: false, error: 'Invalid date (YYYY-MM-DD)' });
      }
      if (!['unpaid', 'paid', 'half_day'].includes(type)) {
        return res.status(400).json({ success: false, error: 'Invalid leave type' });
      }

      const { Staff, StaffLeaveRecord } = req.businessModels;
      const staff = await Staff.findOne({ _id: staffId, branchId }).select('name').lean();
      if (!staff) {
        return res.status(404).json({ success: false, error: 'Staff not found' });
      }

      const existing = await StaffLeaveRecord.findOne({ branchId, staffId, date }).lean();
      if (existing?.fromBalance) {
        await reversePaidLeaveUse(req.businessModels, branchId, existing);
      }

      const record = await StaffLeaveRecord.findOneAndUpdate(
        { branchId, staffId, date },
        {
          $set: {
            staffName: staff.name || '',
            type,
            reason: String(reason || '').slice(0, 500),
            fromBalance: false,
            balanceDaysUsed: 0,
          },
          $setOnInsert: {
            branchId,
            staffId,
            date,
            createdBy: req.user._id || req.user.id || null,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      if (type === 'paid' && useBalance) {
        try {
          await useBalanceForPaidLeave(
            req.businessModels,
            branchId,
            staff,
            record,
            1,
            req.user._id || req.user.id || null
          );
        } catch (err) {
          await StaffLeaveRecord.deleteOne({ _id: record._id });
          return res.status(err.status || 400).json({
            success: false,
            error: err.message || 'Failed to use saved leave balance',
          });
        }
      }

      res.json({
        success: true,
        data: mapLeaveRow(record),
      });
    } catch (error) {
      logger.error('[staff-leaves] create failed:', error);
      res.status(500).json({ success: false, error: 'Failed to save leave' });
    }
  }
);

router.delete(
  '/:id',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'delete'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid id' });
      }

      const { StaffLeaveRecord } = req.businessModels;
      const deleted = await StaffLeaveRecord.findOne({ _id: id, branchId });
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Leave record not found' });
      }

      if (deleted.fromBalance) {
        await reversePaidLeaveUse(req.businessModels, branchId, deleted);
      }

      await StaffLeaveRecord.deleteOne({ _id: deleted._id });

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      logger.error('[staff-leaves] delete failed:', error);
      res.status(500).json({ success: false, error: 'Failed to delete leave' });
    }
  }
);

module.exports = router;
