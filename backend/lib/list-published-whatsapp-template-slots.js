'use strict';

const { TENANT_TOGGLE_EXCLUDED_SLOT_KEYS, getSlotLabel, getSlotDescription } = require('./whatsapp-template-slot-labels');

async function getPlatformTemplateModel() {
  const databaseManager = require('../config/database-manager');
  const main = await databaseManager.getMainConnection();
  return main.model('PlatformWhatsAppTemplate', require('../models/PlatformWhatsAppTemplate').schema);
}

/**
 * Approved platform templates published to the tenant library, deduped by slotKey.
 * @returns {Promise<Array<{ slotKey: string, templateName: string, category: string, language: string, label: string, description: string }>>}
 */
async function listPublishedWhatsappTemplateSlots() {
  const PlatformTemplate = await getPlatformTemplateModel();
  const rows = await PlatformTemplate.find({
    status: 'approved',
    publishedToTenantLibrary: { $ne: false },
    slotKey: { $nin: [null, '', ...TENANT_TOGGLE_EXCLUDED_SLOT_KEYS] },
  })
    .sort({ slotKey: 1, updatedAt: -1 })
    .lean();

  const bySlot = new Map();
  for (const row of rows) {
    const slotKey = String(row.slotKey || '').trim();
    if (!slotKey || TENANT_TOGGLE_EXCLUDED_SLOT_KEYS.has(slotKey)) continue;
    if (bySlot.has(slotKey)) continue;
    bySlot.set(slotKey, {
      slotKey,
      templateName: row.name,
      category: row.category,
      language: row.language,
      label: getSlotLabel(slotKey),
      description: getSlotDescription(slotKey),
    });
  }

  return [...bySlot.values()].sort((a, b) => a.label.localeCompare(b.label));
}

module.exports = {
  listPublishedWhatsappTemplateSlots,
};
