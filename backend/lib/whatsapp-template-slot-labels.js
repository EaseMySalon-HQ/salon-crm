'use strict';

/** Human-readable labels for WhatsApp notification template slots (tenant + admin UI). */
const WHATSAPP_SLOT_LABELS = Object.freeze({
  appointmentConfirmation: 'Appointment confirmation',
  appointmentReminder: 'Appointment reminder',
  appointmentCancellation: 'Appointment cancellation',
  appointmentReschedule: 'Appointment reschedule',
  appointmentScheduling: 'Appointment scheduling',
  receipt: 'Receipt / bill',
  receiptWithFeedback: 'Receipt with feedback link',
  receiptCancellation: 'Bill cancellation',
  clientWalletTransaction: 'Prepaid wallet transaction',
  clientWalletExpiryReminder: 'Prepaid wallet expiry reminder',
  clientDuesReminder: 'Outstanding dues reminder',
  clientBirthdayReminder: 'Birthday wish',
  welcomeMessage: 'Welcome message',
  businessAccountCreated: 'Business account created',
  default: 'Default / fallback',
});

/** Short helper text shown beside tenant notification toggles. */
const WHATSAPP_SLOT_DESCRIPTIONS = Object.freeze({
  appointmentScheduling: 'Sent when a new appointment is booked (status Scheduled).',
  appointmentConfirmation: 'Sent when appointment status is set to Confirmed.',
  appointmentReminder: 'Sent automatically 2–24 hours before the appointment.',
  appointmentReschedule: 'Sent when an appointment date or time is changed.',
  appointmentCancellation: 'Sent when an appointment is cancelled.',
  receipt: 'Bill link sent after checkout (View Bill button).',
  receiptWithFeedback: 'Bill link with Share Feedback button (Growth / Pro).',
  receiptCancellation: 'Sent when a bill is cancelled or voided.',
  clientWalletTransaction: 'Sent after wallet credit, debit, adjustment, or refund.',
  clientWalletExpiryReminder: 'Sent 30 / 15 / 7 days before wallet expiry.',
  clientDuesReminder: 'Sent every 7 days at 12:00 PM for outstanding bill balance.',
  clientBirthdayReminder: 'Sent once on the client\'s birthday at 12:00 PM.',
  welcomeMessage: 'Sent when a new client is welcomed to your salon.',
  businessAccountCreated: 'Sent when a new business account is created.',
  default: 'Fallback template for generic messages.',
});

/** Internal platform slots — not shown as tenant notification toggles. */
const TENANT_TOGGLE_EXCLUDED_SLOT_KEYS = new Set(['platformLeadWelcome', 'default']);

function getSlotLabel(slotKey) {
  return WHATSAPP_SLOT_LABELS[slotKey] || slotKey;
}

function getSlotDescription(slotKey) {
  return WHATSAPP_SLOT_DESCRIPTIONS[slotKey] || 'WhatsApp message using this approved template.';
}

module.exports = {
  WHATSAPP_SLOT_LABELS,
  WHATSAPP_SLOT_DESCRIPTIONS,
  TENANT_TOGGLE_EXCLUDED_SLOT_KEYS,
  getSlotLabel,
  getSlotDescription,
};
