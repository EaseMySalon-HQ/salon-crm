/**
 * Compliance checklist for WhatsApp campaigns and integration status.
 *
 * Gupshup is available when the salon has connected its own app OR the
 * platform shared number is configured.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const gupshupConfig = require('./gupshup-config');
const { logger } = require('../utils/logger');

async function getModels() {
  const mainConnection = await databaseManager.getMainConnection();
  return {
    Account: mainConnection.model(
      'WhatsAppAccount',
      require('../models/WhatsAppAccount').schema
    ),
    Template: mainConnection.model(
      'WhatsAppTemplate',
      require('../models/WhatsAppTemplate').schema
    ),
  };
}

function tick(ok, label, hint, fixHref) {
  return { ok: Boolean(ok), label, hint: hint || null, fixHref: fixHref || null };
}

/**
 * @param {string|object} businessId
 * @returns {Promise<{ allOk: boolean, items: Array }>}
 */
async function getComplianceState(businessId) {
  const items = {
    optInOnly: tick(
      true,
      'Marketing only sends to opted-in clients',
      'Campaigns automatically filter recipients by `whatsappConsent.optedIn`.',
      '/whatsapp/campaigns'
    ),
    templatesApproved: tick(false, 'At least one approved template available', null, '/whatsapp/templates'),
    rateLimited: tick(true, 'Send pipeline batches at safe rate limits', null, null),
    optOutSupported: tick(
      true,
      'Inbound STOP / UNSUBSCRIBE auto opts-out the client',
      null,
      '/clients'
    ),
    logsVisible: tick(
      true,
      'Every send and webhook event is logged for audit',
      null,
      '/reports?tab=messages'
    ),
    wabaConnected: tick(false, 'WhatsApp sender available (Gupshup)', null, '/settings?section=whatsapp-integration'),
  };

  try {
    const { Account, Template } = await getModels();
    const account = await Account.findOne({ businessId }).lean();
    const salonConnected = gupshupConfig.isBusinessAppUsable(account);
    const platform = await gupshupConfig.loadPlatformConfig();
    const platformAvailable = Boolean(platform.appId && platform.source);

    if (salonConnected) {
      items.wabaConnected = tick(true, 'Your Gupshup app is connected');
    } else if (platformAvailable) {
      items.wabaConnected = tick(
        true,
        'Using shared platform WhatsApp number',
        'Connect your own Gupshup app in Settings to send from your business number.',
        '/settings?section=whatsapp-integration'
      );
    } else {
      items.wabaConnected = tick(
        false,
        'WhatsApp sender available (Gupshup)',
        'Connect your Gupshup app in Settings, or ask your administrator to configure the shared platform number.',
        '/settings?section=whatsapp-integration'
      );
    }

    const approvedCount = await Template.countDocuments({ businessId, status: 'approved' });
    if (approvedCount > 0) {
      items.templatesApproved = tick(
        true,
        `${approvedCount} approved template${approvedCount === 1 ? '' : 's'}`
      );
    } else {
      items.templatesApproved = tick(
        false,
        'At least one approved template available',
        'Create and submit a template for Gupshup approval.',
        '/whatsapp/templates'
      );
    }
  } catch (err) {
    logger.warn('[whatsapp-compliance] could not load state:', err?.message || err);
  }

  const ordered = [
    items.wabaConnected,
    items.templatesApproved,
    items.optInOnly,
    items.optOutSupported,
    items.rateLimited,
    items.logsVisible,
  ];
  const allOk = ordered.every((it) => it.ok);

  return { allOk, items: ordered };
}

module.exports = { getComplianceState };
