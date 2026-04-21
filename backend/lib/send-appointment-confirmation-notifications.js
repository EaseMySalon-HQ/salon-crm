'use strict';

const { logger } = require('../utils/logger');
const { isAdminAppointmentNotificationsEnabled } = require('./whatsapp-admin-gates');
const { getWhatsAppSettingsWithDefaults } = require('./whatsapp-settings-defaults');
const { logSmsMessage, logEmailMessage } = require('./channel-logs');
const { canDeductSms, deductSms, canDeductWhatsApp, deductWhatsApp } = require('./wallet-deduction');

async function sendAppointmentConfirmationNotifications(req, createdAppointments, getEmailSettingsWithDefaults) {
  // Send email notifications if enabled
  try {
    const emailService = require('../services/email-service');
    
    // Ensure email service is initialized
    if (!emailService.initialized) {
      logger.info('Initializing email service');
      await emailService.initialize();
    }
    
    logger.debug('Email Service Status', {
      initialized: emailService.initialized,
      enabled: emailService.enabled,
      provider: emailService.provider,
      hasConfig: !!emailService.config
    });
    
    // Check if email service is enabled (from AdminSettings)
    if (!emailService.enabled) {
      logger.info('Email service is disabled, skipping appointment email. To enable: Check Admin Settings → Notifications → Email and ensure it\'s enabled with valid API key');
    } else {
      // Get Business from main database (not business database)
      const databaseManager = require('../config/database-manager');
      const mainConnection = await databaseManager.getMainConnection();
      const Business = mainConnection.model('Business', require('../models/Business').schema);
      const business = await Business.findById(req.user.branchId);
      
      if (!business) {
        logger.error('Business not found for branchId:', req.user.branchId);
      } else {
        logger.info('Business found:', business.name);
      }
      
      const rawEmailSettings = business?.settings?.emailNotificationSettings;
      
      // Apply defaults to email settings (similar to WhatsApp)
      const emailSettings = getEmailSettingsWithDefaults(rawEmailSettings);
      
      logger.debug('Email Settings', {
        emailSettingsExists: !!rawEmailSettings,
        appointmentNotificationsEnabled: emailSettings?.appointmentNotifications?.enabled,
        newAppointmentsEnabled: emailSettings?.appointmentNotifications?.newAppointments
      });
      
      const { Staff, Client } = req.businessModels;

      // Check if business has enabled appointment notifications
      // Use merged settings with defaults - defaults to true if not explicitly set to false
      const appointmentNotificationsEnabled = emailSettings.appointmentNotifications?.enabled === true;
      
      logger.debug(`Appointment notifications enabled: ${appointmentNotificationsEnabled}`, {
        enabled: emailSettings?.appointmentNotifications?.enabled,
        newAppointments: emailSettings?.appointmentNotifications?.newAppointments
      });
      
      if (appointmentNotificationsEnabled) {
      // Send confirmation to client if email exists
      // Check if new appointments are enabled
      const sendNewAppointments =
        emailSettings?.appointmentNotifications?.newAppointments === true ||
        emailSettings?.appointmentNotifications?.newAppointment === true;
      logger.debug(`Send new appointments to clients: ${sendNewAppointments}`);
      
      if (sendNewAppointments) {
        logger.info(`Processing ${createdAppointments.length} appointment(s) for client emails`);
        
        for (const appointment of createdAppointments) {
          logger.debug('Appointment Structure', {
            appointmentId: appointment._id,
            clientIdType: typeof appointment.clientId,
            clientIdIsObject: typeof appointment.clientId === 'object',
            clientIdValue: appointment.clientId?._id || appointment.clientId,
            clientIdEmail: appointment.clientId?.email,
            clientIdName: appointment.clientId?.name
          });
          
          // Check if clientId is already populated (from the populate call above)
          let client = null;
          let clientEmail = null;
          let clientName = null;
          
          if (appointment.clientId && typeof appointment.clientId === 'object') {
            // Client is populated
            client = appointment.clientId;
            clientEmail = client.email ? client.email.trim() : null;
            clientName = client.name || 'Client';
            
            logger.debug('Using populated client data', {
              name: clientName,
              email: clientEmail,
              hasEmail: !!clientEmail
            });
          } else {
            // Client is not populated, fetch it
            const clientId = appointment.clientId?._id || appointment.clientId;
            logger.debug('Client not populated, fetching from database. ClientId:', clientId);
            
            if (clientId) {
              client = await Client.findById(clientId);
              if (client) {
                clientEmail = client.email ? client.email.trim() : null;
                clientName = client.name || 'Client';
                logger.debug('Fetched client from database', {
                  name: clientName,
                  email: clientEmail,
                  hasEmail: !!clientEmail
                });
              } else {
                logger.error('Client not found in database with ID:', clientId);
              }
            } else {
              logger.error('No clientId found in appointment');
            }
          }
          
          logger.debug('Client Email Check Summary', {
            appointmentId: appointment._id,
            clientId: appointment.clientId?._id || appointment.clientId,
            clientEmail: clientEmail,
            clientName: clientName,
            hasEmail: !!clientEmail,
            emailLength: clientEmail?.length || 0
          });
          
          if (clientEmail && clientEmail.length > 0) {
            logger.debug(`Attempting to send appointment confirmation to: ${clientEmail}`);
            try {
              // Get service name - check if populated or fetch
              let serviceName = 'Service';
              if (appointment.serviceId) {
                if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) {
                  serviceName = appointment.serviceId.name;
                } else {
                  const Service = req.businessModels.Service;
                  const service = await Service.findById(appointment.serviceId);
                  serviceName = service?.name || 'Service';
                }
              }
              
              // Get staff name - check if populated or fetch
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
              
              logger.debug('Preparing to send email', {
                to: clientEmail,
                clientName: clientName,
                serviceName: serviceName,
                date: appointment.date,
                time: appointment.time,
                staffName: staffName,
                businessName: business.name
              });
              
              const businessSettingsForEmail = await req.businessModels.BusinessSettings.findOne().lean().catch(() => null);
              const emailResult = await emailService.sendAppointmentConfirmation({
                to: clientEmail,
                clientName: clientName,
                appointmentData: {
                  serviceName: serviceName,
                  date: appointment.date,
                  time: appointment.time,
                  staffName: staffName,
                  businessName: business.name,
                  businessPhone: business.contact?.phone,
                  googleProfilePage: businessSettingsForEmail?.googleProfilePage || '',
                  googleMapsUrl: businessSettingsForEmail?.googleMapsUrl || '',
                  notes: appointment.notes || ''
                }
              });
              
              logger.debug('Email result', {
                success: emailResult?.success,
                error: emailResult?.error,
                data: emailResult?.data
              });
              
              if (emailResult && emailResult.success !== false) {
                logger.debug(`Appointment confirmation sent to client: ${clientEmail}`);
              } else {
                logger.error(`Failed to send appointment email to ${clientEmail}:`, emailResult?.error || 'Unknown error');
                logger.debug('Full email result:', JSON.stringify(emailResult, null, 2));
              }
              logEmailMessage({
                businessId: business?._id,
                recipientEmail: clientEmail,
                messageType: 'appointment',
                result: {
                  success: emailResult && emailResult.success !== false,
                  error: emailResult?.error,
                  data: emailResult?.data,
                },
                subject: 'Appointment Confirmation',
                provider: emailService?.provider,
                relatedEntityId: appointment?._id,
                relatedEntityType: 'Appointment',
              });
            } catch (clientEmailError) {
              logger.error('Error sending appointment confirmation to client:', clientEmailError);
              logger.error('Error details:', {
                message: clientEmailError.message,
                stack: clientEmailError.stack
              });
            }
          } else {
            logger.debug(`Skipping email for appointment - client has no email address. Appointment ID: ${appointment._id}, Client ID: ${appointment.clientId?._id || appointment.clientId}, Client Name: ${clientName || 'Unknown'}. To fix: Add email address to client profile in Clients section`);
          }
        }
      }
      
      // Send notification to staff if enabled
      // Use same logic as client notifications - default to enabled unless explicitly disabled AND configured
      const staffHasRecipientList = emailSettings?.appointmentNotifications?.recipientStaffIds?.length > 0;
      const staffExplicitlyDisabled = emailSettings?.appointmentNotifications?.enabled === false;
      const staffNotificationsEnabled = !emailSettings || 
        !emailSettings?.appointmentNotifications ||
        (!staffExplicitlyDisabled || !staffHasRecipientList);
      
      const recipientStaffIds = emailSettings?.appointmentNotifications?.recipientStaffIds || [];
      
      logger.debug('Staff Notification Check', {
        staffNotificationsEnabled,
        staffExplicitlyDisabled,
        staffHasRecipientList,
        recipientStaffIdsCount: recipientStaffIds.length,
        recipientStaffIds: recipientStaffIds.map(id => id.toString())
      });
      
      if (staffNotificationsEnabled) {
        // If recipient list is empty, find all staff with appointment alerts enabled
        let recipients = [];
        
        if (recipientStaffIds.length > 0) {
          // Use configured recipient list
          recipients = await Staff.find({
            _id: { $in: recipientStaffIds },
            'emailNotifications.enabled': true,
            'emailNotifications.preferences.appointmentAlerts': true,
            email: { $exists: true, $ne: '' }
          }).lean();
        } else {
          logger.debug('No recipient list configured, finding all staff with appointment alerts enabled');
          recipients = await Staff.find({
            branchId: req.user.branchId,
            'emailNotifications.enabled': true,
            'emailNotifications.preferences.appointmentAlerts': true,
            email: { $exists: true, $ne: '' }
          }).lean();
        }
        
        // Also check for admin users (business owners) who should receive notifications
        // Admin users are in the main database, not the business database
        const User = mainConnection.model('User', require('../models/User').schema);
        const adminUsers = await User.find({
          branchId: req.user.branchId,
          role: 'admin',
          email: { $exists: true, $ne: '' }
        }).lean();
        
        logger.info(`Found ${adminUsers.length} admin user(s) for business`);
        
        // Add admin users to recipients (they always have notifications enabled)
        let adminCount = 0;
        for (const admin of adminUsers) {
          // Check if admin is already in recipients
          const alreadyInList = recipients.some(r => r.email === admin.email);
          if (!alreadyInList) {
            recipients.push({
              _id: admin._id,
              name: admin.name || `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email,
              email: admin.email,
              role: 'admin',
              emailNotifications: {
                enabled: true,
                preferences: {
                  appointmentAlerts: true // Admin users always have this enabled
                }
              }
            });
            adminCount++;
            logger.debug(`Added admin user to recipients: ${admin.email} (${admin.name || admin.email})`);
          } else {
            logger.debug(`Admin user already in recipients: ${admin.email}`);
          }
        }
        
        logger.info(`Found ${recipients.length} total recipients for appointment notifications (${recipients.length - adminCount} staff + ${adminCount} admin)`);
        
        if (recipients.length === 0) {
          logger.warn('No recipients found. Check: staff email notifications enabled, staff appointment alerts preference enabled, staff have valid email addresses, recipient list configured in business settings, admin users have email addresses');
        }
        
        const emailDelayMs = 600; // Resend limit: 2 req/sec
        for (let i = 0; i < recipients.length; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, emailDelayMs));
          const recipient = recipients[i];
          try {
            logger.debug(`Sending appointment notification to: ${recipient.email} (${recipient.name || recipient.role})`);
            
            // Get appointment details for the first appointment (if available)
            const firstAppointment = createdAppointments[0];
            let appointmentDetails = {
              date: firstAppointment?.date,
              time: firstAppointment?.time,
              clientName: null,
              serviceName: null
            };
            
            // Try to get client and service names
            if (firstAppointment) {
              if (firstAppointment.clientId && typeof firstAppointment.clientId === 'object') {
                appointmentDetails.clientName = firstAppointment.clientId.name;
              }
              if (firstAppointment.serviceId && typeof firstAppointment.serviceId === 'object') {
                appointmentDetails.serviceName = firstAppointment.serviceId.name;
              }
            }
            
            const staffEmailResult = await emailService.sendAppointmentNotification({
              to: recipient.email,
              appointmentCount: createdAppointments.length,
              businessName: business.name,
              appointmentDetails: appointmentDetails
            });
            logger.debug(`Appointment notification sent to: ${recipient.email}`);
            logEmailMessage({
              businessId: business?._id,
              recipientEmail: recipient.email,
              messageType: 'appointment',
              result: {
                success: staffEmailResult ? staffEmailResult.success !== false : true,
                error: staffEmailResult?.error,
                data: staffEmailResult?.data,
              },
              subject: 'New Appointment Notification',
              provider: emailService?.provider,
              relatedEntityId: firstAppointment?._id,
              relatedEntityType: 'Appointment',
            });
          } catch (emailError) {
            logEmailMessage({
              businessId: business?._id,
              recipientEmail: recipient.email,
              messageType: 'appointment',
              result: { success: false, error: emailError?.message || String(emailError) },
              subject: 'New Appointment Notification',
              provider: emailService?.provider,
              relatedEntityId: createdAppointments?.[0]?._id,
              relatedEntityType: 'Appointment',
            });
            logger.error(`Error sending appointment notification to ${recipient.email}:`, emailError);
            logger.error('Error details:', {
              message: emailError.message,
              stack: emailError.stack
            });
          }
        }
      } else {
        logger.info('Staff appointment notifications are disabled in business settings');
      }
    }
    }
  } catch (emailError) {
    logger.error('Error sending appointment email:', emailError);
    logger.error('Error stack:', emailError.stack);
    // Don't fail appointment creation if email fails
  }

  // Send WhatsApp appointment confirmation if enabled
  try {
    const whatsappService = require('../services/whatsapp-service');
    await whatsappService.initialize();
    
    if (whatsappService.enabled) {
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
      
      logger.debug('WhatsApp admin settings', {
        whatsappEnabled,
        adminAppointmentNotificationsEnabled
      });
      
      if (whatsappEnabled && adminAppointmentNotificationsEnabled) {
        const business = await Business.findById(req.user.branchId);
        const rawWhatsappSettings = business?.settings?.whatsappNotificationSettings;
        const whatsappSettings = getWhatsAppSettingsWithDefaults(rawWhatsappSettings);
        const businessWhatsappEnabled = whatsappSettings.enabled === true;
        const appointmentWhatsappEnabled = whatsappSettings.appointmentNotifications?.enabled === true;
        const confirmationsEnabled = whatsappSettings.appointmentNotifications?.confirmations !== false;

        if (businessWhatsappEnabled && appointmentWhatsappEnabled && confirmationsEnabled) {
          // Check quiet hours
          const quietHours = adminSettings?.notifications?.whatsapp?.quietHours;
          const inQuietHours = whatsappService.isQuietHours(quietHours);
          
          if (!inQuietHours) {
            const { Client, Staff } = req.businessModels;
            
            for (const appointment of createdAppointments) {
              // Get client
              let client = null;
              if (appointment.clientId && typeof appointment.clientId === 'object') {
                client = appointment.clientId;
              } else {
                const clientId = appointment.clientId?._id || appointment.clientId;
                if (clientId) {
                  client = await Client.findById(clientId);
                }
              }
              
              if (client?.phone) {
                try {
                  // Get service name
                  let serviceName = 'Service';
                  if (appointment.serviceId) {
                    if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) {
                      serviceName = appointment.serviceId.name;
                    } else {
                      const { Service } = req.businessModels;
                      const service = await Service.findById(appointment.serviceId);
                      serviceName = service?.name || 'Service';
                    }
                  }
                  
                  // Get staff name
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
                  const result = await whatsappService.sendAppointmentConfirmation({
                    to: client.phone,
                    clientName: client.name || 'Client',
                    appointmentData: {
                      serviceName: serviceName,
                      date: appointment.date,
                      time: appointment.time,
                      staffName: staffName,
                      businessName: business.name,
                      businessPhone: business.contact?.phone,
                      googleProfilePage: businessSettingsForWhatsApp?.googleProfilePage || '',
                      googleMapsUrl: businessSettingsForWhatsApp?.googleMapsUrl || ''
                    }
                  });
                  
                  // Log to WhatsAppMessageLog
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
                    // Increment WhatsApp quota usage
                    try {
                      const mainConnection = await databaseManager.getMainConnection();
                      const Business = mainConnection.model('Business', require('../models/Business').schema);
                      await Business.updateOne(
                        { _id: business._id },
                        { $inc: { 'plan.addons.whatsapp.used': 1 } }
                      );
                      logger.debug(`WhatsApp quota incremented for business: ${business._id}`);
                    } catch (quotaError) {
                      logger.error('Error incrementing WhatsApp quota:', quotaError);
                      // Don't fail the appointment if quota increment fails
                    }
                    
                    logger.debug(`Appointment WhatsApp sent to client: ${client.phone}`);
                  } else {
                    logger.error(`Failed to send appointment WhatsApp to ${client.phone}:`, result.error);
                  }
                } catch (whatsappError) {
                  logger.error('Error sending appointment WhatsApp to client:', whatsappError);
                }
              }
            }
          } else {
            logger.info('WhatsApp quiet hours active, skipping appointment message');
          }
        }
      }
    }
  } catch (whatsappError) {
    logger.error('Error sending appointment WhatsApp:', whatsappError);
    // Don't fail appointment creation if WhatsApp fails
  }

  // Send SMS appointment confirmation if enabled
  try {
    const smsService = require('../services/sms-service');
    const { canUseAddon } = require('../lib/entitlements');
    await smsService.initialize();
    if (smsService.enabled) {
      const databaseManager = require('../config/database-manager');
      const mainConnection = await databaseManager.getMainConnection();
      const AdminSettings = mainConnection.model('AdminSettings', require('../models/AdminSettings').schema);
      const Business = mainConnection.model('Business', require('../models/Business').schema);
      const adminSettings = await AdminSettings.getSettings();
      const smsEnabled = adminSettings?.notifications?.sms?.enabled === true && (adminSettings?.notifications?.sms?.provider === 'msg91' || !!(adminSettings?.notifications?.sms?.msg91AuthKey && String(adminSettings.notifications.sms.msg91AuthKey).trim()));
      if (smsEnabled) {
        let business = await Business.findById(req.user.branchId).lean();
        if (canUseAddon(business, 'sms') || canDeductSms(business)) {
          const { Client, Staff } = req.businessModels;
          for (const appointment of createdAppointments) {
            let client = null;
            if (appointment.clientId && typeof appointment.clientId === 'object') {
              client = appointment.clientId;
            } else {
              const clientId = appointment.clientId?._id || appointment.clientId;
              if (clientId) client = await Client.findById(clientId);
            }
            if (!client?.phone) continue;
            let serviceName = 'Service';
            if (appointment.serviceId) {
              if (typeof appointment.serviceId === 'object' && appointment.serviceId.name) serviceName = appointment.serviceId.name;
              else {
                const { Service } = req.businessModels;
                const service = await Service.findById(appointment.serviceId);
                serviceName = service?.name || 'Service';
              }
            }
            let staffName = 'Not assigned';
            if (appointment.staffId && typeof appointment.staffId === 'object' && appointment.staffId.name) staffName = appointment.staffId.name;
            else if (appointment.staffId) {
              const staff = await Staff.findById(appointment.staffId);
              staffName = staff?.name || 'Not assigned';
            }
            const businessSettingsForSms = await req.businessModels.BusinessSettings.findOne().lean().catch(() => null);
            const useAddon = canUseAddon(business, 'sms');
            if (!useAddon && !canDeductSms(business)) {
              break;
            }
            const result = await smsService.sendAppointmentConfirmation({
              to: client.phone,
              clientName: client.name || 'Client',
              appointmentData: {
                serviceName,
                date: appointment.date,
                time: appointment.time,
                staffName,
                businessName: business.name,
                businessPhone: business.contact?.phone,
                googleProfilePage: businessSettingsForSms?.googleProfilePage || '',
                googleMapsUrl: businessSettingsForSms?.googleMapsUrl || ''
              }
            });
            if (result.success) {
              if (useAddon) {
                await Business.updateOne(
                  { _id: business._id },
                  { $inc: { 'plan.addons.sms.used': 1 } }
                );
              } else {
                await deductSms(business._id, {
                  description: 'SMS appointment confirmation',
                  relatedEntity: { id: appointment?._id, type: 'Appointment' },
                });
                business = await Business.findById(business._id).lean();
              }
            }
            logSmsMessage({
              businessId: business._id,
              recipientPhone: client.phone,
              messageType: 'appointment',
              result,
              relatedEntityId: appointment?._id,
              relatedEntityType: 'Appointment',
            });
          }
        }
      }
    }
  } catch (smsErr) {
    logger.error('Error sending appointment confirmation SMS:', smsErr);
  }
}

module.exports = { sendAppointmentConfirmationNotifications };
