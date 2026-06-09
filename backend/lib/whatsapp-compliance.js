/**
 * Compliance / Meta approval booster.
 *
 * Returns a five-tick checklist used by:
 *  - Settings → WhatsApp Integration (status card)
 *  - Campaigns step builder (pre-send precondition)
 *
 * Each tick is a structured object so the UI can deep-link to where the salon
 * fixes the gap.
 */

'use strict';

const databaseManager = require('../config/database-manager');
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
    rateLimited: tick(true, 'Send pipeline batches at safe Meta rate limits', null, null),
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
    wabaConnected: tick(false, 'WABA connected (Meta Cloud API)', null, '/settings?section=whatsapp-integration'),
  };

  try {
    const { Account, Template } = await getModels();
    const account = await Account.findOne({ businessId }).lean();
    if (account && account.status === 'connected') {
      items.wabaConnected = tick(true, 'WABA connected (Meta Cloud API)');
    } else {
      items.wabaConnected = tick(
        false,
        'WABA connected (Meta Cloud API)',
        'Click "Connect WhatsApp" in Settings to start Embedded Signup.',
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
        'Submit a template to Meta and wait for approval.',
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
