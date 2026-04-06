/**
 * PATCH /:id/reschedule and /:id/cancel — requires parent booking link for reschedule-all.
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

router.patch('/:id/reschedule', auth, async (req, res) => {
  try {
    const { scope = 'this', startAt, endAt, skipAvailability } = req.body;
    if (!startAt || !endAt) {
      return res.status(400).json({ success: false, error: 'startAt and endAt required' });
    }
    const businessDoc = await loadBusinessDoc(req.user.branchId);
    if (!businessDoc) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }
    const out = await bookingService.rescheduleAppointment(
      req.businessModels,
      businessDoc,
      req.params.id,
      { scope, startAt, endAt, skipAvailability: !!skipAvailability }
    );
    return res.json({ success: true, data: out });
  } catch (e) {
    logger.error('[appointments] reschedule', e);
    const code = e.code || 'ERROR';
    const status =
      code === 'NOT_FOUND' ? 404
        : code === 'CONFLICT' ? 409
          : code === 'OUTSIDE_AVAILABILITY' ? 400
            : 500;
    return res.status(status).json({ success: false, error: e.message, code, details: e.details });
  }
});

router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const { scope = 'this', reason } = req.body;
    const out = await bookingService.cancelAppointment(req.businessModels, req.params.id, { scope, reason });
    return res.json({ success: true, data: out });
  } catch (e) {
    logger.error('[appointments] cancel', e);
    const status = e.code === 'NOT_FOUND' ? 404 : 500;
    return res.status(status).json({ success: false, error: e.message });
  }
});

module.exports = router;
