'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { requirePermission } = require('../middleware/permissions');
const { round2 } = require('../lib/payroll-calculator');
const { appendAdvanceLedgerEntry, listAdvanceLedger } = require('../lib/staff-advance-ledger');

const RECOVERY_FROM_VALUES = ['current_cycle', 'next_cycle'];

function normalizeRecoveryFrom(value) {
  return RECOVERY_FROM_VALUES.includes(String(value)) ? String(value) : 'next_cycle';
}

function actorFromReq(req) {
  return {
    id: req.user._id || req.user.id || null,
    name: req.user.name || req.user.email || 'Admin',
  };
}

function serializeAdvanceRow(r) {
  return {
    id: String(r._id),
    staffId: String(r.staffId),
    staffName: r.staffName || '',
    amount: r.amount || 0,
    recoveredAmount: r.recoveredAmount || 0,
    outstanding: round2((r.amount || 0) - (r.recoveredAmount || 0)),
    installmentAmount: r.installmentAmount || 0,
    givenAt: r.givenAt,
    recoveryFrom: normalizeRecoveryFrom(r.recoveryFrom),
    notes: r.notes || '',
    status: r.status,
  };
}

router.get(
  '/',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('staff_payroll', 'view'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const query = { branchId };
      if (req.query.staffId && mongoose.Types.ObjectId.isValid(String(req.query.staffId))) {
        query.staffId = req.query.staffId;
      }
      if (req.query.status === 'active' || req.query.status === 'closed') {
        query.status = req.query.status;
      }

      const { StaffAdvance } = req.businessModels;
      const rows = await StaffAdvance.find(query).sort({ givenAt: -1 }).limit(200).lean();

      res.json({
        success: true,
        data: rows.map(serializeAdvanceRow),
      });
    } catch (error) {
      logger.error('[staff-advances] list failed:', error);
      res.status(500).json({ success: false, error: 'Failed to load advances' });
    }
  }
);

router.post(
  '/',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('staff_payroll', 'edit'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { staffId, amount, installmentAmount, notes, givenAt, recoveryFrom } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(String(staffId || ''))) {
        return res.status(400).json({ success: false, error: 'Invalid staffId' });
      }
      const amt = round2(amount);
      if (amt <= 0) {
        return res.status(400).json({ success: false, error: 'Amount must be positive' });
      }

      const { Staff, StaffAdvance } = req.businessModels;
      const staff = await Staff.findOne({ _id: staffId, branchId }).select('name').lean();
      if (!staff) {
        return res.status(404).json({ success: false, error: 'Staff not found' });
      }

      const record = await StaffAdvance.create({
        branchId,
        staffId,
        staffName: staff.name || '',
        amount: amt,
        recoveredAmount: 0,
        installmentAmount: round2(installmentAmount || 0),
        givenAt: givenAt ? new Date(givenAt) : new Date(),
        recoveryFrom: normalizeRecoveryFrom(recoveryFrom),
        notes: String(notes || '').slice(0, 1000),
        status: 'active',
        createdBy: req.user._id || req.user.id || null,
      });

      const actor = actorFromReq(req);
      await appendAdvanceLedgerEntry(req.businessModels, {
        branchId,
        advanceId: record._id,
        staffId: record.staffId,
        staffName: record.staffName,
        type: 'given',
        amount: record.amount,
        outstandingAfter: record.amount,
        notes: record.notes || '',
        performedBy: actor.id,
        performedByName: actor.name,
      });

      res.status(201).json({
        success: true,
        data: serializeAdvanceRow(record),
      });
    } catch (error) {
      logger.error('[staff-advances] create failed:', error);
      res.status(500).json({ success: false, error: 'Failed to create advance' });
    }
  }
);

