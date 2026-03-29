/**
 * package-notification-service.js
 *
 * Sends package lifecycle notifications via SMS, Email, and WhatsApp.
 * Reuses existing email-service.js, sms-service.js, whatsapp-service.js —
 * no new notification infrastructure is introduced.
 */

const { logger } = require('../utils/logger');
const emailService = require('./email-service');
const smsService = require('./sms-service');
const whatsappService = require('./whatsapp-service');

// ── Message templates ────────────────────────────────────────────────────────

const MESSAGES = {
  EXPIRY_7D: (name, packageName, salonName) =>
    `Hi ${name}, your ${packageName} at ${salonName} expires in 7 days. Book your session before it lapses.`,

  EXPIRY_3D: (name, packageName, salonName) =>
    `Hi ${name}, only 3 days left on your ${packageName} at ${salonName}. Don't miss out — book now.`,

  EXPIRY_1D: (name, packageName, salonName) =>
    `Hi ${name}, your ${packageName} at ${salonName} expires TOMORROW. Book your session today.`,

  LOW_BALANCE: (name, packageName, salonName) =>
    `Hi ${name}, only 1 sitting left on your ${packageName} at ${salonName}. Consider renewing today.`,

  EXPIRED: (name, packageName, salonName) =>
    `Hi ${name}, your ${packageName} at ${salonName} has expired. Repurchase to continue enjoying your services.`
};

// ── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Send a package notification to a client across all enabled channels.
 * Logs each attempt to PackageNotification collection.
 *
 * @param {object} client           - Mongoose Client document (needs name, phone, email)
 * @param {object} clientPackage    - Mongoose ClientPackage document (needs package_id.name)
 * @param {string} type             - EXPIRY_7D | EXPIRY_3D | EXPIRY_1D | LOW_BALANCE | EXPIRED
 * @param {string} salonName        - Business name for branding
 * @param {Model}  PackageNotificationModel - tenant-scoped model
 */
async function sendPackageNotification(
  client,
  clientPackage,
  type,
  salonName,
  PackageNotificationModel
) {
  const packageName = clientPackage.package_id?.name || 'your package';
  const clientName = client.name || 'Valued Client';
  const messageBuilder = MESSAGES[type];

  if (!messageBuilder) {
    logger.warn(`[PackageNotification] Unknown notification type: ${type}`);
    return;
  }

  const message = messageBuilder(clientName, packageName, salonName);
  const channels = ['SMS', 'EMAIL', 'WHATSAPP'];

  for (const channel of channels) {
    const log = await PackageNotificationModel.create({
      branchId: clientPackage.branchId,
      client_package_id: clientPackage._id,
      client_id: client._id,
      type,
      channel,
      status: 'PENDING'
    });

    try {
      if (channel === 'SMS' && client.phone) {
        await smsService.initialize();
        if (smsService.enabled) {
          await smsService.sendRaw(client.phone, message);
          await PackageNotificationModel.findByIdAndUpdate(log._id, {
            status: 'SENT',
            sent_at: new Date()
          });
        } else {
          await PackageNotificationModel.findByIdAndUpdate(log._id, { status: 'FAILED' });
        }
      } else if (channel === 'EMAIL' && client.email) {
        await emailService.initialize();
        if (emailService.enabled) {
          await emailService.sendEmail({
            to: client.email,
            subject: `Package Update — ${salonName}`,
            text: message,
            html: `<p>${message}</p>`
          });
          await PackageNotificationModel.findByIdAndUpdate(log._id, {
            status: 'SENT',
            sent_at: new Date()
          });
        } else {
          await PackageNotificationModel.findByIdAndUpdate(log._id, { status: 'FAILED' });
        }
      } else if (channel === 'WHATSAPP' && client.phone) {
        await whatsappService.initialize();
        if (whatsappService.enabled) {
          await whatsappService.sendMessage(client.phone, message);
          await PackageNotificationModel.findByIdAndUpdate(log._id, {
            status: 'SENT',
            sent_at: new Date()
          });
        } else {
          await PackageNotificationModel.findByIdAndUpdate(log._id, { status: 'FAILED' });
        }
      } else {
        // Channel not applicable (missing phone/email) — mark as failed silently
        await PackageNotificationModel.findByIdAndUpdate(log._id, { status: 'FAILED' });
      }
    } catch (err) {
      logger.error(`[PackageNotification] Failed to send ${channel} for type ${type}:`, err.message);
      await PackageNotificationModel.findByIdAndUpdate(log._id, { status: 'FAILED' }).catch(() => {});
    }
  }
}

module.exports = { sendPackageNotification };
