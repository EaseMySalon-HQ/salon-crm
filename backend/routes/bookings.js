/**
 * Parent booking API — multi-day & package flows.
 */
const express = require('express');
const router = express.Router();
const databaseManager = require('../config/database-manager');
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { logger } = require('../utils/logger');
const bookingService = require('../services/scheduling/booking-service');

const auth = [authenticateToken, setupBusinessDatabase];

async function loadBusinessDoc(branchId) {
  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  return Business.findById(branchId).lean();
}

router.post('/', auth, async (req, res) => {
  try {
    const businessDoc = await loadBusinessDoc(req.user.branchId);
    if (!businessDoc) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }
    const payload = {
      ...req.body,
      branchId: req.user.branchId,
      units: (req.body.units || []).map((u) => ({
        ...u,
        createdBy: u.createdBy || req.user?.name || req.user?.email || ''
      }))
    };
    /** Staff scheduling: no soft-hold conflict checks; outcome is all-or-nothing (rollback on failure in service). */
    const result = await bookingService.createBooking(req.businessModels, businessDoc, payload, {
      skipHoldConflict: true
    });
    return res.status(201).json({
      success: true,
      data: {
        bookingId: result.booking._id,
        appointmentIds: result.appointmentIds,
        bookingGroupId: result.booking.bookingGroupId,
        timezone: 'Asia/Kolkata'
      }
    });
  } catch (e) {
    logger.error('[bookings] create', e);
    const code = e.code || 'ERROR';
    const status = code === 'CONFLICT' ? 409 : code === 'VALIDATION' || code === 'STAFF_REQUIRED' || code === 'BAD_STAFF_SPLIT' ? 400 : 500;
    return res.status(status).json({ success: false, error: e.message, code, details: e.details });
  }
});

/** Soft slot holds (TTL) — intended for future online booking; staff app uses POST / without holds. */
router.post('/holds', auth, async (req, res) => {
  try {
    const { staffId, startAt, endAt, ttlMinutes, clientId, bookingId } = req.body;
    if (!clientId || !staffId || !startAt || !endAt) {
      return res.status(400).json({ success: false, error: 'clientId, staffId, startAt, endAt required' });
    }
    const hold = await bookingService.createSlotHold(req.businessModels, {
      branchId: req.user.branchId,
      clientId,
      staffId,
      startAt,
      endAt,
      ttlMinutes,
      bookingId,
      createdBy: req.user?.name || req.user?.email || ''
    });
    return res.status(201).json({
      success: true,
      data: bookingService.formatHoldForApi(hold)
    });
  } catch (e) {
    logger.error('[bookings] hold', e);
    const status = e.code === 'CONFLICT' ? 409 : 500;
    return res.status(status).json({ success: false, error: e.message, details: e.details });
  }
});

router.post('/:bookingId/holds', auth, async (req, res) => {
  try {
    const { staffId, startAt, endAt, ttlMinutes, clientId } = req.body;
    if (!clientId || !staffId || !startAt || !endAt) {
      return res.status(400).json({ success: false, error: 'clientId, staffId, startAt, endAt required' });
    }
    const hold = await bookingService.createSlotHold(req.businessModels, {
      branchId: req.user.branchId,
      clientId,
      staffId,
      startAt,
      endAt,
      ttlMinutes,
      bookingId: req.params.bookingId,
      createdBy: req.user?.name || req.user?.email || ''
    });
    return res.status(201).json({
      success: true,
      data: bookingService.formatHoldForApi(hold)
    });
  } catch (e) {
    logger.error('[bookings] hold for booking', e);
    const status = e.code === 'CONFLICT' ? 409 : 500;
    return res.status(status).json({ success: false, error: e.message, details: e.details });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const data = await bookingService.getBookingDetails(req.businessModels, req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    return res.json({ success: true, data });
  } catch (e) {
    logger.error('[bookings] get', e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
