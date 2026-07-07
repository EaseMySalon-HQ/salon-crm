'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { logger } = require('../utils/logger');
const { authenticateToken, requireStaff } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { userHasPermission } = require('../middleware/permissions');
const { toDateStringIST } = require('../utils/date-utils');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function actorFromReq(req) {
  return {
    id: req.user._id || req.user.id || null,
    name:
      req.user.name ||
      [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') ||
      req.user.email ||
      'User',
  };
}

function serializeAttendance(doc, evaluation) {
  return {
    id: String(doc._id),
    staffId: String(doc.staffId),
    staffName: doc.staffName || '',
    date: doc.date,
    checkInAt: doc.checkInAt,
    checkOutAt: doc.checkOutAt || null,
    checkInByName: doc.checkInByName || '',
    checkOutByName: doc.checkOutByName || '',
    status: doc.checkOutAt ? 'completed' : 'checked_in',
    ...(evaluation
      ? {
          dayStatus: evaluation.status,
          lateMinutes: evaluation.lateMinutes,
          workedHours: evaluation.workedHours,
          overtimeMinutes: evaluation.overtimeMinutes,
        }
      : {}),
  };
}

async function getMergedAttendanceSettings(businessModels) {
  const { BusinessSettings } = businessModels;
  const { mergeAttendancePayrollSettings } = require('../lib/attendance-payroll-settings');
  const settingsDoc = BusinessSettings
    ? await BusinessSettings.findOne().select('attendancePayroll').lean()
    : null;
  return mergeAttendancePayrollSettings(settingsDoc?.attendancePayroll);
}

function evaluateAttendanceRecord(doc, mergedSettings, staff) {
  const { evaluateDay } = require('../lib/attendance-evaluator');
  const { resolveStaffShiftHoursForDay } = require('../lib/attendance-payroll-settings');
  const dow = new Date(`${doc.date}T12:00:00+05:30`).getDay();
  const staffSchedule = staff ? resolveStaffShiftHoursForDay(staff, dow, mergedSettings) : null;
  return evaluateDay({
    checkInAt: doc.checkInAt,
    checkOutAt: doc.checkOutAt,
    rules: mergedSettings,
    staffSchedule: staffSchedule || undefined,
  });
}

function canCorrectAttendance(req) {
  return userHasPermission(req.user, 'payroll_settings', 'edit');
}

/** Managers with payroll view see all rows; staff without it are scoped to self. */
function requirePayrollViewOrSelfAttendance(req, res, next) {
  if (userHasPermission(req.user, 'payroll_settings', 'view')) {
    return next();
  }
  const userId = String(req.user._id || req.user.id || '');
  const qStaffId = req.query.staffId ? String(req.query.staffId) : '';
  if (req.user.role === 'staff' && (!qStaffId || qStaffId === userId)) {
    req.query.staffId = userId;
    return next();
  }
  return res.status(403).json({
    success: false,
    error: 'Insufficient permissions',
    requiredPermission: { module: 'payroll_settings', feature: 'view' },
  });
}

async function findTodayAttendanceForCorrection(req, id) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    return { error: 'Invalid attendance id', status: 400 };
  }

  const { StaffAttendance } = req.businessModels;
  const record = await StaffAttendance.findOne({
    _id: id,
    branchId: req.user.branchId,
  });

  if (!record) {
    return { error: 'Attendance record not found', status: 404 };
  }

  const today = toDateStringIST(new Date());
  if (record.date !== today) {
    return { error: "Only today's attendance can be corrected", status: 403 };
  }

  return { record };
}

