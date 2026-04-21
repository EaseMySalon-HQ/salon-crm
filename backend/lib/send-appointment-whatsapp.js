const { logger } = require('../utils/logger');
const { isAdminAppointmentNotificationsEnabled } = require('./whatsapp-admin-gates');
const { getWhatsAppSettingsWithDefaults } = require('./whatsapp-settings-defaults');
const { canUseAddon } = require('./entitlements');
const { canDeductWhatsApp, deductWhatsApp } = require('./wallet-deduction');

/**
 * Send appointment-confirmation WhatsApp (MSG91 template from Admin → appointmentConfirmation)
 * for newly created appointments. Same gates as receipt WhatsApp on checkout.
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
      logger.debug('📱 [WhatsApp] Service disabled — skipping appointment confirmation');
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

    logger.debug('📱 [WhatsApp] Admin WhatsApp enabled:', whatsappEnabled);
    logger.debug('📱 [WhatsApp] Admin Appointment Notifications enabled:', adminAppointmentNotificationsEnabled);

    if (!whatsappEnabled || !adminAppointmentNotificationsEnabled) {
      logger.debug('📱 [WhatsApp] Skipping appointment confirmation (admin platform settings)', {
        whatsappEnabled,
        adminAppointmentNotificationsEnabled
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
    const confirmationsEnabled = whatsappSettings.appointmentNotifications?.confirmations !== false;

    if (!businessWhatsappEnabled || !appointmentWhatsappEnabled || !confirmationsEnabled) {
      logger.info('📱 [WhatsApp] Skipping appointment confirmation (salon business settings)', {
        businessWhatsappEnabled,
        appointmentWhatsappEnabled,
        confirmationsEnabled,
        rawAppointment: rawWhatsappSettings?.appointmentNotifications
      });
      return;
    }

    const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
    if (whatsappService.isQuietHours(quietHours)) {
      logger.debug('📱 WhatsApp quiet hours active, skipping appointment message');
      return;
    }

    const { Client, Staff, Service } = req.businessModels;

    for (const appointment of createdAppointments) {
      let client = null;
      if (appointment.clientId && typeof appointment.clientId === 'object') {
        client = appointment.clientId;
      } else {
        const clientId = appointment.clientId?._id || appointment.clientId;
        if (clientId) {
          client = await Client.findById(clientId);
        }
      }

      if (!client?.phone) continue;

      try {
        let serviceName = 'Service';
        if (appointment.serviceId) {
          if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) {
            serviceName = appointment.serviceId.name;
          } else if (Service) {
            const service = await Service.findById(appointment.serviceId);
            serviceName = service?.name || 'Service';
          }
        }

        let staffName = 'Not assigned';
        if (appointment.staffId) {
          if (typeof appointment.staffId === 'object' && appointment.staffId.name) {
            staffName = appointment.staffId.name;
          } else {
            const staff = await Staff.findById(appointment.staffId);
            staffName = staff?.name || 'Not assigned';
          }
        } else if (appointment.staffAssignments && appointment.staffAssignments.length > 0) {
          const firstAssignment = appointment.staffAssignments[0];
          if (firstAssignment.staffId && typeof firstAssignment.staffId === 'object' && firstAssignment.staffId.name) {
            staffName = firstAssignment.staffId.name;
          } else if (firstAssignment.staffId) {
            const staff = await Staff.findById(firstAssignment.staffId);
            staffName = staff?.name || 'Not assigned';
          }
        }

        const businessSettingsForWhatsApp = await req.businessModels.BusinessSettings.findOne().lean().catch(() => null);
        const freshBusiness = await Business.findById(business._id).lean();
        const useAddon = canUseAddon(freshBusiness, 'whatsapp');
        const useWallet = !useAddon && canDeductWhatsApp(freshBusiness, 'appointment');
        if (!useAddon && !useWallet) {
          logger.info('📱 [WhatsApp] Skipping appointment confirmation (quota exhausted, wallet insufficient)');
          continue;
        }
        const result = await whatsappService.sendAppointmentConfirmation({
          to: client.phone,
          clientName: client.name || 'Client',
          appointmentData: {
            serviceName,
            date: appointment.date,
            time: appointment.time,
            staffName,
            businessName: business.name,
            businessPhone: business.contact?.phone,
            googleMapsUrl: businessSettingsForWhatsApp?.googleMapsUrl || ''
          }
        });

        await WhatsAppMessageLog.create({
          businessId: business._id,
          recipientPhone: client.phone,
          messageType: 'appointment',
          status: result.success ? 'sent' : 'failed',
          msg91Response: result.data || null,
          relatedEntityId: appointment._id,
          relatedEntityType: 'Appointment',
          error: result.error || null,
          timestamp: new Date()
        });

        if (result.success) {
          try {
            if (useWallet) {
              await deductWhatsApp(business._id, 'appointment', {
                description: 'WhatsApp appointment confirmation',
                relatedEntity: { id: appointment._id, type: 'Appointment' },
              });
            } else {
              await Business.updateOne(
                { _id: business._id },
                { $inc: { 'plan.addons.whatsapp.used': 1 } }
              );
            }
            logger.debug(`📊 WhatsApp quota incremented for business: ${business._id}`);
          } catch (quotaError) {
            logger.error('❌ Error incrementing WhatsApp quota:', quotaError);
          }
          logger.debug(`✅ Appointment WhatsApp sent to client: ${client.phone}`);
        } else {
          logger.error(`❌ Failed to send appointment WhatsApp to ${client.phone}:`, result.error);
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

    let client = null;
    if (appointment.clientId && typeof appointment.clientId === 'object') {
      client = appointment.clientId;
    } else if (appointment.clientId) {
      client = await Client.findById(appointment.clientId);
    }

    if (!client?.phone) return;

    let serviceName = 'Service';
    if (appointment.serviceId) {
      if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) {
        serviceName = appointment.serviceId.name;
      } else if (Service) {
        const service = await Service.findById(appointment.serviceId);
        serviceName = service?.name || 'Service';
      }
    }

    let staffName = 'Not assigned';
    if (appointment.staffId) {
      if (typeof appointment.staffId === 'object' && appointment.staffId.name) {
        staffName = appointment.staffId.name;
      } else {
        const staff = await Staff.findById(appointment.staffId);
        staffName = staff?.name || 'Not assigned';
      }
    } else if (appointment.staffAssignments?.length > 0) {
      const firstAssignment = appointment.staffAssignments[0];
      if (firstAssignment.staffId && typeof firstAssignment.staffId === 'object' && firstAssignment.staffId.name) {
        staffName = firstAssignment.staffId.name;
      } else if (firstAssignment.staffId) {
        const staff = await Staff.findById(firstAssignment.staffId);
        staffName = staff?.name || 'Not assigned';
      }
    }

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
      clientName: client.name || 'Client',
      appointmentData: {
        serviceName,
        date: appointment.date,
        time: appointment.time,
        staffName,
        businessName: business.name,
        businessPhone: business.contact?.phone,
        googleMapsUrl: businessSettingsForWhatsApp?.googleMapsUrl || ''
      }
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
      timestamp: new Date()
    });

    if (result.success) {
      try {
        if (useWallet) {
          await deductWhatsApp(business._id, 'appointment_reschedule', {
            description: 'WhatsApp appointment reschedule',
            relatedEntity: { id: appointment._id, type: 'Appointment' },
          });
        } else {
          await Business.updateOne(
            { _id: business._id },
            { $inc: { 'plan.addons.whatsapp.used': 1 } }
          );
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

    const { Client, Staff, Service } = req.businessModels;

    let client = null;
    if (appointment.clientId && typeof appointment.clientId === 'object') {
      client = appointment.clientId;
    } else if (appointment.clientId) {
      client = await Client.findById(appointment.clientId);
    }

    if (!client?.phone) return;

    let serviceName = 'Service';
    if (appointment.serviceId) {
      if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) {
        serviceName = appointment.serviceId.name;
      } else if (Service) {
        const service = await Service.findById(appointment.serviceId);
        serviceName = service?.name || 'Service';
      }
    }

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
      clientName: client.name || 'Client',
      appointmentData: {
        serviceName,
        date: appointment.date,
        time: appointment.time,
        businessName: business.name,
        businessPhone: business.contact?.phone,
        googleMapsUrl: businessSettingsForWhatsApp?.googleMapsUrl || ''
      },
      cancellationReason: reason || 'Cancelled'
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
      timestamp: new Date()
    });

    if (result.success) {
      try {
        if (useWallet) {
          await deductWhatsApp(business._id, 'appointment_cancellation', {
            description: 'WhatsApp appointment cancellation',
            relatedEntity: { id: appointment._id, type: 'Appointment' },
          });
        } else {
          await Business.updateOne(
            { _id: business._id },
            { $inc: { 'plan.addons.whatsapp.used': 1 } }
          );
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

module.exports = { sendAppointmentWhatsAppAfterCreate, sendAppointmentRescheduleWhatsApp, sendAppointmentCancellationWhatsApp };
