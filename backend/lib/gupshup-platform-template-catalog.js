'use strict';

/**
 * Platform (shared-number) transactional templates submitted via Gupshup API.
 * elementName → AdminSettings.notifications.whatsapp.templates slot key.
 *
 * Bodies use {{1}}…{{n}} positional vars; keep in sync with
 * whatsapp-admin-settings.tsx defaultFields / whatsapp-service fallbacks.
 */

const PLATFORM_TEMPLATE_CATALOG = Object.freeze([
  {
    slotKey: 'appointmentConfirmation',
    elementName: 'ems_appointment_confirmation',
    category: 'UTILITY',
    language: 'en_US',
    exampleParams: [
      'Priya',
      'Haircut',
      '15 Jul 2026',
      '4:00 PM',
      'Anita',
      'Glow Salon',
      '919876543210',
    ],
    content:
      'Hi {{1}}, your appointment for {{2}} at {{6}} is confirmed on {{3}} at {{4}} with {{5}}. Call {{7}} for changes.',
  },
  {
    slotKey: 'appointmentReminder',
    elementName: 'ems_appointment_reminder',
    category: 'UTILITY',
    language: 'en_US',
    exampleParams: ['Priya', 'Haircut', '15 Jul 2026', '4:00 PM', 'Glow Salon', '919876543210', '2'],
    content:
      'Reminder {{7}}h before: Hi {{1}}, your {{2}} at {{5}} is on {{3}} at {{4}}. Contact {{6}} if you need to reschedule.',
  },
  {
    slotKey: 'appointmentCancellation',
    elementName: 'ems_appointment_cancellation',
    category: 'UTILITY',
    language: 'en_US',
    exampleParams: ['Priya', 'Haircut', '15 Jul 2026', '4:00 PM', 'Glow Salon', 'Client request'],
    content:
      'Hi {{1}}, your {{2}} appointment at {{5}} on {{3}} at {{4}} has been cancelled. Reason: {{6}}.',
  },
  {
    slotKey: 'appointmentReschedule',
    elementName: 'ems_appointment_reschedule',
    category: 'UTILITY',
    language: 'en_US',
    exampleParams: [
      'Priya',
      'Haircut',
      '16 Jul 2026',
      '5:00 PM',
      'Anita',
      'Glow Salon',
      '919876543210',
    ],
    content:
      'Hi {{1}}, your {{2}} at {{6}} has been rescheduled to {{3}} at {{4}} with {{5}}. Call {{7}} for help.',
  },
  {
    slotKey: 'receipt',
    elementName: 'ems_receipt',
    category: 'UTILITY',
    language: 'en_US',
    exampleParams: ['Priya', 'Glow Salon', 'https://example.com/bill/123'],
    content: 'Hi {{1}}, your bill from {{2}} is ready: {{3}}',
  },
  {
    slotKey: 'clientWalletTransaction',
    elementName: 'ems_wallet_transaction',
    category: 'UTILITY',
    language: 'en_US',
    exampleParams: ['Priya', 'Gold Plan', 'Glow Salon', 'Credit', 'Rs 500', 'Rs 1500'],
    content:
      'Hi {{1}}, {{4}} of {{5}} on your {{2}} prepaid wallet at {{3}}. Balance: {{6}}.',
  },
  {
    slotKey: 'clientWalletExpiryReminder',
    elementName: 'ems_wallet_expiry',
    category: 'UTILITY',
    language: 'en_US',
    exampleParams: ['Priya', 'Gold Plan', 'Glow Salon', '7', '31 Jul 2026', 'Rs 1500'],
    content:
      'Hi {{1}}, your {{2}} wallet at {{3}} expires in {{4}} days ({{5}}). Balance: {{6}}.',
  },
  {
    slotKey: 'welcomeMessage',
    elementName: 'ems_welcome',
    category: 'UTILITY',
    language: 'en_US',
    exampleParams: ['Priya', 'Glow Salon', 'Welcome to our salon family!'],
    content: 'Hi {{1}}, welcome to {{2}}! {{3}}',
  },
  {
    slotKey: 'platformLeadWelcome',
    elementName: 'ems_platform_lead_welcome',
    category: 'UTILITY',
    language: 'en_US',
    exampleParams: ['Priya'],
    content:
      '👋 Hi {{1}},\n\nWelcome to EaseMySalon! 💙\n\nThank you for your interest in our salon management software.\n\nWe help salons and spas streamline their entire business with features like:\n✨ Online Appointment Booking\n👥 Client & CRM Management\n💳 Billing & POS\n📱 WhatsApp Automation\n🎁 Memberships & Packages\n💰 Staff Commission & Payroll\n📊 Business Reports & Analytics\n\nOne of our product experts will connect with you shortly to understand your requirements and give you a personalized demo.\n\nLooking forward to helping your salon grow! 🚀\nTeam EaseMySalon',
  },
  {
    slotKey: 'default',
    elementName: 'ems_default',
    category: 'UTILITY',
    language: 'en_US',
    exampleParams: ['Priya', 'Glow Salon', 'Thank you for visiting us.'],
    content: 'Hi {{1}}, message from {{2}}: {{3}}',
  },
]);

function catalogByElementName() {
  const map = new Map();
  for (const entry of PLATFORM_TEMPLATE_CATALOG) {
    map.set(entry.elementName, entry);
  }
  return map;
}

function catalogEntryToApplyPayload(entry) {
  return {
    name: entry.elementName,
    elementName: entry.elementName,
    language: entry.language,
    category: entry.category,
    vertical: 'salon_crm',
    templateType: 'TEXT',
    content: entry.content,
    exampleParams: entry.exampleParams,
    components: {
      body: { text: entry.content, examples: [entry.exampleParams] },
    },
  };
}

const { buildDefaultTemplateVariables: buildDefaultTemplateVariablesFromMapping } = require('./platform-template-variable-mapping');

/** @deprecated use platform-template-variable-mapping directly */
function buildDefaultTemplateVariables() {
  return buildDefaultTemplateVariablesFromMapping();
}

const NOTIFICATION_SLOT_KEYS = [
  'appointmentConfirmation',
  'appointmentReminder',
  'appointmentCancellation',
  'appointmentReschedule',
  'appointmentScheduling',
  'receipt',
  'receiptWithFeedback',
  'receiptCancellation',
  'clientWalletTransaction',
  'clientWalletExpiryReminder',
  'welcomeMessage',
  'platformLeadWelcome',
  'businessAccountCreated',
  'default',
];

module.exports = {
  PLATFORM_TEMPLATE_CATALOG,
  NOTIFICATION_SLOT_KEYS,
  catalogByElementName,
  catalogEntryToApplyPayload,
  buildDefaultTemplateVariables,
};
