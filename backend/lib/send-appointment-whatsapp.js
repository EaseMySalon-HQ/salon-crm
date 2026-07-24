const { logger } = require('../utils/logger');
const { isAdminAppointmentNotificationsEnabled } = require('./whatsapp-admin-gates');
const { getWhatsAppSettingsWithDefaults } = require('./whatsapp-settings-defaults');
const { canUseAddon } = require('./entitlements');
const { canDeductWhatsApp, deductWhatsApp } = require('./wallet-deduction');

async function resolveAppointmentClient(Client, appointment) {
  if (appointment.clientId && typeof appointment.clientId === 'object') {
    return appointment.clientId;
  }
  const clientId = appointment.clientId?._id || appointment.clientId;
  if (!clientId) return null;
  return Client.findById(clientId);
}

async function resolveAppointmentServiceName(Service, appointment) {
  if (!appointment.serviceId) return 'Service';
  if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) {
    return appointment.serviceId.name;
  }
  if (!Service) return 'Service';
  const service = await Service.findById(appointment.serviceId);
  return service?.name || 'Service';
}

async function resolveAppointmentStaffName(Staff, appointment) {
  if (appointment.staffId) {
    if (typeof appointment.staffId === 'object' && appointment.staffId.name) {
      return appointment.staffId.name;
    }
    const staff = await Staff.findById(appointment.staffId);
    return staff?.name || 'Not assigned';
  }
  if (appointment.staffAssignments?.length > 0) {
    const firstAssignment = appointment.staffAssignments[0];
    if (firstAssignment.staffId && typeof firstAssignment.staffId === 'object' && firstAssignment.staffId.name) {
      return firstAssignment.staffId.name;
    }
    if (firstAssignment.staffId) {
      const staff = await Staff.findById(firstAssignment.staffId);
      return staff?.name || 'Not assigned';
    }
  }
  return 'Not assigned';
}

async function recordAppointmentWhatsAppSend({
  Business,
  WhatsAppMessageLog,
  business,
  appointment,
  client,
  result,
  messageType,
  walletMessageType,
  walletDescription,
}) {
  await WhatsAppMessageLog.create({
    businessId: business._id,
    recipientPhone: client.phone,
    messageType,
    status: result.success ? 'sent' : 'failed',
    msg91Response: result.data || null,
    relatedEntityId: appointment._id,
    relatedEntityType: 'Appointment',
    error: result.error || null,
    timestamp: new Date(),
  });

  if (!result.success) {
    logger.error(`❌ Failed to send appointment WhatsApp (${messageType}) to ${client.phone}:`, result.error);
    return;
  }

  try {
    const freshBusiness = await Business.findById(business._id).lean();
    const useAddon = canUseAddon(freshBusiness, 'whatsapp');
    const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, walletMessageType);
    if (useWallet) {
      await deductWhatsApp(business._id, walletMessageType, {
        description: walletDescription,
        relatedEntity: { id: appointment._id, type: 'Appointment' },
      });
    } else if (useAddon) {
      await Business.updateOne({ _id: business._id }, { $inc: { 'plan.addons.whatsapp.used': 1 } });
    }
    logger.debug(`✅ Appointment WhatsApp (${messageType}) sent to client: ${client.phone}`);
  } catch (quotaError) {
    logger.error('❌ Error incrementing WhatsApp quota:', quotaError);
  }
}

/**
 * Send appointment WhatsApp after create or confirm:
 *   - `scheduled` → appointmentScheduling template (new booking)
 *   - `confirmed` → appointmentConfirmation template
 *
 * @param {import('express').Request} req — must have user.branchId, businessModels
 * @param {object[]} createdAppointments — mongoose docs or plain objects with clientId, serviceId, staffId, date, time populated where needed
 */