router.patch(
  '/:id',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('staff_payroll', 'edit'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid id' });
      }

      const { StaffAdvance } = req.businessModels;
      const record = await StaffAdvance.findOne({ _id: id, branchId });
      if (!record) {
        return res.status(404).json({ success: false, error: 'Advance not found' });
      }
      if (record.status !== 'active') {
        return res.status(400).json({ success: false, error: 'Only active advances can be edited' });
      }

      const body = req.body || {};
      const changes = [];
      const recovered = round2(record.recoveredAmount || 0);

      if (body.amount !== undefined) {
        const amt = round2(body.amount);
        if (amt <= 0) {
          return res.status(400).json({ success: false, error: 'Amount must be positive' });
        }
        if (amt < recovered) {
          return res.status(400).json({
            success: false,
            error: `Amount cannot be less than recovered (${recovered})`,
          });
        }
        if (amt !== record.amount) {
          changes.push(`Amount: ₹${round2(record.amount)} → ₹${amt}`);
          record.amount = amt;
        }
      }

      if (body.installmentAmount !== undefined) {
        const inst = round2(body.installmentAmount);
        if (inst !== round2(record.installmentAmount || 0)) {
          changes.push(
            `Monthly recovery: ₹${round2(record.installmentAmount || 0)} → ₹${inst}${inst === 0 ? ' (full)' : ''}`
          );
          record.installmentAmount = inst;
        }
      }

      if (body.recoveryFrom !== undefined) {
        const rf = normalizeRecoveryFrom(body.recoveryFrom);
        if (rf !== normalizeRecoveryFrom(record.recoveryFrom)) {
          changes.push(
            `Recovery from: ${record.recoveryFrom === 'current_cycle' ? 'This cycle' : 'Next cycle'} → ${rf === 'current_cycle' ? 'This cycle' : 'Next cycle'}`
          );
          record.recoveryFrom = rf;
        }
      }

      if (body.notes !== undefined) {
        const notes = String(body.notes || '').slice(0, 1000);
        if (notes !== (record.notes || '')) {
          changes.push('Notes updated');
          record.notes = notes;
        }
      }

      if (body.givenAt !== undefined) {
        if (recovered > 0) {
          return res.status(400).json({
            success: false,
            error: 'Cannot change given date after recovery has started',
          });
        }
        const nextGivenAt = body.givenAt ? new Date(body.givenAt) : record.givenAt;
        if (Number.isNaN(nextGivenAt.getTime())) {
          return res.status(400).json({ success: false, error: 'Invalid given date' });
        }
        const prevKey = record.givenAt ? record.givenAt.toISOString().slice(0, 10) : '';
        const nextKey = nextGivenAt.toISOString().slice(0, 10);
        if (prevKey !== nextKey) {
          changes.push(`Given date: ${prevKey || '—'} → ${nextKey}`);
          record.givenAt = nextGivenAt;
        }
      }

      if (changes.length === 0) {
        return res.json({ success: true, data: serializeAdvanceRow(record) });
      }

      await record.save();

      const actor = actorFromReq(req);
      const outstanding = round2((record.amount || 0) - (record.recoveredAmount || 0));
      await appendAdvanceLedgerEntry(req.businessModels, {
        branchId,
        advanceId: record._id,
        staffId: record.staffId,
        staffName: record.staffName,
        type: 'adjustment',
        amount: 0,
        outstandingAfter: outstanding,
        notes: changes.join('; '),
        performedBy: actor.id,
        performedByName: actor.name,
      });

      res.json({ success: true, data: serializeAdvanceRow(record) });
    } catch (error) {
      logger.error('[staff-advances] update failed:', error);
      res.status(500).json({ success: false, error: 'Failed to update advance' });
    }
  }
);

router.patch(
  '/:id/close',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('staff_payroll', 'edit'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid id' });
      }

      const { StaffAdvance } = req.businessModels;
      const record = await StaffAdvance.findOne({ _id: id, branchId });
      if (!record) {
        return res.status(404).json({ success: false, error: 'Advance not found' });
      }

      const outstanding = round2((record.amount || 0) - (record.recoveredAmount || 0));
      record.status = 'closed';
      await record.save();

      const actor = actorFromReq(req);
      await appendAdvanceLedgerEntry(req.businessModels, {
        branchId,
        advanceId: record._id,
        staffId: record.staffId,
        staffName: record.staffName,
        type: 'closed',
        amount: outstanding,
        outstandingAfter: 0,
        notes: outstanding > 0 ? 'Advance closed — remaining balance waived' : 'Advance fully recovered and closed',
        performedBy: actor.id,
        performedByName: actor.name,
      });

      res.json({ success: true, data: { id: String(record._id), status: record.status } });
    } catch (error) {
      logger.error('[staff-advances] close failed:', error);
      res.status(500).json({ success: false, error: 'Failed to close advance' });
    }
  }
);

router.get(
  '/:id/logs',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('staff_payroll', 'view'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid id' });
      }

      const { StaffAdvance } = req.businessModels;
      const advance = await StaffAdvance.findOne({ _id: id, branchId }).select('_id').lean();
      if (!advance) {
        return res.status(404).json({ success: false, error: 'Advance not found' });
      }

      const data = await listAdvanceLedger(req.businessModels, branchId, id);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('[staff-advances] logs failed:', error);
      res.status(500).json({ success: false, error: 'Failed to load advance logs' });
    }
  }
);

module.exports = router;
