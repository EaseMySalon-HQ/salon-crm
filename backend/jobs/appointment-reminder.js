/**
 * Cron job: Send WhatsApp appointment reminders for upcoming appointments.
 *
 * Runs every 30 minutes. For each active business it:
 *  1. Checks admin + business-level WhatsApp gates and reminder toggles
 *  2. Finds appointments starting within the next 2–24 hours (configurable)
 *     that haven't already received a reminder (reminderSentAt is null)
 *  3. Sends the appointmentReminder MSG91 template via whatsapp-service
 *  4. Stamps reminderSentAt on each appointment so it's never sent twice
 *  5. Logs to WhatsAppMessageLog and increments quota
 */

const cron = require('node-cron');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { isAdminAppointmentNotificationsEnabled } = require('../lib/whatsapp-admin-gates');
const { getWhatsAppSettingsWithDefaults } = require('../lib/whatsapp-settings-defaults');
const { canUseAddon } = require('../lib/entitlements');

const ACTIVE_STATUSES = ['scheduled', 'confirmed'];
const DEFAULT_REMINDER_HOURS = 24;

async function runAppointmentReminders() {
  let whatsappService;
  try {
    whatsappService = require('../services/whatsapp-service');
    await whatsappService.initialize();
    if (!whatsappService.enabled) {
      logger.debug('[AppointmentReminder] WhatsApp service disabled — skipping');
      return;
    }
  } catch (err) {
    logger.error('[AppointmentReminder] Failed to initialize WhatsApp service:', err);
    return;
  }

  const mainConnection = await databaseManager.getMainConnection();
  const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

  const adminSettings = await AdminSettings.getSettings();
  const whatsappEnabled = adminSettings?.notifications?.whatsapp?.enabled === true;
  const adminApptEnabled = isAdminAppointmentNotificationsEnabled(adminSettings?.notifications?.whatsapp);
  if (!whatsappEnabled || !adminApptEnabled) {
    logger.debug('[AppointmentReminder] Admin WhatsApp or appointment notifications disabled');
    return;
  }

  const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
  if (whatsappService.isQuietHours(quietHours)) {
    logger.debug('[AppointmentReminder] Quiet hours active — skipping');
    return;
  }

  const templateId = whatsappService.getTemplateId('appointmentReminder');
  if (!templateId || !String(templateId).trim()) {
    logger.debug('[AppointmentReminder] No appointmentReminder template configured — skipping');
    return;
  }

  const businesses = await Business.find({ status: 'active' }).lean();
  logger.info(`[AppointmentReminder] Checking ${businesses.length} active businesses`);

  let totalSent = 0;

  for (const business of businesses) {
    try {
      if (!canUseAddon(business, 'whatsapp')) continue;

      const rawWs = business.settings?.whatsappNotificationSettings;
      const ws = getWhatsAppSettingsWithDefaults(rawWs);
      if (!ws.enabled) continue;
      if (!ws.appointmentNotifications?.enabled) continue;
      if (!ws.appointmentNotifications?.reminders) continue;

      const businessDb = await databaseManager.getConnection(business._id, mainConnection);
      const businessModels = modelFactory.createBusinessModels(businessDb);
      const { Appointment, Client, Service, Staff, BusinessSettings } = businessModels;

      const now = new Date();
      const windowStart = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const windowEnd = new Date(now.getTime() + DEFAULT_REMINDER_HOURS * 60 * 60 * 1000);

      const appointments = await Appointment.find({
        branchId: business._id,
        status: { $in: ACTIVE_STATUSES },
        reminderSentAt: null,
        startAt: { $gte: windowStart, $lte: windowEnd }
      }).lean();

      if (!appointments.length) continue;

      const clientIds = [...new Set(appointments.map(a => a.clientId).filter(Boolean))];
      const serviceIds = [...new Set(appointments.map(a => a.serviceId).filter(Boolean))];
      const staffIds = [...new Set(
        appointments.flatMap(a => {
          const ids = [];
          if (a.staffId) ids.push(a.staffId);
          (a.staffAssignments || []).forEach(sa => { if (sa.staffId) ids.push(sa.staffId); });
          return ids;
        })
      )];

      const [clients, services, staffMembers, bizSettings] = await Promise.all([
        Client.find({ _id: { $in: clientIds } }).select('name phone').lean(),
        Service.find({ _id: { $in: serviceIds } }).select('name').lean(),
        Staff.find({ _id: { $in: staffIds } }).select('name').lean(),
        BusinessSettings ? BusinessSettings.findOne().lean().catch(() => null) : null
      ]);

      const clientMap = new Map(clients.map(c => [String(c._id), c]));
      const serviceMap = new Map(services.map(s => [String(s._id), s]));
      const staffMap = new Map(staffMembers.map(s => [String(s._id), s]));
      const googleMapsUrl = bizSettings?.googleMapsUrl || '';

      for (const apt of appointments) {
        const client = clientMap.get(String(apt.clientId));
        if (!client?.phone) continue;

        const service = apt.serviceId ? serviceMap.get(String(apt.serviceId)) : null;

        let staffName = 'Not assigned';
        if (apt.staffId) {
          const s = staffMap.get(String(apt.staffId));
          if (s) staffName = s.name;
        } else if (apt.staffAssignments?.length) {
          const first = apt.staffAssignments[0];
          const s = first?.staffId ? staffMap.get(String(first.staffId)) : null;
          if (s) staffName = s.name;
        }

        const hoursUntil = Math.round((new Date(apt.startAt).getTime() - now.getTime()) / (1000 * 60 * 60));

        try {
          const result = await whatsappService.sendAppointmentReminder({
            to: client.phone,
            clientName: client.name || 'Customer',
            appointmentData: {
              serviceName: service?.name || 'Service',
              date: apt.date,
              time: apt.time,
              staffName,
              businessName: business.name,
              businessPhone: business.contact?.phone || '',
              googleMapsUrl
            },
            reminderHours: hoursUntil
          });

          await Appointment.updateOne({ _id: apt._id }, { $set: { reminderSentAt: new Date() } });

          await WhatsAppMessageLog.create({
            businessId: business._id,
            recipientPhone: client.phone,
            messageType: 'appointment_reminder',
            status: result.success ? 'sent' : 'failed',
            msg91Response: result.data || null,
            relatedEntityId: apt._id,
            relatedEntityType: 'Appointment',
            error: result.error || null,
            timestamp: new Date()
          });

          if (result.success) {
            await Business.updateOne(
              { _id: business._id },
              { $inc: { 'plan.addons.whatsapp.used': 1 } }
            );
            totalSent++;
          } else {
            logger.error(`[AppointmentReminder] Failed for ${client.phone}:`, result.error);
          }
        } catch (sendErr) {
          logger.error(`[AppointmentReminder] Error sending to ${client.phone}:`, sendErr.message);
        }
      }
    } catch (bizErr) {
      logger.error(`[AppointmentReminder] Error processing business ${business.name}:`, bizErr.message);
    }
  }

  logger.info(`[AppointmentReminder] Done — sent ${totalSent} reminders`);
}

function setupAppointmentReminderJob() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await runAppointmentReminders();
    } catch (err) {
      logger.error('[AppointmentReminder] Unhandled error in cron:', err);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  logger.info('[AppointmentReminder] Scheduled — runs every 30 minutes IST');
}

module.exports = { setupAppointmentReminderJob, runAppointmentReminders };