async function sendAppointmentWhatsAppAfterCreate(req, createdAppointments) {
  if (!createdAppointments?.length) return;

  try {
    const whatsappService = require('../services/whatsapp-service');
    await whatsappService.initialize();

    if (!whatsappService.enabled) {
      logger.debug('📱 [WhatsApp] Service disabled — skipping appointment messages');
      return;
    }

    const databaseManager = require('../config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

    const adminSettings = await AdminSettings.getSettings();
    const whatsappEnabled = adminSettings?.notifications?.whatsapp?.enabled === true;
    const adminAppointmentNotificationsEnabled = isAdminAppointmentNotificationsEnabled(
      adminSettings?.notifications?.whatsapp
    );

    if (!whatsappEnabled || !adminAppointmentNotificationsEnabled) {
      logger.debug('📱 [WhatsApp] Skipping appointment messages (admin platform settings)', {
        whatsappEnabled,
        adminAppointmentNotificationsEnabled,
      });
      return;
    }

    const business = await Business.findById(req.user.branchId);
    if (!business) {
      logger.warn('📱 [WhatsApp] Business not found for branch');
      return;
    }

    const rawWhatsappSettings = business?.settings?.whatsappNotificationSettings;
    const whatsappSettings = getWhatsAppSettingsWithDefaults(rawWhatsappSettings);
    const businessWhatsappEnabled = whatsappSettings.enabled === true;
    const appointmentWhatsappEnabled = whatsappSettings.appointmentNotifications?.enabled === true;
    const schedulingEnabled = whatsappSettings.appointmentNotifications?.newAppointments !== false;
    const confirmationsEnabled = whatsappSettings.appointmentNotifications?.confirmations !== false;

    if (!businessWhatsappEnabled || !appointmentWhatsappEnabled) {
      logger.info('📱 [WhatsApp] Skipping appointment messages (salon business settings)', {
        businessWhatsappEnabled,
        appointmentWhatsappEnabled,
        rawAppointment: rawWhatsappSettings?.appointmentNotifications,
      });
      return;
    }

    if (!schedulingEnabled && !confirmationsEnabled) {
      logger.info('📱 [WhatsApp] Skipping appointment messages (scheduling + confirmation toggles off)');
      return;
    }

    const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
    if (whatsappService.isQuietHours(quietHours)) {
      logger.debug('📱 WhatsApp quiet hours active, skipping appointment message');
      return;
    }

    const { Client, Staff, Service } = req.businessModels;
    const businessSettingsForWhatsApp = await req.businessModels.BusinessSettings.findOne()
      .lean()
      .catch(() => null);
    const freshBusiness = await Business.findById(business._id).lean();
    const useAddon = canUseAddon(freshBusiness, 'whatsapp');

    for (const appointment of createdAppointments) {
      const appointmentStatus = String(appointment.status || 'scheduled').toLowerCase();
      const sendScheduling = appointmentStatus === 'scheduled' && schedulingEnabled;
      const sendConfirmation = appointmentStatus === 'confirmed' && confirmationsEnabled;

      if (!sendScheduling && !sendConfirmation) {
        logger.debug('📱 [WhatsApp] Skipping appointment message — no matching status/toggle', {
          appointmentId: appointment._id,
          status: appointmentStatus,
          schedulingEnabled,
          confirmationsEnabled,
        });
        continue;
      }

      const client = await resolveAppointmentClient(Client, appointment);
      if (!client?.phone) continue;

      const walletMessageType = sendScheduling ? 'appointment_scheduling' : 'appointment';
      const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, walletMessageType);
      if (!useAddon && !useWallet) {
        logger.info('📱 [WhatsApp] Skipping appointment message (quota exhausted, wallet insufficient)');
        continue;
      }

      try {
        const serviceName = await resolveAppointmentServiceName(Service, appointment);
        const staffName = await resolveAppointmentStaffName(Staff, appointment);
        const appointmentData = {
          serviceName,
          date: appointment.date,
          time: appointment.time,
          staffName,
          businessName: business.name,
          businessPhone: business.contact?.phone,
          googleMapsUrl: businessSettingsForWhatsApp?.googleMapsUrl || '',
        };

        if (sendScheduling) {
          const result = await whatsappService.sendAppointmentScheduling({
            to: client.phone,
            businessId: business._id,
            clientName: client.name || 'Client',
            appointmentData,
          });
          await recordAppointmentWhatsAppSend({
            Business,
            WhatsAppMessageLog,
            business,
            appointment,
            client,
            result,
            messageType: 'appointment_scheduling',
            walletMessageType: 'appointment_scheduling',
            walletDescription: 'WhatsApp appointment scheduling',
          });
        } else {
          const result = await whatsappService.sendAppointmentConfirmation({
            to: client.phone,
            businessId: business._id,
            clientName: client.name || 'Client',
            appointmentData,
          });
          await recordAppointmentWhatsAppSend({
            Business,
            WhatsAppMessageLog,
            business,
            appointment,
            client,
            result,
            messageType: 'appointment',
            walletMessageType: 'appointment',
            walletDescription: 'WhatsApp appointment confirmation',
          });
        }
      } catch (whatsappError) {
        logger.error('❌ Error sending appointment WhatsApp to client:', whatsappError);
      }
    }
  } catch (whatsappError) {
    logger.error('Error sending appointment WhatsApp:', whatsappError);
  }
}

