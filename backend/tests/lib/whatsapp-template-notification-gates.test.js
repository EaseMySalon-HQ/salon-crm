'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  getLegacyEnabledForSlot,
  syncLegacyFromTemplateNotifications,
  buildTemplateNotificationsFromSettings,
} = require('../../lib/whatsapp-template-notification-sync');
const { isTenantTemplateNotificationEnabled, isTenantReceiptNotificationEnabled } = require('../../lib/whatsapp-template-notification-gates');

describe('whatsapp template notification sync', () => {
  it('reads legacy appointment confirmation toggle', () => {
    const settings = {
      enabled: true,
      appointmentNotifications: { enabled: true, confirmations: false },
    };
    assert.equal(getLegacyEnabledForSlot(settings, 'appointmentConfirmation'), false);
  });

  it('syncs templateNotifications to legacy appointment fields', () => {
    const settings = {
      enabled: true,
      templateNotifications: {
        appointmentConfirmation: { enabled: false },
        appointmentReminder: { enabled: true },
      },
      appointmentNotifications: { enabled: true, confirmations: true, reminders: true },
    };
    syncLegacyFromTemplateNotifications(settings);
    assert.equal(settings.appointmentNotifications.confirmations, false);
    assert.equal(settings.appointmentNotifications.reminders, true);
  });

  it('uses templateNotifications when present for send gate', () => {
    const settings = {
      enabled: true,
      templateNotifications: { clientDuesReminder: { enabled: false } },
      clientDuesReminderNotifications: { enabled: true },
    };
    assert.equal(isTenantTemplateNotificationEnabled(settings, 'clientDuesReminder'), false);
  });

  it('falls back to legacy receipt toggle', () => {
    const settings = {
      enabled: true,
      receiptNotifications: { enabled: false, includeFeedbackLink: true },
    };
    assert.equal(isTenantReceiptNotificationEnabled(settings, { includeFeedbackLink: false }), false);
  });
});
