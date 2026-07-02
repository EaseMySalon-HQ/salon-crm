'use strict';

/**
 * Public marketing demo / contact form → PlatformLead (admin Lead Management).
 * No auth; rate-limited; CSRF skipped via /api/public/demo-lead prefix.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { setupMainDatabase } = require('../middleware/business-db');
const { logger } = require('../utils/logger');
const { validate } = require('../middleware/validate');
const { publicDemoLeadSchema } = require('../validation/schemas');
const { notifyPlatformAdminsPendingLead } = require('../lib/notify-platform-leads-pending');
const { normalizeLeadContact } = require('../lib/platform-lead-contact');

const router = express.Router();

const publicDemoLeadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many submissions. Please try again later.' },
});

/** Strip to last 10 digits (India mobile). */
function normalizeIndianPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

router.post(
  '/',
  publicDemoLeadLimiter,
  setupMainDatabase,
  validate(publicDemoLeadSchema),
  async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        phone,
        email,
        salon,
        city,
        branches,
        staffCount,
        preferredTime,
        message,
        services,
        website,
      } = req.body;

      // Honeypot — bots only
      if (website && String(website).trim()) {
        return res.json({ success: true, data: { id: null } });
      }

      const normalizedPhone = normalizeIndianPhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({
          success: false,
          error: 'Enter a valid 10-digit phone number',
        });
      }

      const { PlatformLead, PlatformLeadActivity } = req.mainModels;

      const contact = normalizeLeadContact({ firstName, lastName });
      if (!contact.firstName) {
        return res.status(400).json({
          success: false,
          error: 'First name is required',
        });
      }

      const salonName = String(salon || '').trim();
      const cityName = String(city || '').trim();
      const branchCount = branches != null ? String(branches).trim() : '';
      const staffCountValue = staffCount != null ? String(staffCount).trim() : '';
      const preferredDemoTime = preferredTime != null ? String(preferredTime).trim() : '';
      const demoNotes = String(message || '').trim();
      const interestedServices = Array.isArray(services)
        ? [...new Set(services.map((s) => String(s).trim()).filter(Boolean))]
        : [];

      const existing = await PlatformLead.findOne({
        phone: normalizedPhone,
        status: { $in: ['new', 'follow-up'] },
      }).sort({ createdAt: -1 });

      if (existing) {
        const appendNote = [
          demoNotes ? `Demo request: ${demoNotes}` : '',
          preferredDemoTime ? `Preferred time: ${preferredDemoTime}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        if (appendNote) {
          existing.notes = [existing.notes, appendNote].filter(Boolean).join('\n\n');
        }
        if (salonName && !existing.salonName) existing.salonName = salonName;
        if (cityName && !existing.city) existing.city = cityName;
        if (branchCount && !existing.branchCount) existing.branchCount = branchCount;
        if (staffCountValue && !existing.staffCount) existing.staffCount = staffCountValue;
        if (preferredDemoTime) existing.preferredDemoTime = preferredDemoTime;
        if (contact.firstName) existing.firstName = contact.firstName;
        if (contact.lastName) existing.lastName = contact.lastName;
        if (contact.name) existing.name = contact.name;
        if (email && !existing.email) existing.email = String(email).trim().toLowerCase();
        if (interestedServices.length > 0) {
          existing.interestedServices = [
            ...new Set([...(existing.interestedServices || []), ...interestedServices]),
          ];
        }
        await existing.save();

        await PlatformLeadActivity.create({
          leadId: existing._id,
          activityType: 'updated',
          performedByName: 'Website demo form',
          description: 'Repeat demo booking from website',
          details: { preferredDemoTime, demoNotes, interestedServices, staffCount: staffCountValue },
        });

        return res.json({
          success: true,
          data: { id: existing._id, updated: true },
        });
      }

      const newLead = new PlatformLead({
        firstName: contact.firstName,
        lastName: contact.lastName,
        name: contact.name,
        salonName,
        city: cityName,
        branchCount,
        staffCount: staffCountValue,
        preferredDemoTime,
        phone: normalizedPhone,
        email: email ? String(email).trim().toLowerCase() : undefined,
        source: 'website',
        status: 'new',
        interestedServices,
        notes: demoNotes,
      });

      const savedLead = await newLead.save();

      await PlatformLeadActivity.create({
        leadId: savedLead._id,
        activityType: 'created',
        performedByName: 'Website demo form',
        newValue: {
          name: savedLead.name,
          salonName: savedLead.salonName,
          phone: savedLead.phone,
          source: 'website',
        },
        description: 'Lead created from website demo form',
        details: {
          city: cityName,
          branchCount,
          staffCount: staffCountValue,
          preferredDemoTime,
          demoNotes,
          interestedServices,
        },
      });

      notifyPlatformAdminsPendingLead(req.mainModels, savedLead);

      res.status(201).json({
        success: true,
        data: { id: savedLead._id, updated: false },
      });
    } catch (error) {
      logger.error('Public demo lead error:', error);
      res.status(500).json({ success: false, error: 'Could not save your request. Please try again.' });
    }
  }
);

module.exports = router;