/**
 * Send appointment-reschedule WhatsApp (MSG91 template from Admin → appointmentReschedule)
 * when an existing appointment's date or time is changed.
 *
 * @param {import('express').Request} req — must have user.branchId, businessModels
 * @param {object} appointment — populated appointment doc (clientId, serviceId, staffId populated)
 */
async function sendAppointmentRescheduleWhatsApp(req, appointment) {
  if (!appointment) return;

  try {
    const whatsappService = require('../services/whatsapp-service');
    await whatsappService.initialize();

    if (!whatsappService.enabled) {
      logger.debug('📱 [WhatsApp] Service disabled — skipping appointment reschedule');
      return;
    }

    const databaseManager = require('../config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

    const adminSettings = await AdminSettings.getSettings();
    const whatsappEnabled = adminSettings?.notifications?.whatsapp?.enabled === true;
    const adminAppointmentNotificationsEnabled = isAdminAppointmentNotificationsEnabled(
      adminSettings?.notifications?.whatsapp
    );

    if (!whatsappEnabled || !adminAppointmentNotificationsEnabled) {
      logger.debug('📱 [WhatsApp] Skipping appointment reschedule (admin platform settings)');
      return;
    }

    const business = await Business.findById(req.user.branchId);
    if (!business) {
      logger.warn('📱 [WhatsApp] Business not found for branch');
      return;
    }

    const rawWhatsappSettings = business?.settings?.whatsappNotificationSettings;
    const whatsappSettings = getWhatsAppSettingsWithDefaults(rawWhatsappSettings);
    const businessWhatsappEnabled = whatsappSettings.enabled === true;
    const appointmentWhatsappEnabled = whatsappSettings.appointmentNotifications?.enabled === true;
    const rescheduleEnabled = whatsappSettings.appointmentNotifications?.reschedule !== false;

    if (!businessWhatsappEnabled || !appointmentWhatsappEnabled || !rescheduleEnabled) {
      logger.debug('📱 [WhatsApp] Skipping appointment reschedule (salon business settings)');
      return;
    }

    const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
    if (whatsappService.isQuietHours(quietHours)) {
      logger.debug('📱 WhatsApp quiet hours active, skipping reschedule message');
      return;
    }

    const { Client, Staff, Service } = req.businessModels;

    const client = await resolveAppointmentClient(Client, appointment);
    if (!client?.phone) return;

    const serviceName = await resolveAppointmentServiceName(Service, appointment);
    const staffName = await resolveAppointmentStaffName(Staff, appointment);

    const businessSettingsForWhatsApp = await req.businessModels.BusinessSettings.findOne().lean().catch(() => null);
    const freshBusiness = await Business.findById(business._id).lean();
    const useAddon = canUseAddon(freshBusiness, 'whatsapp');
    const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, 'appointment_reschedule');
    if (!useAddon && !useWallet) {
      logger.info('📱 [WhatsApp] Skipping appointment reschedule (quota exhausted, wallet insufficient)');
      return;
    }
    const result = await whatsappService.sendAppointmentReschedule({
      to: client.phone,
      businessId: business._id,
      clientName: client.name || 'Client',
      appointmentData: {
        serviceName,
        date: appointment.date,
        time: appointment.time,
        staffName,
        businessName: business.name,
        businessPhone: business.contact?.phone,
        googleMapsUrl: businessSettingsForWhatsApp?.googleMapsUrl || '',
      },
    });

    await WhatsAppMessageLog.create({
      businessId: business._id,
      recipientPhone: client.phone,
      messageType: 'appointment_reschedule',
      status: result.success ? 'sent' : 'failed',
      msg91Response: result.data || null,
      relatedEntityId: appointment._id,
      relatedEntityType: 'Appointment',
      error: result.error || null,
      timestamp: new Date(),
    });

    if (result.success) {
      try {
        if (useWallet) {
          await deductWhatsApp(business._id, 'appointment_reschedule', {
            description: 'WhatsApp appointment reschedule',
            relatedEntity: { id: appointment._id, type: 'Appointment' },
          });
        } else {
          await Business.updateOne({ _id: business._id }, { $inc: { 'plan.addons.whatsapp.used': 1 } });
        }
      } catch (quotaError) {
        logger.error('❌ Error incrementing WhatsApp quota:', quotaError);
      }
      logger.debug(`✅ Appointment reschedule WhatsApp sent to client: ${client.phone}`);
    } else {
      logger.error(`❌ Failed to send appointment reschedule WhatsApp to ${client.phone}:`, result.error);
    }
  } catch (whatsappError) {
    logger.error('Error sending appointment reschedule WhatsApp:', whatsappError);
  }
}

