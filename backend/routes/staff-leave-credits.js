'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { requirePermission } = require('../middleware/permissions');
const {
  computeBalance,
  createLedgerEntry,
  listBalances,
  serializeLedger,
  syncWorkedWeekoffs,
} = require('../lib/staff-leave-credit');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function buildDateFilter(query) {
  const { from, to, month } = query || {};
  if (from && to && DATE_RE.test(String(from)) && DATE_RE.test(String(to))) {
    const start = String(from);
    const end = String(to);
    return start <= end ? { from: start, to: end } : { from: end, to: start };
  }
  if (month && /^\d{4}-\d{2}$/.test(String(month))) {
    const [y, m] = String(month).split('-');
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    return {
      from: `${month}-01`,
      to: `${month}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  return null;
}

router.get(
  '/balances',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'view'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { staffId } = req.query;
      const range = buildDateFilter(req.query);

      let data = await listBalances(req.businessModels, branchId, range);

      if (staffId && mongoose.Types.ObjectId.isValid(String(staffId))) {
        data = data.filter((row) => row.staffId === String(staffId));
      } else {
        data = data.filter((row) => row.balance > 0 || (range && (row.earnedInPeriod > 0 || row.usedInPeriod > 0)));
      }

      res.json({ success: true, data, meta: range || null });
    } catch (error) {
      logger.error('[staff-leave-credits] balances failed:', error);
      res.status(500).json({ success: false, error: 'Failed to load leave balances' });
    }
  }
);

router.get(
  '/ledger',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'view'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { staffId, from, to, month } = req.query;
      const query = { branchId };

      if (staffId && mongoose.Types.ObjectId.isValid(String(staffId))) {
        query.staffId = staffId;
      }

      const range = buildDateFilter({ from, to, month });
      if (range) {
        query.date = { $gte: range.from, $lte: range.to };
      }

      const { StaffLeaveCreditLedger } = req.businessModels;
      const rows = await StaffLeaveCreditLedger.find(query)
        .sort({ date: -1, createdAt: -1 })
        .limit(500)
        .lean();

      res.json({
        success: true,
        data: rows.map(serializeLedger),
        meta: range || null,
      });
    } catch (error) {
      logger.error('[staff-leave-credits] ledger failed:', error);
      res.status(500).json({ success: false, error: 'Failed to load leave ledger' });
    }
  }
);

router.get(
  '/balance/:staffId',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'view'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { staffId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(staffId)) {
        return res.status(400).json({ success: false, error: 'Invalid staffId' });
      }

      const balance = await computeBalance(req.businessModels, branchId, staffId);
      res.json({ success: true, data: { staffId, balance } });
    } catch (error) {
      logger.error('[staff-leave-credits] balance failed:', error);
      res.status(500).json({ success: false, error: 'Failed to load balance' });
    }
  }
);

router.post(
  '/sync',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'edit'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { from, to, month, staffId, reason } = req.body || {};
      const range = buildDateFilter({ from, to, month });
      if (!range) {
        return res.status(400).json({
          success: false,
          error: 'Provide month (YYYY-MM) or from and to (YYYY-MM-DD)',
        });
      }

      const result = await syncWorkedWeekoffs(req.businessModels, branchId, range.from, range.to, {
        staffId,
        createdBy: req.user._id || req.user.id || null,
        reason: String(reason || '').slice(0, 500),
      });

      res.json({ success: true, data: result, meta: range });
    } catch (error) {
      logger.error('[staff-leave-credits] sync failed:', error);
      res.status(500).json({ success: false, error: 'Failed to sync from attendance' });
    }
  }
);

router.post(
  '/adjust',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'edit'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { staffId, date, days, direction, kind, reason } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(String(staffId || ''))) {
        return res.status(400).json({ success: false, error: 'Invalid staffId' });
      }
      if (!DATE_RE.test(String(date || ''))) {
        return res.status(400).json({ success: false, error: 'Invalid date (YYYY-MM-DD)' });
      }
      const dayCount = Number(days);
      if (!Number.isFinite(dayCount) || dayCount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid days' });
      }
      if (!['earn', 'use'].includes(direction)) {
        return res.status(400).json({ success: false, error: 'Invalid direction' });
      }

      const { Staff } = req.businessModels;
      const staff = await Staff.findOne({ _id: staffId, branchId }).select('name').lean();
      if (!staff) {
        return res.status(404).json({ success: false, error: 'Staff not found' });
      }

      if (direction === 'use') {
        const balance = await computeBalance(req.businessModels, branchId, staffId);
        if (balance < dayCount) {
          return res.status(400).json({
            success: false,
            error: `Insufficient balance (${balance} day(s) available)`,
          });
        }
      }

      const earnKind = kind === 'skipped_weekoff' ? 'skipped_weekoff' : 'manual_earn';
      const useKind = 'manual_use';
      const resolvedKind =
        direction === 'earn'
          ? kind === 'skipped_weekoff'
            ? 'skipped_weekoff'
            : 'manual_earn'
          : useKind;

      const doc = await createLedgerEntry(req.businessModels, {
        branchId,
        staffId,
        staffName: staff.name || '',
        date,
        direction,
        days: dayCount,
        kind: resolvedKind,
        reason: String(reason || '').slice(0, 500),
        createdBy: req.user._id || req.user.id || null,
      });

      const balance = await computeBalance(req.businessModels, branchId, staffId);

      res.json({
        success: true,
        data: { entry: serializeLedger(doc), balance },
      });
    } catch (error) {
      logger.error('[staff-leave-credits] adjust failed:', error);
      res.status(500).json({ success: false, error: 'Failed to adjust balance' });
    }
  }
);

module.exports = router;