async function resolveStaffForAction(req, staffIdParam) {
  const branchId = req.user.branchId;
  const { Staff } = req.businessModels;
  const isStaffUser = req.user.role === 'staff' && !req.user.isOwner;

  if (isStaffUser) {
    const selfId = String(req.user._id || req.user.id || '');
    const staff = await Staff.findOne({ _id: selfId, branchId, isActive: true })
      .select('_id name shiftId workSchedule')
      .lean();
    if (!staff) return { error: 'Staff profile not found', status: 404 };
    return { staff, branchId };
  }

  if (!staffIdParam || !mongoose.Types.ObjectId.isValid(String(staffIdParam))) {
    return { error: 'staffId is required', status: 400 };
  }

  const staff = await Staff.findOne({ _id: staffIdParam, branchId, isActive: true })
    .select('_id name shiftId workSchedule')
    .lean();
  if (!staff) return { error: 'Staff not found', status: 404 };
  return { staff, branchId };
}

// GET /api/staff-attendance
router.get('/', authenticateToken, setupBusinessDatabase, requireStaff, requirePayrollViewOrSelfAttendance, async (req, res) => {
  try {
    const branchId = req.user.branchId;
    const { staffId, date, startDate, endDate } = req.query;
    const query = { branchId };

    if (staffId && mongoose.Types.ObjectId.isValid(String(staffId))) {
      query.staffId = staffId;
    }
    if (date && DATE_RE.test(String(date))) {
      query.date = String(date);
    } else if (startDate && endDate && DATE_RE.test(String(startDate)) && DATE_RE.test(String(endDate))) {
      query.date = { $gte: String(startDate), $lte: String(endDate) };
    }

    const { StaffAttendance, Staff } = req.businessModels;
    const rows = await StaffAttendance.find(query).sort({ date: -1, checkInAt: -1 }).limit(500).lean();
    const mergedSettings = await getMergedAttendanceSettings(req.businessModels);

    const staffIds = [...new Set(rows.map((r) => String(r.staffId)))];
    const staffRows = staffIds.length
      ? await Staff.find({ _id: { $in: staffIds } }).select('shiftId workSchedule').lean()
      : [];
    const staffById = new Map(staffRows.map((s) => [String(s._id), s]));

    res.json({
      success: true,
      data: rows.map((doc) =>
        serializeAttendance(
          doc,
          evaluateAttendanceRecord(doc, mergedSettings, staffById.get(String(doc.staffId)))
        )
      ),
    });
  } catch (error) {
    logger.error('[staff-attendance] list failed:', error);
    res.status(500).json({ success: false, error: 'Failed to load attendance' });
  }
});

// POST /api/staff-attendance/check-in
router.post(
  '/check-in',
  authenticateToken,
  setupBusinessDatabase,
  requireStaff,
  async (req, res) => {
    try {
      const actor = actorFromReq(req);
      const date =
        req.body?.date && DATE_RE.test(String(req.body.date))
          ? String(req.body.date)
          : toDateStringIST(new Date());

      const resolved = await resolveStaffForAction(req, req.body?.staffId);
      if (resolved.error) {
        return res.status(resolved.status).json({ success: false, error: resolved.error });
      }

      const { staff, branchId } = resolved;
      const { StaffAttendance } = req.businessModels;

      const existing = await StaffAttendance.findOne({
        branchId,
        staffId: staff._id,
        date,
      }).lean();

      if (existing && !existing.checkOutAt) {
        return res.status(409).json({
          success: false,
          error: 'Already checked in. Check out first before a new check-in.',
        });
      }

      if (existing && existing.checkOutAt) {
        return res.status(409).json({
          success: false,
          error: 'Attendance already recorded for this date.',
        });
      }

      const record = await StaffAttendance.create({
        branchId,
        staffId: staff._id,
        staffName: staff.name || '',
        date,
        checkInAt: new Date(),
        checkInBy: actor.id,
        checkInByName: actor.name,
      });

      const mergedSettings = await getMergedAttendanceSettings(req.businessModels);
      const evaluation = evaluateAttendanceRecord(record, mergedSettings, staff);

      res.status(201).json({
        success: true,
        data: serializeAttendance(record, evaluation),
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ success: false, error: 'Attendance already exists for this date' });
      }
      logger.error('[staff-attendance] check-in failed:', error);
      res.status(500).json({ success: false, error: 'Failed to check in' });
    }
  }
);

