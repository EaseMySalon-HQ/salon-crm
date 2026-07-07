'use strict';

/**
 * Attendance & Payroll business settings + branch holiday calendar (per-tenant).
 *
 *   GET    /api/settings/attendance-payroll
 *   PUT    /api/settings/attendance-payroll
 *   GET    /api/settings/holidays?year=YYYY
 *   POST   /api/settings/holidays
 *   DELETE /api/settings/holidays/:id
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { requirePermission } = require('../middleware/permissions');
const {
  mergeAttendancePayrollSettings,
  validateAttendancePayrollSettings,
} = require('../lib/attendance-payroll-settings');
const {
  businessHasPayrollFeature,
  stripPayrollSettingsForResponse,
  mergeAttendancePayrollSettingsForPlan,
} = require('../lib/payroll-feature-access');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── GET /api/settings/attendance-payroll ─────────────────────────────────────
router.get('/attendance-payroll', authenticateToken, setupBusinessDatabase, requirePermission('payroll_settings', 'view'), async (req, res) => {
  try {
    const { BusinessSettings } = req.businessModels;
    const doc = await BusinessSettings.findOne().select('attendancePayroll').lean();
    let settings = mergeAttendancePayrollSettings(doc?.attendancePayroll);
    const hasPayroll = await businessHasPayrollFeature(req);
    if (!hasPayroll) {
      settings = stripPayrollSettingsForResponse(doc?.attendancePayroll);
    }
    res.json({ success: true, data: settings, payrollLocked: !hasPayroll });
  } catch (error) {
    logger.error('[settings/attendance-payroll] GET', error);
    res.status(500).json({ success: false, error: 'Failed to load attendance & payroll settings' });
  }
});

// ── PUT /api/settings/attendance-payroll ─────────────────────────────────────
router.put('/attendance-payroll', authenticateToken, setupBusinessDatabase, requirePermission('payroll_settings', 'edit'), async (req, res) => {
  try {
    const hasPayroll = await businessHasPayrollFeature(req);
    const { BusinessSettings } = req.businessModels;
    let doc = await BusinessSettings.findOne();
    const stored = doc?.attendancePayroll;
    const merged = mergeAttendancePayrollSettingsForPlan(req.body, stored, hasPayroll);
    const { valid, error } = validateAttendancePayrollSettings(merged);
    if (!valid) {
      return res.status(400).json({ success: false, error });
    }

    if (!doc) doc = new BusinessSettings({});
    doc.attendancePayroll = merged;
    doc.markModified('attendancePayroll');
    await doc.save();

    res.json({ success: true, data: merged });
  } catch (error) {
    logger.error('[settings/attendance-payroll] PUT', error);
    res.status(500).json({ success: false, error: 'Failed to save attendance & payroll settings' });
  }
});

// ── GET /api/settings/holidays?year=YYYY ─────────────────────────────────────
router.get('/holidays', authenticateToken, setupBusinessDatabase, requirePermission('payroll_settings', 'view'), async (req, res) => {
  try {
    const { BranchHoliday } = req.businessModels;
    const branchId = req.user.branchId;
    const year = String(req.query.year || '').trim();
    const filter = { branchId };
    if (/^\d{4}$/.test(year)) {
      filter.date = { $gte: `${year}-01-01`, $lte: `${year}-12-31` };
    }
    const holidays = await BranchHoliday.find(filter).sort({ date: 1 }).lean();
    res.json({
      success: true,
      data: holidays.map((h) => ({ id: String(h._id), date: h.date, name: h.name || '' })),
    });
  } catch (error) {
    logger.error('[settings/holidays] GET', error);
    res.status(500).json({ success: false, error: 'Failed to load holidays' });
  }
});

// ── POST /api/settings/holidays ──────────────────────────────────────────────
router.post('/holidays', authenticateToken, setupBusinessDatabase, requirePermission('payroll_settings', 'edit'), async (req, res) => {
  try {
    const { BranchHoliday } = req.businessModels;
    const branchId = req.user.branchId;
    const date = String(req.body?.date || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!DATE_RE.test(date)) {
      return res.status(400).json({ success: false, error: 'A valid date (YYYY-MM-DD) is required' });
    }
    const doc = await BranchHoliday.findOneAndUpdate(
      { branchId, date },
      { $set: { name } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, data: { id: String(doc._id), date: doc.date, name: doc.name || '' } });
  } catch (error) {
    logger.error('[settings/holidays] POST', error);
    res.status(500).json({ success: false, error: 'Failed to save holiday' });
  }
});

// ── DELETE /api/settings/holidays/:id ────────────────────────────────────────
router.delete('/holidays/:id', authenticateToken, setupBusinessDatabase, requirePermission('payroll_settings', 'delete'), async (req, res) => {
  try {
    const { BranchHoliday } = req.businessModels;
    const branchId = req.user.branchId;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid holiday id' });
    }
    const result = await BranchHoliday.deleteOne({ _id: id, branchId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Holiday not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('[settings/holidays] DELETE', error);
    res.status(500).json({ success: false, error: 'Failed to delete holiday' });
  }
});

module.exports = router;
