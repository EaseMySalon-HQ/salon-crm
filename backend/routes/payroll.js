'use strict';

/**
 * Staff payroll management (per-tenant).
 *
 *   GET    /api/payroll?month=YYYY-MM
 *   POST   /api/payroll
 *   PATCH  /api/payroll/:id/status
 *   DELETE /api/payroll/:id
 *   GET    /api/payroll/staff/:staffId/commission-breakdown?month=YYYY-MM
 *   GET    /api/payroll/records/:id/audit
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const {
  parseDateIST,
  getStartOfDayIST,
  getEndOfDayIST,
  formatInIST,
} = require('../utils/date-utils');
const {
  PAYMENT_METHODS,
  logPayrollAudit,
  diffFields,
  serializeRecord,
  loadPayrollContext,
  round2,
  computeNet,
  buildDeductionNote,
  computeLeaveDeduction,
  computeAdvanceRecovery,
  countUnpaidLeaveDays,
} = require('../lib/payroll-service');
const { buildStaffCommissionBreakdown } = require('../lib/payroll-commission-breakdown');
const { appendAdvanceLedgerEntry, reverseAdvanceRecoveryForPayroll } = require('../lib/staff-advance-ledger');
const { isAdvanceEligibleForPayrollMonth } = require('../lib/payroll-calculator');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonthIST() {
  const now = new Date();
  const parts = now
    .toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
    .split('/');
  if (parts.length === 2) {
    const a = parts[0].trim();
    const b = parts[1].trim();
    const year = a.length === 4 ? a : b;
    const month = a.length === 4 ? b : a;
    return `${year}-${month.padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 7);
}

function monthRange(month) {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const startYmd = `${month}-01`;
  const endYmd = `${month}-${String(lastDay).padStart(2, '0')}`;
  return {
    start: getStartOfDayIST(startYmd),
    end: getEndOfDayIST(endYmd),
    startYmd,
    endYmd,
    periodLabel: formatInIST(parseDateIST(startYmd), { month: 'long', year: 'numeric' }),
  };
}

function nonNegative(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return round2(n);
}

function actorFromReq(req) {
  return {
    id: req.user._id || req.user.id || null,
    name: req.user.name || req.user.email || 'Admin',
  };
}

async function applyAdvanceRecoveryOnPay(businessModels, branchId, staffId, amount, context = {}) {
  if (amount <= 0) return;
  const { StaffAdvance } = businessModels;
  const {
    payrollRecordId = null,
    payrollMonth = '',
    performedBy = null,
    performedByName = 'System',
  } = context;
  let remaining = amount;
  const advances = await StaffAdvance.find({ branchId, staffId, status: 'active' })
    .sort({ givenAt: 1 })
    .lean();

  for (const adv of advances) {
    if (remaining <= 0) break;
    if (payrollMonth && !isAdvanceEligibleForPayrollMonth(adv, payrollMonth)) continue;
    const outstanding = round2((adv.amount || 0) - (adv.recoveredAmount || 0));
    if (outstanding <= 0) {
      await StaffAdvance.updateOne({ _id: adv._id }, { $set: { status: 'closed' } });
      continue;
    }
    const chunk = Math.min(remaining, outstanding);
    const newRecovered = round2((adv.recoveredAmount || 0) + chunk);
    const newOutstanding = round2((adv.amount || 0) - newRecovered);
    const closed = newOutstanding <= 0;
    await StaffAdvance.updateOne(
      { _id: adv._id },
      { $set: { recoveredAmount: newRecovered, ...(closed ? { status: 'closed' } : {}) } }
    );
    await appendAdvanceLedgerEntry(businessModels, {
      branchId,
      advanceId: adv._id,
      staffId: adv.staffId,
      staffName: adv.staffName || '',
      type: 'recovery',
      amount: chunk,
      outstandingAfter: closed ? 0 : newOutstanding,
      notes: payrollMonth ? `Recovered via payroll — ${payrollMonth}` : 'Recovered via payroll',
      payrollRecordId,
      payrollMonth,
      performedBy,
      performedByName,
    });
    if (closed) {
      await appendAdvanceLedgerEntry(businessModels, {
        branchId,
        advanceId: adv._id,
        staffId: adv.staffId,
        staffName: adv.staffName || '',
        type: 'closed',
        amount: 0,
        outstandingAfter: 0,
        notes: 'Advance fully recovered',
        payrollRecordId,
        payrollMonth,
        performedBy,
        performedByName,
      });
    }
    remaining = round2(remaining - chunk);
  }
}

// ── GET /api/payroll ────────────────────────────────────────────────────────
router.get(
  '/',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'view'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const month = MONTH_RE.test(String(req.query.month || ''))
        ? String(req.query.month)
        : currentMonthIST();
      const range = monthRange(month);
      const { rows, totals, payoutLabel } = await loadPayrollContext(req.businessModels, branchId, month, range);

      res.json({
        success: true,
        data: { month, periodLabel: range.periodLabel, payoutLabel, rows, totals },
      });
    } catch (error) {
      logger.error('[payroll] list failed:', error);
      res.status(500).json({ success: false, error: 'Failed to load payroll' });
    }
  }
);

// ── GET /api/payroll/staff/:staffId/commission-breakdown ──────────────────────
router.get(
  '/staff/:staffId/commission-breakdown',
  authenticateToken,
  setupBusinessDatabase,
  requireAnyPermission(
    { module: 'payroll_settings', feature: 'view' },
    { module: 'incentive_settings', feature: 'view' },
    { module: 'reports', feature: 'view_staff_commission' }
  ),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { staffId } = req.params;
      const month = MONTH_RE.test(String(req.query.month || ''))
        ? String(req.query.month)
        : currentMonthIST();

      if (!mongoose.Types.ObjectId.isValid(staffId)) {
        return res.status(400).json({ success: false, error: 'Invalid staffId' });
      }

      const range = monthRange(month);
      const data = await buildStaffCommissionBreakdown(
        req.businessModels,
        branchId,
        staffId,
        range
      );
      if (!data) {
        return res.status(404).json({ success: false, error: 'Staff not found' });
      }

      res.json({ success: true, data: { month, periodLabel: range.periodLabel, ...data } });
    } catch (error) {
      logger.error('[payroll] commission breakdown failed:', error);
      res.status(500).json({ success: false, error: 'Failed to load commission breakdown' });
    }
  }
);

// ── GET /api/payroll/records/:id/audit ──────────────────────────────────────
router.get(
  '/records/:id/audit',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'view'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid record id' });
      }

      const { PayrollAuditLog } = req.businessModels;
      const logs = await PayrollAuditLog.find({ branchId, payrollRecordId: id })
        .sort({ performedAt: -1 })
        .limit(100)
        .lean();

      res.json({
        success: true,
        data: logs.map((l) => ({
          id: String(l._id),
          action: l.action,
          performedByName: l.performedByName || '',
          performedAt: l.performedAt,
          changes: l.changes || [],
        })),
      });
    } catch (error) {
      logger.error('[payroll] audit list failed:', error);
      res.status(500).json({ success: false, error: 'Failed to load audit log' });
    }
  }
);

// ── POST /api/payroll ───────────────────────────────────────────────────────
router.post(
  '/',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'edit'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const actor = actorFromReq(req);
      const { staffId, month } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(String(staffId || ''))) {
        return res.status(400).json({ success: false, error: 'Invalid staffId' });
      }
      if (!MONTH_RE.test(String(month || ''))) {
        return res.status(400).json({ success: false, error: 'Invalid month (expected YYYY-MM)' });
      }

      const { Staff, PayrollRecord, StaffLeaveRecord, StaffAdvance, BusinessSettings } = req.businessModels;
      const range = monthRange(month);
      const {
        mergeAttendancePayrollSettings,
        resolveStaffPayrollRules,
      } = require('../lib/attendance-payroll-settings');

      const staff = await Staff.findOne({ _id: staffId, branchId })
        .select('_id name salary payrollOverrides')
        .lean();
      if (!staff) {
        return res.status(404).json({ success: false, error: 'Staff not found' });
      }

      const settingsDoc = BusinessSettings
        ? await BusinessSettings.findOne().select('attendancePayroll').lean()
        : null;
      const mergedSettings = mergeAttendancePayrollSettings(settingsDoc?.attendancePayroll);
      const resolvedRules = resolveStaffPayrollRules(mergedSettings, staff);

      const leaves = await StaffLeaveRecord.find({
        branchId,
        staffId,
        date: { $gte: range.startYmd, $lte: range.endYmd },
      }).lean();
      const advances = await StaffAdvance.find({ branchId, staffId, status: 'active' }).lean();

      const unpaidLeaveDays = countUnpaidLeaveDays(leaves);
      const leaveDeduction = computeLeaveDeduction(staff.salary || 0, month, unpaidLeaveDays);
      const advanceRecovery = computeAdvanceRecovery(advances, month);
      const manualDeductions = nonNegative(req.body.manualDeductions ?? req.body.deductions);

      const baseSalary = nonNegative(req.body.baseSalary ?? staff.salary);
      const incentive = nonNegative(req.body.incentive);
      const bonus = nonNegative(req.body.bonus);
      const overtimePay = nonNegative(req.body.overtimePay);
      const latePenalty = nonNegative(req.body.latePenalty);
      const manualNote = String(req.body.deductionNote || '').slice(0, 500);
      const notes = String(req.body.notes || '').slice(0, 1000);
      const deductions = round2(leaveDeduction + advanceRecovery + manualDeductions + latePenalty);
      const deductionNote = buildDeductionNote({
        leaveDeduction,
        unpaidLeaveDays,
        advanceRecovery,
        manualNote,
      });
      const netPay = computeNet({
        baseSalary,
        incentive,
        bonus,
        overtimePay,
        leaveDeduction,
        advanceRecovery,
        manualDeductions,
        latePenalty,
        formula: resolvedRules.salaryFormula,
        rounding: resolvedRules.rounding,
      });

      const update = {
        staffName: staff.name || '',
        baseSalary,
        incentive,
        bonus,
        overtimePay,
        latePenalty,
        deductions,
        leaveDeduction,
        unpaidLeaveDays,
        advanceRecovery,
        manualDeductions,
        deductionNote,
        notes,
        netPay,
      };

      const existing = await PayrollRecord.findOne({ branchId, staffId, month }).lean();
      const record = await PayrollRecord.findOneAndUpdate(
        { branchId, staffId, month },
        {
          $set: update,
          $setOnInsert: {
            branchId,
            staffId,
            month,
            status: 'draft',
            createdBy: actor.id,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      const action = existing ? 'updated' : 'created';
      const changes = existing
        ? diffFields(existing, record.toObject(), [
            'baseSalary',
            'incentive',
            'bonus',
            'deductions',
            'manualDeductions',
            'leaveDeduction',
            'advanceRecovery',
            'deductionNote',
            'notes',
            'netPay',
          ])
        : [{ field: 'created', oldValue: null, newValue: netPay }];

      await logPayrollAudit(req.businessModels, {
        branchId,
        payrollRecordId: record._id,
        staffId,
        staffName: staff.name || '',
        month,
        action,
        performedBy: actor.id,
        performedByName: actor.name,
        changes,
      });

      res.json({ success: true, data: serializeRecord(record) });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ success: false, error: 'Payroll record already exists' });
      }
      logger.error('[payroll] upsert failed:', error);
      res.status(500).json({ success: false, error: 'Failed to save payroll record' });
    }
  }
);

// ── PATCH /api/payroll/:id/status ─────────────────────────────────────────────
router.patch(
  '/:id/status',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'edit'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const actor = actorFromReq(req);
      const { id } = req.params;
      const { status } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid record id' });
      }
      if (!['draft', 'paid'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }

      const { PayrollRecord } = req.businessModels;
      const before = await PayrollRecord.findOne({ _id: id, branchId }).lean();
      if (!before) {
        return res.status(404).json({ success: false, error: 'Payroll record not found' });
      }

      const set = { status };
      if (status === 'paid') {
        set.paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
        const method = String(req.body.paymentMethod || '').toLowerCase();
        set.paymentMethod = PAYMENT_METHODS.includes(method) ? method : 'cash';

        // Apply advance recovery ledger when marking paid
        if ((before.advanceRecovery || 0) > 0 && before.status !== 'paid') {
          await applyAdvanceRecoveryOnPay(
            req.businessModels,
            branchId,
            before.staffId,
            before.advanceRecovery,
            {
              payrollRecordId: before._id,
              payrollMonth: before.month || '',
              performedBy: actor.id,
              performedByName: actor.name,
            }
          );
        }
      } else {
        set.paidAt = null;
        set.paymentMethod = '';

        if (before.status === 'paid' && (before.advanceRecovery || 0) > 0) {
          await reverseAdvanceRecoveryForPayroll(
            req.businessModels,
            branchId,
            before._id,
            {
              payrollMonth: before.month || '',
              performedBy: actor.id,
              performedByName: actor.name,
              fallbackAmount: before.advanceRecovery || 0,
              staffId: before.staffId,
            }
          );
        }
      }

      const record = await PayrollRecord.findOneAndUpdate(
        { _id: id, branchId },
        { $set: set },
        { new: true }
      );

      await logPayrollAudit(req.businessModels, {
        branchId,
        payrollRecordId: record._id,
        staffId: record.staffId,
        staffName: record.staffName || '',
        month: record.month,
        action: status === 'paid' ? 'marked_paid' : 'marked_draft',
        performedBy: actor.id,
        performedByName: actor.name,
        changes: diffFields(before, record.toObject(), ['status', 'paidAt', 'paymentMethod']),
      });

      res.json({ success: true, data: serializeRecord(record) });
    } catch (error) {
      logger.error('[payroll] status update failed:', error);
      res.status(500).json({ success: false, error: 'Failed to update status' });
    }
  }
);

// ── DELETE /api/payroll/:id ───────────────────────────────────────────────────
router.delete(
  '/:id',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('payroll_settings', 'delete'),
  async (req, res) => {
    try {
      const branchId = req.user.branchId;
      const actor = actorFromReq(req);
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, error: 'Invalid record id' });
      }

      const { PayrollRecord } = req.businessModels;
      const deleted = await PayrollRecord.findOneAndDelete({ _id: id, branchId });
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Payroll record not found' });
      }

      await logPayrollAudit(req.businessModels, {
        branchId,
        payrollRecordId: deleted._id,
        staffId: deleted.staffId,
        staffName: deleted.staffName || '',
        month: deleted.month,
        action: 'deleted',
        performedBy: actor.id,
        performedByName: actor.name,
        changes: [{ field: 'deleted', oldValue: deleted.netPay, newValue: null }],
      });

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      logger.error('[payroll] delete failed:', error);
      res.status(500).json({ success: false, error: 'Failed to delete payroll record' });
    }
  }
);

module.exports = router;