/**
 * Send appointment-cancellation WhatsApp (MSG91 template from Admin → appointmentCancellation)
 * when an appointment's status is changed to cancelled.
 *
 * @param {import('express').Request} req — must have user.branchId, businessModels
 * @param {object} appointment — populated appointment doc (clientId, serviceId, staffId populated)
 * @param {string} [reason] — optional cancellation reason text
 */
async function sendAppointmentCancellationWhatsApp(req, appointment, reason) {
  if (!appointment) return;

  try {
    const whatsappService = require('../services/whatsapp-service');
    await whatsappService.initialize();

    if (!whatsappService.enabled) {
      logger.debug('📱 [WhatsApp] Service disabled — skipping appointment cancellation');
      return;
    }

    const databaseManager = require('../config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const WhatsAppMessageLog = mainConnection.model('WhatsAppMessageLog', require('../models/WhatsAppMessageLog').schema);

    const adminSettings = await AdminSettings.getSettings();
    const whatsappEnabled = adminSettings?.notifications?.whatsapp?.enabled === true;
    const adminAppointmentNotificationsEnabled = isAdminAppointmentNotificationsEnabled(
      adminSettings?.notifications?.whatsapp
    );

    if (!whatsappEnabled || !adminAppointmentNotificationsEnabled) {
      logger.debug('📱 [WhatsApp] Skipping appointment cancellation (admin platform settings)');
      return;
    }

    const business = await Business.findById(req.user.branchId);
    if (!business) {
      logger.warn('📱 [WhatsApp] Business not found for branch');
      return;
    }

    const rawWhatsappSettings = business?.settings?.whatsappNotificationSettings;
    const whatsappSettings = getWhatsAppSettingsWithDefaults(rawWhatsappSettings);
    const businessWhatsappEnabled = whatsappSettings.enabled === true;
    const appointmentWhatsappEnabled = whatsappSettings.appointmentNotifications?.enabled === true;
    const cancellationsEnabled = whatsappSettings.appointmentNotifications?.cancellations !== false;

    if (!businessWhatsappEnabled || !appointmentWhatsappEnabled || !cancellationsEnabled) {
      logger.debug('📱 [WhatsApp] Skipping appointment cancellation (salon business settings)');
      return;
    }

    const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
    if (whatsappService.isQuietHours(quietHours)) {
      logger.debug('📱 WhatsApp quiet hours active, skipping cancellation message');
      return;
    }

    const { Client, Service } = req.businessModels;

    const client = await resolveAppointmentClient(Client, appointment);
    if (!client?.phone) return;

    const serviceName = await resolveAppointmentServiceName(Service, appointment);

    const businessSettingsForWhatsApp = await req.businessModels.BusinessSettings.findOne().lean().catch(() => null);
    const freshBusiness = await Business.findById(business._id).lean();
    const useAddon = canUseAddon(freshBusiness, 'whatsapp');
    const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, 'appointment_cancellation');
    if (!useAddon && !useWallet) {
      logger.info('📱 [WhatsApp] Skipping appointment cancellation (quota exhausted, wallet insufficient)');
      return;
    }
    const result = await whatsappService.sendAppointmentCancellation({
      to: client.phone,
      businessId: business._id,
      clientName: client.name || 'Client',
      appointmentData: {
        serviceName,
        date: appointment.date,
        time: appointment.time,
        businessName: business.name,
        businessPhone: business.contact?.phone,
        googleMapsUrl: businessSettingsForWhatsApp?.googleMapsUrl || '',
      },
      cancellationReason: reason || 'Cancelled',
    });

    await WhatsAppMessageLog.create({
      businessId: business._id,
      recipientPhone: client.phone,
      messageType: 'appointment_cancellation',
      status: result.success ? 'sent' : 'failed',
      msg91Response: result.data || null,
      relatedEntityId: appointment._id,
      relatedEntityType: 'Appointment',
      error: result.error || null,
      timestamp: new Date(),
    });

    if (result.success) {
      try {
        if (useWallet) {
          await deductWhatsApp(business._id, 'appointment_cancellation', {
            description: 'WhatsApp appointment cancellation',
            relatedEntity: { id: appointment._id, type: 'Appointment' },
          });
        } else {
          await Business.updateOne({ _id: business._id }, { $inc: { 'plan.addons.whatsapp.used': 1 } });
        }
      } catch (quotaError) {
        logger.error('❌ Error incrementing WhatsApp quota:', quotaError);
      }
      logger.debug(`✅ Appointment cancellation WhatsApp sent to client: ${client.phone}`);
    } else {
      logger.error(`❌ Failed to send appointment cancellation WhatsApp to ${client.phone}:`, result.error);
    }
  } catch (whatsappError) {
    logger.error('Error sending appointment cancellation WhatsApp:', whatsappError);
  }
}

