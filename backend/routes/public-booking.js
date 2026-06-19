'use strict';

/**
 * Public online appointment booking — no auth; gated by allowOnlineBooking on Business.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { setupMainDatabase } = require('../middleware/business-db');
const { setupPublicBusinessByCode } = require('../middleware/public-business-db');
const { validate } = require('../middleware/validate');
const { logger } = require('../utils/logger');
const {
  publicBookingSlotsBodySchema,
  publicBookingHoldsBodySchema,
  publicBookingCreateBodySchema,
  objectIdHex,
} = require('../validation/schemas');
const publicBookingService = require('../services/scheduling/public-booking-service');
const { sendAppointmentWhatsAppAfterCreate } = require('../lib/send-appointment-whatsapp');

const router = express.Router({ mergeParams: true });

function skipPublicBookingRateLimit() {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.PUBLIC_BOOKING_RATE_LIMIT === '0'
  );
}

const rateLimitDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipPublicBookingRateLimit,
  /** Client bugs (400/404) should not exhaust the shared read budget. */
  skipFailedRequests: true,
  message: { success: false, error: 'Too many requests. Please try again later.' },
};

const publicBookingReadLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 400,
});

const publicBookingWriteLimiter = rateLimit({
  ...rateLimitDefaults,
  windowMs: 15 * 60 * 1000,
  max: 60,
  skipFailedRequests: false,
});

const resolveTenant = [setupMainDatabase, setupPublicBusinessByCode];

router.get('/profile', publicBookingReadLimiter, resolveTenant, async (req, res) => {
  try {
    const data = await publicBookingService.formatPublicBusinessProfile(
      req.businessDoc,
      req.businessModels
    );
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('[public-booking] profile', error);
    res.status(500).json({ success: false, error: 'Could not load booking profile.' });
  }
});

router.get('/services', publicBookingReadLimiter, resolveTenant, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const services = await publicBookingService.listPublicServices(
      req.businessModels,
      req.branchId,
      search
    );
    res.json({ success: true, data: { services } });
  } catch (error) {
    logger.error('[public-booking] services', error);
    res.status(500).json({ success: false, error: 'Could not load services.' });
  }
});

router.get('/staff', publicBookingReadLimiter, resolveTenant, async (req, res) => {
  try {
    const staff = await publicBookingService.listPublicBookingStaffForPicker(
      req.businessModels,
      req.branchId
    );
    res.json({ success: true, data: { staff } });
  } catch (error) {
    logger.error('[public-booking] staff list', error);
    res.status(500).json({ success: false, error: 'Could not load staff.' });
  }
});

router.get('/services/:serviceId/staff', publicBookingReadLimiter, resolveTenant, async (req, res) => {
  try {
    const parsed = objectIdHex.safeParse(req.params.serviceId);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid service id.' });
    }
    const { Service } = req.businessModels;
    const service = await Service.findOne({
      _id: parsed.data,
      branchId: req.branchId,
      isActive: { $ne: false },
    }).lean();
    if (!service) {
      return res.status(404).json({ success: false, error: 'Service not found.' });
    }
    const staff = await publicBookingService.listPublicBookingStaffForPicker(
      req.businessModels,
      req.branchId
    );
    res.json({ success: true, data: { staff } });
  } catch (error) {
    logger.error('[public-booking] staff', error);
    res.status(500).json({ success: false, error: 'Could not load staff.' });
  }
});

router.post(
  '/slots',
  publicBookingWriteLimiter,
  resolveTenant,
  validate(publicBookingSlotsBodySchema),
  async (req, res) => {
    try {
      const data = await publicBookingService.computePublicSlots(
        req.businessModels,
        req.businessDoc,
        req.branchId,
        req.body
      );
      res.json({ success: true, data });
    } catch (error) {
      logger.error('[public-booking] slots', error);
      const status = error.code === 'VALIDATION' ? 400 : 500;
      res.status(status).json({
        success: false,
        error:
          status === 400 && error.message
            ? error.message
            : 'Could not load slots.',
      });
    }
  }
);

router.post(
  '/holds',
  publicBookingWriteLimiter,
  resolveTenant,
  validate(publicBookingHoldsBodySchema),
  async (req, res) => {
    try {
      const data = await publicBookingService.createPublicHolds(
        req.businessModels,
        req.businessDoc,
        req.branchId,
        req.body
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      logger.error('[public-booking] holds', error);
      const status =
        error.code === 'VALIDATION' ? 400 : error.code === 'CONFLICT' ? 409 : 500;
      const message =
        status === 409
          ? 'This time slot is no longer available.'
          : status === 400 && error.message
            ? error.message
            : 'Could not hold this slot.';
      res.status(status).json({
        success: false,
        error: message,
      });
    }
  }
);

router.post(
  '/book',
  publicBookingWriteLimiter,
  resolveTenant,
  validate(publicBookingCreateBodySchema),
  async (req, res) => {
    try {
      const result = await publicBookingService.createPublicBooking(
        req.businessModels,
        req.businessDoc,
        req.branchId,
        req.body
      );

      res.status(201).json({
        success: true,
        data: publicBookingService.formatPublicBookResponse(result.timezone),
      });

      setImmediate(async () => {
        try {
          const { Appointment } = req.businessModels;
          const populated = await Appointment.find({ _id: { $in: result.appointmentIds } })
            .populate('clientId', 'name phone email')
            .populate('serviceId', 'name price duration')
            .populate('staffId', 'name role')
            .populate('staffAssignments.staffId', 'name role');
          const fakeReq = {
            businessModels: req.businessModels,
            user: { branchId: req.branchId, name: 'Online booking' },
          };
          await sendAppointmentWhatsAppAfterCreate(fakeReq, populated);
        } catch (waErr) {
          logger.error('[public-booking] WhatsApp after create', waErr);
        }
      });
    } catch (error) {
      logger.error('[public-booking] book', error);
      const status =
        error.code === 'VALIDATION'
          ? 400
          : error.code === 'CONFLICT' || error.code === 'OUTSIDE_AVAILABILITY'
            ? 409
            : 500;
      const message =
        status === 409
          ? 'This time slot is no longer available. Please pick another.'
          : status === 400 && error.message
            ? error.message
            : 'Could not complete booking.';
      res.status(status).json({
        success: false,
        error: message,
      });
    }
  }
);

module.exports = router;
