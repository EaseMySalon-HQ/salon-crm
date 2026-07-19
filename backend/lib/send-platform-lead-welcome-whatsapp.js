'use strict';

/**
 * Send the platform welcome WhatsApp template to a new PlatformLead prospect
 * via the shared Gupshup platform app (businessId: null).
 */

const gupshupConfig = require('./gupshup-config');
const { logger } = require('../utils/logger');

function isPlatformLeadWelcomeEnabled(settings) {
  if (process.env.PLATFORM_LEAD_WELCOME_WHATSAPP_ENABLED === 'false') return false;
  if (settings?.notifications?.whatsapp?.enabled !== true) return false;
  const prefs = settings?.notifications?.whatsapp?.platformLeadWelcomeNotifications;
  if (prefs && prefs.enabled === false) return false;
  return true;
}

/** Normalize platform lead phone (stored as 10-digit local) to 91-prefixed digits. */
function normalizePlatformLeadPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length >= 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

function resolveLeadFirstName(lead) {
  const first = String(lead?.firstName || '').trim();
  if (first) return first;
  const name = String(lead?.name || '').trim();
  if (!name) return 'there';
  return name.split(/\s+/).filter(Boolean)[0] || 'there';
}

/**
 * Fire-and-forget welcome WhatsApp for a newly created platform lead.
 *
 * @param {object} mainModels - req.mainModels from setupMainDatabase
 * @param {object} lead - saved PlatformLead document or plain object
 */
function sendPlatformLeadWelcomeWhatsApp(mainModels, lead) {
  if (!lead?.phone) return;

  setImmediate(async () => {
    try {
      const { AdminSettings } = mainModels;
      const settings = await AdminSettings.getSettings();
      if (!isPlatformLeadWelcomeEnabled(settings)) {
        logger.debug('[platform-lead-welcome] Skipped (disabled)');
        return;
      }

      const platformOk = await gupshupConfig.isPlatformConfiguredAsync();
      if (!platformOk) {
        logger.warn('[platform-lead-welcome] Platform Gupshup app not configured');
        return;
      }

      const wa = settings.notifications?.whatsapp || {};
      const templateId = String(wa.templates?.platformLeadWelcome || '').trim();
      if (!templateId) {
        logger.warn(
          '[platform-lead-welcome] No template configured — import/submit ems_platform_lead_welcome and map to Platform lead welcome'
        );
        return;
      }

      const to = normalizePlatformLeadPhone(lead.phone);
      if (!to || to.length < 12) {
        logger.warn('[platform-lead-welcome] Invalid phone for lead %s', lead._id);
        return;
      }

      const whatsappService = require('../services/whatsapp-service');
      if (!whatsappService.initialized) {
        await whatsappService.initialize();
      }
      if (whatsappService.isQuietHours(wa.quietHours)) {
        logger.debug('[platform-lead-welcome] Quiet hours active — skipping');
        return;
      }

      const firstName = resolveLeadFirstName(lead);
      const { sendPlatformTemplateMessage } = require('./platform-whatsapp-send');
      const result = await sendPlatformTemplateMessage({
        to,
        templateId,
        params: [firstName],
        platformLeadId: lead._id,
        category: 'utility',
        intent: 'platform_lead_welcome',
      });

      if (!result.success) {
        const errMsg = result.error || 'send failed';
        logger.warn('[platform-lead-welcome] Failed for lead %s: %s', lead._id, errMsg);
        return;
      }

      logger.info('[platform-lead-welcome] Sent to lead %s (%s)', lead._id, to);
    } catch (err) {
      logger.error('[platform-lead-welcome] Error:', err);
    }
  });
}

module.exports = {
  sendPlatformLeadWelcomeWhatsApp,
  isPlatformLeadWelcomeEnabled,
  normalizePlatformLeadPhone,
  resolveLeadFirstName,
};
