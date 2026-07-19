'use strict';

/**
 * Auto-configure AdminSettings.notifications.whatsapp.templateVariables[slotKey]
 * from a platform template's stored components — mirrors
 * components/admin/admin-settings/whatsapp-admin-settings.tsx
 * (parse + defaultFields + receipt/appointment button rules).
 */

const APPOINTMENT_SLOT_KEYS = Object.freeze([
  'appointmentScheduling',
  'appointmentConfirmation',
  'appointmentCancellation',
  'appointmentReminder',
  'appointmentReschedule',
]);

/** Default data fields per notification slot (body vars in order). */
const SLOT_DEFAULT_FIELDS = Object.freeze({
  welcomeMessage: ['clientName', 'businessName', 'welcomeMessage'],
  platformLeadWelcome: ['firstName'],
  businessAccountCreated: ['businessName', 'businessCode', 'adminName', 'loginUrl'],
  receipt: ['clientName', 'businessName', 'receiptLink'],
  receiptWithFeedback: ['clientName', 'businessName', 'receiptLink', 'feedbackLink'],
  receiptCancellation: ['clientName', 'receiptNumber', 'businessName', 'cancellationReason'],
  appointmentScheduling: ['clientName', 'serviceName', 'date', 'time', 'businessName', 'googleMapsUrl'],
  appointmentConfirmation: [
    'clientName',
    'serviceName',
    'date',
    'time',
    'staffName',
    'businessName',
    'businessPhone',
    'googleMapsUrl',
  ],
  appointmentCancellation: [
    'clientName',
    'serviceName',
    'date',
    'time',
    'businessName',
    'cancellationReason',
    'googleMapsUrl',
  ],
  appointmentReminder: [
    'clientName',
    'serviceName',
    'date',
    'time',
    'businessName',
    'businessPhone',
    'reminderHours',
    'googleMapsUrl',
  ],
  appointmentReschedule: [
    'clientName',
    'serviceName',
    'date',
    'time',
    'staffName',
    'businessName',
    'businessPhone',
    'googleMapsUrl',
  ],
  clientWalletTransaction: [
    'clientName',
    'planName',
    'businessName',
    'transactionTypeLabel',
    'amountFormatted',
    'balanceAfterFormatted',
  ],
  clientWalletExpiryReminder: [
    'clientName',
    'planName',
    'businessName',
    'daysLeft',
    'expiryDateFormatted',
    'balanceFormatted',
  ],
  default: ['clientName', 'businessName', 'message'],
});

function maxPlaceholderIndex(text) {
  if (!text || typeof text !== 'string') return 0;
  let max = 0;
  const re = /\{\{(\d+)\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function sortVariableNames(vars) {
  return [...vars].sort((a, b) => {
    const at = a.startsWith('button_') ? 1 : 0;
    const bt = b.startsWith('button_') ? 1 : 0;
    if (at !== bt) return at - bt;
    return parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10);
  });
}

/**
 * Detect body_1…body_n and button_1… from stored platform template components.
 */
function detectVariablesFromComponents(components) {
  const allVariables = [];
  const bodyText = components?.body?.text || '';
  const bodyCount = maxPlaceholderIndex(bodyText);
  for (let i = 1; i <= bodyCount; i++) {
    allVariables.push(`body_${i}`);
  }

  const buttons = Array.isArray(components?.buttons) ? components.buttons : [];
  let buttonIdx = 0;
  for (const btn of buttons) {
    if (btn?.type === 'URL' && btn.url && /\{\{\d+\}\}/.test(String(btn.url))) {
      buttonIdx += 1;
      allVariables.push(`button_${buttonIdx}`);
    }
  }

  return sortVariableNames(allVariables);
}

function mapReceiptTemplateButton(slotKey, varName) {
  if (slotKey === 'receiptWithFeedback') {
    const idx = parseInt(String(varName).replace('button_', ''), 10);
    if (idx === 1) return 'receiptLink';
    if (idx === 2) return 'feedbackLink';
    return `button_${idx}`;
  }
  if (slotKey === 'receipt') {
    return 'receiptLink';
  }
  return `button_${String(varName).replace('button_', '')}`;
}

function mapButtonVariable(slotKey, varName) {
  if (slotKey === 'receipt' || slotKey === 'receiptWithFeedback') {
    return mapReceiptTemplateButton(slotKey, varName);
  }
  if (APPOINTMENT_SLOT_KEYS.includes(slotKey)) {
    return 'googleMapsUrl';
  }
  return `button_${String(varName).replace('button_', '')}`;
}

/**
 * Build templateVariables map for a slot from template components.
 * Falls back to default body-only fields when no components are provided.
 */
function buildVariableMappingForSlot(slotKey, components) {
  const defaultFieldList = SLOT_DEFAULT_FIELDS[slotKey] || [];
  const detected = components ? detectVariablesFromComponents(components) : [];
  const allVariables =
    detected.length > 0
      ? detected
      : defaultFieldList.map((_, i) => `body_${i + 1}`);

  const mapping = {};
  for (const varName of allVariables) {
    if (varName.startsWith('body_')) {
      const bodyIndex = parseInt(varName.replace('body_', ''), 10) - 1;
      mapping[varName] = defaultFieldList[bodyIndex] || `variable_${bodyIndex + 1}`;
    } else if (varName.startsWith('button_')) {
      mapping[varName] = mapButtonVariable(slotKey, varName);
    }
  }
  return mapping;
}

/** Legacy shape: { slotKey: { body_1: field, ... } } for all known slots. */
function buildDefaultTemplateVariables() {
  const out = {};
  for (const slotKey of Object.keys(SLOT_DEFAULT_FIELDS)) {
    out[slotKey] = buildVariableMappingForSlot(slotKey, null);
  }
  return out;
}

module.exports = {
  APPOINTMENT_SLOT_KEYS,
  SLOT_DEFAULT_FIELDS,
  detectVariablesFromComponents,
  buildVariableMappingForSlot,
  buildDefaultTemplateVariables,
};
