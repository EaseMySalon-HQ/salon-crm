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
const { sendAppointmentRescheduleWhatsApp, sendAppointmentCancellationWhatsApp } = require('../lib/send-appointment-whatsapp');

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

    try {
      const { Appointment } = req.businessModels;
      /** booking-service returns `updated` as a count, not an array; use `updatedAppointmentIds` when present */
      const idList =
        Array.isArray(out.updatedAppointmentIds) && out.updatedAppointmentIds.length > 0
          ? out.updatedAppointmentIds
          : typeof out.updated === 'number' && out.updated > 0
            ? [req.params.id]
            : [];
      for (const rawId of idList) {
        const apptId = rawId && (rawId._id || rawId.id || rawId);
        if (!apptId) continue;
        const populated = await Appointment.findById(apptId)
          .populate('clientId', 'name phone email')
          .populate('serviceId', 'name price duration')
          .populate('staffId', 'name role');
        if (populated) {
          await sendAppointmentRescheduleWhatsApp(req, populated);
        }
      }
    } catch (whatsappErr) {
      logger.error('Error sending reschedule WhatsApp:', whatsappErr);
    }

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
    const { Appointment } = req.businessModels;

    const preCancel = await Appointment.findById(req.params.id).select('parentBookingId').lean();
    const out = await bookingService.cancelAppointment(req.businessModels, req.params.id, { scope, reason });

    try {
      if (scope === 'this' || !preCancel?.parentBookingId) {
        const populated = await Appointment.findById(req.params.id)
          .populate('clientId', 'name phone email')
          .populate('serviceId', 'name price duration')
          .populate('staffId', 'name role');
        if (populated) {
          await sendAppointmentCancellationWhatsApp(req, populated, reason);
        }
      } else {
        const cancelled = await Appointment.find({
          parentBookingId: preCancel.parentBookingId,
          status: 'cancelled'
        })
          .populate('clientId', 'name phone email')
          .populate('serviceId', 'name price duration')
          .populate('staffId', 'name role');
        for (const apt of cancelled) {
          await sendAppointmentCancellationWhatsApp(req, apt, reason);
        }
      }
    } catch (whatsappErr) {
      logger.error('Error sending cancellation WhatsApp:', whatsappErr);
    }

    return res.json({ success: true, data: out });
  } catch (e) {
    logger.error('[appointments] cancel', e);
    const status = e.code === 'NOT_FOUND' ? 404 : 500;
    return res.status(status).json({ success: false, error: e.message });
  }
});

module.exports = router;
