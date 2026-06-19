'use strict';

/**
 * Tenant appointment / online booking settings (main Business document for current branch).
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase } = require('../middleware/business-db');
const { requirePermission } = require('../middleware/permissions');
const { validate } = require('../middleware/validate');
const { appointmentSettingsUpdateBodySchema } = require('../validation/schemas');
const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');
const { sanitizeBookingHeroTheme } = require('../lib/booking-hero-themes');
const { hasFeature } = require('../lib/entitlements');

const router = express.Router();

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function normalizeHours(operatingHours) {
  const src = operatingHours || {};
  const out = {};
  for (const day of DAYS) {
    const d = src[day] || {};
    out[day] = {
      open: d.open || '09:00',
      close: d.close || '18:00',
      closed: d.closed === true,
    };
  }
  return out;
}

function formatResponse(business) {
  const appt = business.settings?.appointmentSettings || {};
  let slotDuration = Number(appt.slotDuration);
  if (slotDuration !== 15 && slotDuration !== 30) slotDuration = 30;

  const publicBookingService = require('../services/scheduling/public-booking-service');
  const planAllowsOnlineBooking = hasFeature(business, 'online_booking');

  return {
    code: business.code,
    name: business.name,
    timezone: business.settings?.timezone || 'Asia/Kolkata',
    allowOnlineBooking: planAllowsOnlineBooking && appt.allowOnlineBooking === true,
    onlineBookingAvailable: planAllowsOnlineBooking,
    slotDuration,
    advanceBookingDays: Number(appt.advanceBookingDays) > 0 ? Number(appt.advanceBookingDays) : 30,
    bufferTime: Number(appt.bufferTime) >= 0 ? Number(appt.bufferTime) : 15,
    cancellationWindowHours:
      Number(appt.cancellationWindowHours) >= 0 ? Number(appt.cancellationWindowHours) : 24,
    operatingHours: normalizeHours(business.settings?.operatingHours),
    bookingTagline: String(appt.bookingTagline || '').trim(),
    showcaseImages: publicBookingService.sanitizeShowcaseImages(appt.showcaseImages),
    bookingHeroTheme: sanitizeBookingHeroTheme(appt.bookingHeroTheme),
  };
}

async function loadBusiness(branchId) {
  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  return Business.findById(branchId);
}

router.get('/', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    const branchId = req.user?.branchId;
    if (!branchId) {
      return res.status(400).json({ success: false, error: 'Business context not found' });
    }
    const business = await loadBusiness(branchId);
    if (!business) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }
    res.json({ success: true, data: formatResponse(business) });
  } catch (error) {
    logger.error('[settings/appointments] GET', error);
    res.status(500).json({ success: false, error: 'Failed to load appointment settings' });
  }
});

router.put(
  '/',
  authenticateToken,
  setupBusinessDatabase,
  requirePermission('appointment_settings', 'edit'),
  validate(appointmentSettingsUpdateBodySchema),
  async (req, res) => {
    try {
      const branchId = req.user?.branchId;
      if (!branchId) {
        return res.status(400).json({ success: false, error: 'Business context not found' });
      }

      const business = await loadBusiness(branchId);
      if (!business) {
        return res.status(404).json({ success: false, error: 'Business not found' });
      }

      business.settings = business.settings || {};
      business.settings.appointmentSettings = business.settings.appointmentSettings || {};

      const body = req.body;
      if (body.allowOnlineBooking != null) {
        if (body.allowOnlineBooking === true && !hasFeature(business, 'online_booking')) {
          return res.status(403).json({
            success: false,
            error: 'Online booking is not included in your current plan.',
            code: 'PLAN_FEATURE_REQUIRED',
            feature: 'online_booking',
          });
        }
        business.settings.appointmentSettings.allowOnlineBooking = body.allowOnlineBooking === true;
      }
      if (body.slotDuration != null) {
        business.settings.appointmentSettings.slotDuration = body.slotDuration;
      }
      if (body.advanceBookingDays != null) {
        business.settings.appointmentSettings.advanceBookingDays = body.advanceBookingDays;
      }
      if (body.bufferTime != null) {
        business.settings.appointmentSettings.bufferTime = body.bufferTime;
      }
      if (body.cancellationWindowHours != null) {
        business.settings.appointmentSettings.cancellationWindowHours = body.cancellationWindowHours;
      }
      if (body.operatingHours != null) {
        business.settings.operatingHours = normalizeHours({
          ...(business.settings.operatingHours || {}),
          ...body.operatingHours,
        });
      }
      if (body.bookingTagline != null) {
        business.settings.appointmentSettings.bookingTagline = String(body.bookingTagline).trim();
      }
      if (body.showcaseImages != null) {
        const publicBookingService = require('../services/scheduling/public-booking-service');
        business.settings.appointmentSettings.showcaseImages =
          publicBookingService.sanitizeShowcaseImages(body.showcaseImages);
      }
      if (body.bookingHeroTheme != null) {
        business.settings.appointmentSettings.bookingHeroTheme = sanitizeBookingHeroTheme(
          body.bookingHeroTheme
        );
      }

      await business.save();
      res.json({ success: true, data: formatResponse(business) });
    } catch (error) {
      logger.error('[settings/appointments] PUT', error);
      res.status(500).json({ success: false, error: 'Failed to save appointment settings' });
    }
  }
);

module.exports = router;