// POST /api/staff-attendance/check-out
router.post(
  '/check-out',
  authenticateToken,
  setupBusinessDatabase,
  requireStaff,
  async (req, res) => {
    try {
      const actor = actorFromReq(req);
      const date =
        req.body?.date && DATE_RE.test(String(req.body.date))
          ? String(req.body.date)
          : toDateStringIST(new Date());

      const resolved = await resolveStaffForAction(req, req.body?.staffId);
      if (resolved.error) {
        return res.status(resolved.status).json({ success: false, error: resolved.error });
      }

      const { staff, branchId } = resolved;
      const { StaffAttendance } = req.businessModels;

      const record = await StaffAttendance.findOne({
        branchId,
        staffId: staff._id,
        date,
      });

      if (!record) {
        return res.status(404).json({ success: false, error: 'No check-in found for today' });
      }
      if (record.checkOutAt) {
        return res.status(409).json({ success: false, error: 'Already checked out' });
      }

      record.checkOutAt = new Date();
      record.checkOutBy = actor.id;
      record.checkOutByName = actor.name;
      await record.save();

      const mergedSettings = await getMergedAttendanceSettings(req.businessModels);
      const evaluation = evaluateAttendanceRecord(record, mergedSettings, staff);

      res.json({ success: true, data: serializeAttendance(record, evaluation) });
    } catch (error) {
      logger.error('[staff-attendance] check-out failed:', error);
      res.status(500).json({ success: false, error: 'Failed to check out' });
    }
  }
);

// DELETE /api/staff-attendance/:id — undo mistaken check-in (managers/admins, today only)
router.delete(
  '/:id',
  authenticateToken,
  setupBusinessDatabase,
  requireStaff,
  async (req, res) => {
    try {
      if (!canCorrectAttendance(req)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions to correct attendance',
          requiredPermission: { module: 'payroll_settings', feature: 'edit' },
        });
      }

      const found = await findTodayAttendanceForCorrection(req, req.params.id);
      if (found.error) {
        return res.status(found.status).json({ success: false, error: found.error });
      }

      await found.record.deleteOne();
      res.json({ success: true, data: { id: String(req.params.id) } });
    } catch (error) {
      logger.error('[staff-attendance] delete failed:', error);
      res.status(500).json({ success: false, error: 'Failed to remove attendance' });
    }
  }
);

// POST /api/staff-attendance/:id/undo-checkout — revert mistaken check-out (today only)
router.post(
  '/:id/undo-checkout',
  authenticateToken,
  setupBusinessDatabase,
  requireStaff,
  async (req, res) => {
    try {
      if (!canCorrectAttendance(req)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions to correct attendance',
          requiredPermission: { module: 'payroll_settings', feature: 'edit' },
        });
      }

      const found = await findTodayAttendanceForCorrection(req, req.params.id);
      if (found.error) {
        return res.status(found.status).json({ success: false, error: found.error });
      }

      const { record } = found;
      if (!record.checkOutAt) {
        return res.status(400).json({ success: false, error: 'This staff member is not checked out' });
      }

      record.checkOutAt = null;
      record.checkOutBy = null;
      record.checkOutByName = '';
      await record.save();

      const { Staff } = req.businessModels;
      const staffDoc = await Staff.findById(record.staffId).select('shiftId workSchedule').lean();

      const mergedSettings = await getMergedAttendanceSettings(req.businessModels);
      const evaluation = evaluateAttendanceRecord(record, mergedSettings, staffDoc);

      res.json({ success: true, data: serializeAttendance(record, evaluation) });
    } catch (error) {
      logger.error('[staff-attendance] undo-checkout failed:', error);
      res.status(500).json({ success: false, error: 'Failed to undo check-out' });
    }
  }
);

module.exports = router;