function appointmentStartMs(appointment) {
  if (appointment?.startAt) {
    const t = new Date(appointment.startAt).getTime();
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

/**
 * Send appointment reminder WhatsApp (utility template: appointmentReminder).
 * Manual sends (notification center) skip the auto-reminder toggle and quiet hours.
 *
 * @returns {{ success?: boolean, error?: string, skipped?: boolean, reason?: string, data?: unknown }}
 */
async function sendAppointmentReminderWhatsApp(req, appointment, options = {}) {
  const { manual = false, reminderHours: reminderHoursOverride } = options;
  if (!appointment) return { skipped: true, reason: 'Appointment not found' };

  try {
    const whatsappService = require('../services/whatsapp-service');
    await whatsappService.initialize();

    if (!whatsappService.enabled) {
      return { skipped: true, reason: 'WhatsApp is not configured' };
    }

    const databaseManager = require('../config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
    const Business = mainConnection.model('Business', require('../models/Business').schema);

    const adminSettings = await AdminSettings.getSettings();
    const whatsappEnabled = adminSettings?.notifications?.whatsapp?.enabled === true;
    const adminAppointmentNotificationsEnabled = isAdminAppointmentNotificationsEnabled(
      adminSettings?.notifications?.whatsapp
    );

    if (!whatsappEnabled || !adminAppointmentNotificationsEnabled) {
      return { skipped: true, reason: 'WhatsApp appointment notifications are disabled at platform level' };
    }

    const business = await Business.findById(req.user.branchId);
    if (!business) {
      return { skipped: true, reason: 'Business not found' };
    }

    const rawWhatsappSettings = business?.settings?.whatsappNotificationSettings;
    const whatsappSettings = getWhatsAppSettingsWithDefaults(rawWhatsappSettings);
    if (!whatsappSettings.enabled || !whatsappSettings.appointmentNotifications?.enabled) {
      return { skipped: true, reason: 'WhatsApp appointment notifications are disabled for this salon' };
    }
    if (!manual && !whatsappSettings.appointmentNotifications?.reminders) {
      return { skipped: true, reason: 'Automatic appointment reminders are disabled' };
    }

    if (!manual) {
      const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
      if (whatsappService.isQuietHours(quietHours)) {
        return { skipped: true, reason: 'Quiet hours are active' };
      }
    }

    const templateId = await whatsappService.resolveTemplateId('appointmentReminder', business._id);
    if (!templateId || !String(templateId).trim()) {
      return { skipped: true, reason: 'Appointment reminder template is not configured' };
    }

    const { Client, Staff, Service } = req.businessModels;
    const client = await resolveAppointmentClient(Client, appointment);
    if (!client?.phone) {
      return { skipped: true, reason: 'Client has no phone number on file' };
    }

    const freshBusiness = await Business.findById(business._id).lean();
    const useAddon = canUseAddon(freshBusiness, 'whatsapp');
    const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, 'appointment_reminder');
    if (!useAddon && !useWallet) {
      return { skipped: true, reason: 'Insufficient WhatsApp quota or wallet balance' };
    }

    const serviceName = await resolveAppointmentServiceName(Service, appointment);
    const staffName = await resolveAppointmentStaffName(Staff, appointment);
    const businessSettingsForWhatsApp = await req.businessModels.BusinessSettings.findOne().lean().catch(() => null);

    const startMs = appointmentStartMs(appointment);
    const reminderHours =
      reminderHoursOverride != null && Number.isFinite(Number(reminderHoursOverride))
        ? Math.max(1, Math.round(Number(reminderHoursOverride)))
        : Math.max(1, Math.round((startMs - Date.now()) / (1000 * 60 * 60)));

    const result = await whatsappService.sendAppointmentReminder({
      to: client.phone,
      businessId: business._id,
      clientName: client.name || 'Client',
      appointmentData: {
        serviceName,
        date: appointment.date,
        time: appointment.time,
        staffName,
        businessName: business.name,
        businessPhone: business.contact?.phone || '',
        googleMapsUrl: businessSettingsForWhatsApp?.googleMapsUrl || '',
      },
      reminderHours,
    });

    await recordAppointmentWhatsAppSend({
      Business,
      WhatsAppMessageLog: mainConnection.model(
        'WhatsAppMessageLog',
        require('../models/WhatsAppMessageLog').schema
      ),
      business,
      appointment,
      client,
      result,
      messageType: 'appointment_reminder',
      walletMessageType: 'appointment_reminder',
      walletDescription: manual ? 'WhatsApp appointment reminder (manual)' : 'WhatsApp appointment reminder',
    });

    if (result.success && req.businessModels?.Appointment) {
      await req.businessModels.Appointment.updateOne(
        { _id: appointment._id },
        { $set: { reminderSentAt: new Date() } }
      );
    }

    return result;
  } catch (whatsappError) {
    logger.error('Error sending appointment reminder WhatsApp:', whatsappError);
    return { success: false, error: whatsappError?.message || 'Failed to send reminder' };
  }
}

module.exports = {
  sendAppointmentWhatsAppAfterCreate,
  sendAppointmentRescheduleWhatsApp,
  sendAppointmentCancellationWhatsApp,
  sendAppointmentReminderWhatsApp,
};
