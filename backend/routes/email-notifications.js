const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase, setupMainDatabase } = require('../middleware/business-db');
const emailService = require('../services/email-service');

/**
 * Middleware to check if user is admin or manager
 */
function requireAdminOrManager(req, res, next) {
  if (!['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Only admin/manager can manage email notifications'
    });
  }
  next();
}

/**
 * GET /api/email-notifications/settings
 * Get email notification settings for business
 */
router.get('/settings', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const { Business } = req.mainModels;
    // Use lean() to get plain object - this ensures nested objects are accessible
    const business = await Business.findById(req.user.branchId).lean();
    
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }
    
    console.log('📱 [GET Settings] Business ID:', req.user.branchId);
    console.log('📱 [GET Settings] Business settings structure:', {
      hasSettings: !!business.settings,
      settingsKeys: business.settings ? Object.keys(business.settings) : [],
      hasWhatsappSettings: !!business.settings?.whatsappNotificationSettings,
      whatsappSettingsType: typeof business.settings?.whatsappNotificationSettings,
      whatsappSettingsKeys: business.settings?.whatsappNotificationSettings ? Object.keys(business.settings.whatsappNotificationSettings) : [],
      fullSettings: JSON.stringify(business.settings, null, 2)
    });

    // Return default structure if settings don't exist
    const defaultSettings = {
      enabled: true,
      recipientStaffIds: [],
      dailySummary: {
        enabled: true,
        time: '21:00'
      },
      weeklySummary: {
        enabled: true,
        day: 'sunday',
        time: '20:00'
      },
      appointmentNotifications: {
        enabled: true,
        newAppointment: true,
        cancellation: true,
        noShow: false,
        reminderTime: 24
      },
      receiptNotifications: {
        enabled: true,
        sendToClients: true,
        sendToStaff: true,
        highValueTransactionThreshold: 10000
      },
      exportNotifications: {
        enabled: true,
        reportExport: true,
        dataExport: true
      },
      systemAlerts: {
        enabled: true,
        lowInventory: true,
        paymentFailures: true,
        systemErrors: true
      }
    };

    const settings = business.settings?.emailNotificationSettings || defaultSettings;
    
    // Merge with defaults to ensure all fields exist
    const mergedSettings = {
      ...defaultSettings,
      ...settings,
      dailySummary: { ...defaultSettings.dailySummary, ...(settings.dailySummary || {}) },
      weeklySummary: { ...defaultSettings.weeklySummary, ...(settings.weeklySummary || {}) },
      appointmentNotifications: { ...defaultSettings.appointmentNotifications, ...(settings.appointmentNotifications || {}) },
      receiptNotifications: { ...defaultSettings.receiptNotifications, ...(settings.receiptNotifications || {}) },
      exportNotifications: { ...defaultSettings.exportNotifications, ...(settings.exportNotifications || {}) },
      systemAlerts: { ...defaultSettings.systemAlerts, ...(settings.systemAlerts || {}) }
    };

    // Get WhatsApp settings
    const defaultWhatsappSettings = {
      enabled: false,
      receiptNotifications: {
        enabled: false,
        autoSendToClients: true,
        highValueThreshold: 0
      },
      appointmentNotifications: {
        enabled: false,
        newAppointments: false,
        confirmations: false,
        reminders: false,
        cancellations: false
      },
      systemAlerts: {
        enabled: false,
        lowInventory: false,
        paymentFailures: false
      }
    };

    // Get WhatsApp settings from database
    // business is already a plain object (from .lean()), so we can access nested objects directly
    const dbWhatsappSettings = business.settings?.whatsappNotificationSettings;
    
    // Debug logging
    console.log('📱 [GET Settings] WhatsApp settings from DB:', {
      hasWhatsappSettings: !!dbWhatsappSettings,
      dbEnabled: dbWhatsappSettings?.enabled,
      dbReceiptNotificationsEnabled: dbWhatsappSettings?.receiptNotifications?.enabled,
      dbWhatsappSettingsType: typeof dbWhatsappSettings,
      dbWhatsappSettingsIsArray: Array.isArray(dbWhatsappSettings),
      dbWhatsappSettingsKeys: dbWhatsappSettings ? Object.keys(dbWhatsappSettings) : [],
      fullDbSettings: JSON.stringify(dbWhatsappSettings, null, 2),
      fullBusinessSettings: JSON.stringify(business.settings, null, 2)
    });
    
    // If we have saved settings, use them directly (only merge missing nested properties)
    // Check if settings exist and are not just an empty object
    const hasSavedSettings = dbWhatsappSettings && 
                             typeof dbWhatsappSettings === 'object' && 
                             !Array.isArray(dbWhatsappSettings) &&
                             (dbWhatsappSettings.enabled !== undefined || 
                              dbWhatsappSettings.receiptNotifications !== undefined ||
                              Object.keys(dbWhatsappSettings).length > 0);
    
    console.log('📱 [GET Settings] hasSavedSettings check:', {
      hasSavedSettings,
      dbWhatsappSettingsExists: !!dbWhatsappSettings,
      dbWhatsappSettingsType: typeof dbWhatsappSettings,
      dbWhatsappSettingsIsArray: Array.isArray(dbWhatsappSettings),
      dbEnabled: dbWhatsappSettings?.enabled,
      dbKeys: dbWhatsappSettings ? Object.keys(dbWhatsappSettings) : []
    });
    
    let mergedWhatsappSettings;
    if (hasSavedSettings) {
      console.log('📱 [GET Settings] ✅ Using saved settings from database');
      console.log('📱 [GET Settings] dbWhatsappSettings.enabled:', dbWhatsappSettings.enabled);
      // We have saved settings - use saved values as base, only fill in missing nested properties
      mergedWhatsappSettings = {
        // Start with saved settings (this preserves enabled: true)
        ...dbWhatsappSettings,
        // Only merge nested objects if they exist in saved settings, otherwise use defaults
        receiptNotifications: dbWhatsappSettings.receiptNotifications ? {
          ...defaultWhatsappSettings.receiptNotifications,
          ...dbWhatsappSettings.receiptNotifications
        } : defaultWhatsappSettings.receiptNotifications,
        appointmentNotifications: dbWhatsappSettings.appointmentNotifications ? {
          ...defaultWhatsappSettings.appointmentNotifications,
          ...dbWhatsappSettings.appointmentNotifications
        } : defaultWhatsappSettings.appointmentNotifications,
        systemAlerts: dbWhatsappSettings.systemAlerts ? {
          ...defaultWhatsappSettings.systemAlerts,
          ...dbWhatsappSettings.systemAlerts
        } : defaultWhatsappSettings.systemAlerts
      };
      console.log('📱 [GET Settings] After merge - enabled:', mergedWhatsappSettings.enabled);
      console.log('📱 [GET Settings] After merge - receiptNotifications.enabled:', mergedWhatsappSettings.receiptNotifications?.enabled);
    } else {
      console.log('📱 [GET Settings] ❌ No saved settings found, using defaults');
      console.log('📱 [GET Settings] hasSavedSettings check failed. dbWhatsappSettings:', dbWhatsappSettings);
      // No saved settings - use defaults
      mergedWhatsappSettings = defaultWhatsappSettings;
    }
    
    // Debug logging after merge
    console.log('📱 [GET Settings] Merged WhatsApp settings:', {
      enabled: mergedWhatsappSettings.enabled,
      receiptNotificationsEnabled: mergedWhatsappSettings.receiptNotifications?.enabled,
      fullMerged: JSON.stringify(mergedWhatsappSettings, null, 2)
    });

    // Final verification before sending
    console.log('📱 [GET Settings] Final response - whatsappNotificationSettings.enabled:', mergedWhatsappSettings.enabled);
    
    res.json({
      success: true,
      data: {
        ...mergedSettings,
        whatsappNotificationSettings: mergedWhatsappSettings
      }
    });
  } catch (error) {
    console.error('Error fetching email notification settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch email notification settings'
    });
  }
});

/**
 * PUT /api/email-notifications/settings
 * Update email notification settings for business
 */
router.put('/settings', authenticateToken, setupMainDatabase, requireAdminOrManager, async (req, res) => {
  try {
    const { Business } = req.mainModels;
    const business = await Business.findById(req.user.branchId);
    
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    // Update email notification settings
    if (!business.settings) {
      business.settings = {};
    }
    
    // Handle email notification settings
    if (req.body.emailNotificationSettings || Object.keys(req.body).some(key => !key.includes('whatsapp'))) {
      if (!business.settings.emailNotificationSettings) {
        business.settings.emailNotificationSettings = {};
      }
      business.settings.emailNotificationSettings = {
        ...business.settings.emailNotificationSettings,
        ...(req.body.emailNotificationSettings || req.body)
      };
    }
    
    // Handle WhatsApp notification settings
    if (req.body.whatsappNotificationSettings) {
      console.log('📱 [PUT Settings] Received WhatsApp settings to save:', JSON.stringify(req.body.whatsappNotificationSettings, null, 2));
      
      if (!business.settings.whatsappNotificationSettings) {
        business.settings.whatsappNotificationSettings = {};
      }
      business.settings.whatsappNotificationSettings = {
        ...business.settings.whatsappNotificationSettings,
        ...req.body.whatsappNotificationSettings
      };
      
      // Deep merge for nested objects
      if (req.body.whatsappNotificationSettings.receiptNotifications) {
        business.settings.whatsappNotificationSettings.receiptNotifications = {
          ...(business.settings.whatsappNotificationSettings.receiptNotifications || {}),
          ...req.body.whatsappNotificationSettings.receiptNotifications
        };
      }
      if (req.body.whatsappNotificationSettings.appointmentNotifications) {
        business.settings.whatsappNotificationSettings.appointmentNotifications = {
          ...(business.settings.whatsappNotificationSettings.appointmentNotifications || {}),
          ...req.body.whatsappNotificationSettings.appointmentNotifications
        };
      }
      if (req.body.whatsappNotificationSettings.systemAlerts) {
        business.settings.whatsappNotificationSettings.systemAlerts = {
          ...(business.settings.whatsappNotificationSettings.systemAlerts || {}),
          ...req.body.whatsappNotificationSettings.systemAlerts
        };
      }
      
      console.log('📱 [PUT Settings] WhatsApp settings after merge (before save):', JSON.stringify(business.settings.whatsappNotificationSettings, null, 2));
      
      // Mark nested object as modified for Mongoose - mark both the nested path and parent
      business.markModified('settings');
      business.markModified('settings.whatsappNotificationSettings');
      
      // Also try using set() to ensure Mongoose tracks the change
      business.set('settings.whatsappNotificationSettings', business.settings.whatsappNotificationSettings);
    }

    // Save and verify
    const saveResult = await business.save();
    console.log('📱 [PUT Settings] Save result:', {
      saved: !!saveResult,
      enabled: saveResult.settings?.whatsappNotificationSettings?.enabled,
      isNew: saveResult.isNew
    });
    
    // Use updateOne as an alternative to ensure nested object is saved
    if (req.body.whatsappNotificationSettings) {
      await Business.updateOne(
        { _id: req.user.branchId },
        { $set: { 'settings.whatsappNotificationSettings': business.settings.whatsappNotificationSettings } }
      );
      console.log('📱 [PUT Settings] Also updated using updateOne');
    }
    
    // Reload business to ensure we have the latest data (use lean() to get plain object)
    const savedBusiness = await Business.findById(req.user.branchId).lean();
    console.log('📱 [PUT Settings] WhatsApp settings after save (from DB):', {
      enabled: savedBusiness.settings?.whatsappNotificationSettings?.enabled,
      receiptNotificationsEnabled: savedBusiness.settings?.whatsappNotificationSettings?.receiptNotifications?.enabled,
      fullSettings: JSON.stringify(savedBusiness.settings?.whatsappNotificationSettings, null, 2)
    });

    // Use savedBusiness to ensure we return the latest data
    // Ensure we return the saved WhatsApp settings, or the ones we just set
    const returnedWhatsappSettings = savedBusiness.settings?.whatsappNotificationSettings || business.settings?.whatsappNotificationSettings;
    
    console.log('📱 [PUT Settings] Returning WhatsApp settings:', {
      enabled: returnedWhatsappSettings?.enabled,
      receiptNotificationsEnabled: returnedWhatsappSettings?.receiptNotifications?.enabled,
      fullReturned: JSON.stringify(returnedWhatsappSettings, null, 2)
    });
    
    res.json({
      success: true,
      data: {
        emailNotificationSettings: savedBusiness.settings?.emailNotificationSettings || business.settings?.emailNotificationSettings,
        whatsappNotificationSettings: returnedWhatsappSettings
      },
      message: 'Notification settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating email notification settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update email notification settings'
    });
  }
});

/**
 * GET /api/email-notifications/staff
 * Get all staff members with their email notification preferences
 */
router.get('/staff', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    console.log('📧 Fetching staff for email notifications, user:', req.user.email, 'branchId:', req.user.branchId);
    
    const { Staff } = req.businessModels;
    const staff = await Staff.find({ branchId: req.user.branchId })
      .select('name email role hasLoginAccess emailNotifications')
      .lean();
    
    console.log('📧 Staff from business database:', staff.length);

    // Get business owner from main database
    const mainConnection = await require('../config/database-manager').getMainConnection();
    const User = mainConnection.model('User', require('../models/User').schema);
    
    // Try to find business owner - check both by branchId and by current user ID
    let businessOwner = await User.findOne({
      branchId: req.user.branchId,
      role: 'admin'
    }).lean();
    
    // If not found, try to find by current user ID (in case they are the admin)
    if (!businessOwner && req.user._id) {
      businessOwner = await User.findOne({
        _id: req.user._id,
        branchId: req.user.branchId
      }).lean();
    }
    
    console.log('📧 Business owner found:', businessOwner ? businessOwner.email : 'NOT FOUND');

    // Ensure all staff have emailNotifications structure
    // Admin users always have email notifications enabled
    const staffWithDefaults = staff.map(s => ({
      ...s,
      emailNotifications: s.role === 'admin' ? {
        enabled: true, // Always enabled for admin
        preferences: s.emailNotifications?.preferences || {
          dailySummary: true,
          weeklySummary: true,
          appointmentAlerts: true,
          receiptAlerts: true,
          exportAlerts: true,
          systemAlerts: true,
          lowInventory: true
        },
        managedBy: 'admin'
      } : (s.emailNotifications || {
        enabled: false,
        preferences: {
          dailySummary: false,
          weeklySummary: false,
          appointmentAlerts: false,
          receiptAlerts: false,
          exportAlerts: false,
          systemAlerts: false,
          lowInventory: false
        },
        managedBy: 'admin'
      })
    }));

    // Always add current logged-in admin user if they are admin
    // This ensures the admin user is always in the list
    const currentUserIsAdmin = req.user.role === 'admin';
    const currentUserAlreadyInList = staffWithDefaults.some(s => 
      s._id && req.user._id && s._id.toString() === req.user._id.toString()
    );
    
    if (currentUserIsAdmin && !currentUserAlreadyInList) {
      console.log('📧 Adding current logged-in admin user to staff list:', req.user.email);
      staffWithDefaults.push({
        _id: req.user._id,
        name: req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
        email: req.user.email,
        role: 'admin',
        hasLoginAccess: true,
        emailNotifications: {
          enabled: true, // Always enabled for admin
          preferences: {
            dailySummary: true,
            weeklySummary: true,
            appointmentAlerts: true,
            receiptAlerts: true,
            exportAlerts: true,
            systemAlerts: true,
            lowInventory: true
          },
          managedBy: 'admin'
        },
        isOwner: true
      });
    }

    // Add business owner if exists and not already in the list
    if (businessOwner) {
      // Check if business owner is already in the list
      const ownerAlreadyInList = staffWithDefaults.some(s => 
        s._id && businessOwner._id && s._id.toString() === businessOwner._id.toString()
      );
      
      if (!ownerAlreadyInList) {
        console.log('📧 Adding business owner to staff list:', businessOwner.email);
        staffWithDefaults.push({
          _id: businessOwner._id,
          name: businessOwner.name || `${businessOwner.firstName || ''} ${businessOwner.lastName || ''}`.trim() || businessOwner.email,
          email: businessOwner.email,
          role: 'admin',
          hasLoginAccess: true,
          emailNotifications: {
            enabled: true, // Always enabled for admin
            preferences: {
              dailySummary: true,
              weeklySummary: true,
              appointmentAlerts: true,
              receiptAlerts: true,
              exportAlerts: true,
              systemAlerts: true,
              lowInventory: true
            },
            managedBy: 'admin'
          },
          isOwner: true
        });
      } else {
        console.log('📧 Business owner already in staff list');
      }
    }

    console.log('📧 Total staff members to return:', staffWithDefaults.length);
    res.json({
      success: true,
      data: staffWithDefaults
    });
  } catch (error) {
    console.error('Error fetching staff email notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch staff email notifications'
    });
  }
});

/**
 * PUT /api/email-notifications/staff/:id
 * Update email notification preferences for a staff member
 */
router.put('/staff/:id', authenticateToken, setupBusinessDatabase, requireAdminOrManager, async (req, res) => {
  try {
    console.log('📧 Email notification update request:', {
      staffId: req.params.id,
      userId: req.user._id,
      branchId: req.user.branchId,
      enabled: req.body.enabled,
      body: req.body
    });

    const { Staff } = req.businessModels;
    
    // First try to find in business database (Staff collection)
    let staff = await Staff.findById(req.params.id);

    // If not found in Staff collection, check if it's the business owner (User in main database)
    if (!staff) {
      console.log('📧 Staff not found in business database, checking if it\'s business owner...');
      const { setupMainDatabase } = require('../middleware/business-db');
      const mainConnection = await require('../config/database-manager').getMainConnection();
      const User = mainConnection.model('User', require('../models/User').schema);
      const businessOwner = await User.findOne({
        _id: req.params.id,
        branchId: req.user.branchId
      });

      if (businessOwner) {
        console.log('✅ Found business owner in main database');
        // Admin users always have email notifications enabled
        // But we allow them to update their preferences
        // We'll update the business settings to include them in recipient lists
        
        const databaseManager = require('../config/database-manager');
        const mainConnection = await databaseManager.getMainConnection();
        const Business = mainConnection.model('Business', require('../models/Business').schema);
        const business = await Business.findById(req.user.branchId);
        
        // Admin user preferences (always enabled, but preferences can be set)
        // Define outside if block so it's available for the return statement
        const adminPreferences = {
          dailySummary: req.body.preferences?.dailySummary !== false,
          weeklySummary: req.body.preferences?.weeklySummary !== false,
          appointmentAlerts: req.body.preferences?.appointmentAlerts !== false,
          receiptAlerts: req.body.preferences?.receiptAlerts !== false,
          exportAlerts: req.body.preferences?.exportAlerts !== false,
          systemAlerts: req.body.preferences?.systemAlerts !== false,
          lowInventory: req.body.preferences?.lowInventory !== false
        };
        
        if (business) {
          // Get all staff to build recipient lists
          const allStaff = await Staff.find({ branchId: req.user.branchId }).lean();
          
          // Build recipient lists including admin user if preferences are enabled
          const dailySummaryRecipients = allStaff
            .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.dailySummary && s.email)
            .map(s => s._id);
          if (adminPreferences.dailySummary && businessOwner.email) {
            dailySummaryRecipients.push(businessOwner._id);
          }
          
          const weeklySummaryRecipients = allStaff
            .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.weeklySummary && s.email)
            .map(s => s._id);
          if (adminPreferences.weeklySummary && businessOwner.email) {
            weeklySummaryRecipients.push(businessOwner._id);
          }
          
          const appointmentRecipients = allStaff
            .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.appointmentAlerts && s.email)
            .map(s => s._id);
          if (adminPreferences.appointmentAlerts && businessOwner.email) {
            appointmentRecipients.push(businessOwner._id);
          }
          
          const receiptRecipients = allStaff
            .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.receiptAlerts && s.email)
            .map(s => s._id);
          if (adminPreferences.receiptAlerts && businessOwner.email) {
            receiptRecipients.push(businessOwner._id);
          }
          
          const exportRecipients = allStaff
            .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.exportAlerts && s.email)
            .map(s => s._id);
          if (adminPreferences.exportAlerts && businessOwner.email) {
            exportRecipients.push(businessOwner._id);
          }
          
          const systemAlertsRecipients = allStaff
            .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.systemAlerts && s.email)
            .map(s => s._id);
          if (adminPreferences.systemAlerts && businessOwner.email) {
            systemAlertsRecipients.push(businessOwner._id);
          }
          
          const generalRecipients = allStaff
            .filter(s => s.emailNotifications?.enabled && s.email)
            .map(s => s._id);
          if (businessOwner.email) {
            generalRecipients.push(businessOwner._id);
          }
          
          // Update business settings
          if (!business.settings) {
            business.settings = {};
          }
          if (!business.settings.emailNotificationSettings) {
            business.settings.emailNotificationSettings = {};
          }
          
          business.settings.emailNotificationSettings = {
            ...business.settings.emailNotificationSettings,
            enabled: true, // Always enabled if admin is updating
            recipientStaffIds: generalRecipients,
            dailySummary: {
              ...business.settings.emailNotificationSettings.dailySummary,
              enabled: dailySummaryRecipients.length > 0,
              recipientStaffIds: dailySummaryRecipients
            },
            weeklySummary: {
              ...business.settings.emailNotificationSettings.weeklySummary,
              enabled: weeklySummaryRecipients.length > 0,
              recipientStaffIds: weeklySummaryRecipients
            },
            appointmentNotifications: {
              ...business.settings.emailNotificationSettings.appointmentNotifications,
              enabled: appointmentRecipients.length > 0,
              newAppointments: appointmentRecipients.length > 0,
              recipientStaffIds: appointmentRecipients
            },
            receiptNotifications: {
              ...business.settings.emailNotificationSettings.receiptNotifications,
              enabled: receiptRecipients.length > 0,
              sendToStaff: receiptRecipients.length > 0,
              recipientStaffIds: receiptRecipients
            },
            exportNotifications: {
              ...business.settings.emailNotificationSettings.exportNotifications,
              enabled: exportRecipients.length > 0,
              recipientStaffIds: exportRecipients
            },
            systemAlerts: {
              ...business.settings.emailNotificationSettings.systemAlerts,
              enabled: systemAlertsRecipients.length > 0,
              recipientStaffIds: systemAlertsRecipients
            }
          };
          
          await business.save();
          console.log('✅ Business email notification settings updated for admin user');
        }
        
        // Return success with admin preferences (always enabled)
        return res.json({
          success: true,
          data: {
            enabled: true, // Always enabled for admin
            preferences: adminPreferences,
            managedBy: 'admin',
            lastUpdatedBy: req.user._id,
            lastUpdatedAt: new Date()
          },
          message: 'Admin email notification preferences updated successfully'
        });
      }

      console.log('❌ Staff not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    console.log('✅ Staff found:', {
      id: staff._id,
      name: staff.name,
      role: staff.role,
      branchId: staff.branchId,
      currentEnabled: staff.emailNotifications?.enabled
    });

    // Admin users always have email notifications ON and cannot be changed
    if (staff.role === 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Admin email notifications are always enabled and cannot be changed'
      });
    }

    // Check if staff belongs to same business
    if (staff.branchId && staff.branchId.toString() !== req.user.branchId.toString()) {
      console.log('❌ Branch ID mismatch:', {
        staffBranchId: staff.branchId,
        userBranchId: req.user.branchId
      });
      return res.status(403).json({
        success: false,
        error: 'Unauthorized access'
      });
    }

    // Update email notification preferences
    staff.emailNotifications = {
      enabled: req.body.enabled !== undefined ? req.body.enabled : staff.emailNotifications?.enabled || false,
      preferences: {
        ...(staff.emailNotifications?.preferences || {}),
        ...(req.body.preferences || {})
      },
      managedBy: 'admin',
      lastUpdatedBy: req.user._id,
      lastUpdatedAt: new Date()
    };

    await staff.save();

    // Update business settings recipient lists based on all staff preferences
    const databaseManager = require('../config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(req.user.branchId);
    
    if (business) {
      // Get all staff with their preferences
      const allStaff = await Staff.find({ branchId: req.user.branchId }).lean();
      
      // Build recipient lists based on enabled preferences
      const dailySummaryRecipients = allStaff
        .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.dailySummary && s.email)
        .map(s => s._id);
      
      const weeklySummaryRecipients = allStaff
        .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.weeklySummary && s.email)
        .map(s => s._id);
      
      const appointmentRecipients = allStaff
        .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.appointmentAlerts && s.email)
        .map(s => s._id);
      
      const receiptRecipients = allStaff
        .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.receiptAlerts && s.email)
        .map(s => s._id);
      
      const exportRecipients = allStaff
        .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.exportAlerts && s.email)
        .map(s => s._id);
      
      const systemAlertsRecipients = allStaff
        .filter(s => s.emailNotifications?.enabled && s.emailNotifications?.preferences?.systemAlerts && s.email)
        .map(s => s._id);
      
      const generalRecipients = allStaff
        .filter(s => s.emailNotifications?.enabled && s.email)
        .map(s => s._id);
      
      // Update business settings
      if (!business.settings) {
        business.settings = {};
      }
      if (!business.settings.emailNotificationSettings) {
        business.settings.emailNotificationSettings = {};
      }
      
      // Enable notifications if any staff have them enabled
      const hasAnyEnabled = allStaff.some(s => s.emailNotifications?.enabled);
      
      business.settings.emailNotificationSettings = {
        ...business.settings.emailNotificationSettings,
        enabled: hasAnyEnabled,
        recipientStaffIds: generalRecipients,
        dailySummary: {
          ...business.settings.emailNotificationSettings.dailySummary,
          enabled: dailySummaryRecipients.length > 0,
          recipientStaffIds: dailySummaryRecipients
        },
        weeklySummary: {
          ...business.settings.emailNotificationSettings.weeklySummary,
          enabled: weeklySummaryRecipients.length > 0,
          recipientStaffIds: weeklySummaryRecipients
        },
        appointmentNotifications: {
          ...business.settings.emailNotificationSettings.appointmentNotifications,
          enabled: appointmentRecipients.length > 0,
          newAppointments: appointmentRecipients.length > 0,
          recipientStaffIds: appointmentRecipients
        },
        receiptNotifications: {
          ...business.settings.emailNotificationSettings.receiptNotifications,
          enabled: receiptRecipients.length > 0,
          sendToStaff: receiptRecipients.length > 0,
          recipientStaffIds: receiptRecipients
        },
        exportNotifications: {
          ...business.settings.emailNotificationSettings.exportNotifications,
          enabled: exportRecipients.length > 0,
          recipientStaffIds: exportRecipients
        },
        systemAlerts: {
          ...business.settings.emailNotificationSettings.systemAlerts,
          enabled: systemAlertsRecipients.length > 0,
          recipientStaffIds: systemAlertsRecipients
        }
      };
      
      await business.save();
      console.log('✅ Business email notification settings updated with recipient lists');
    }

    console.log('✅ Email notifications updated successfully:', {
      enabled: staff.emailNotifications.enabled,
      staffId: staff._id
    });

    res.json({
      success: true,
      data: staff.emailNotifications,
      message: 'Staff email notification preferences updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating staff email notifications:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to update staff email notifications',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/email-notifications/test
 * Send a test email
 */
router.post('/test', authenticateToken, setupBusinessDatabase, requireAdminOrManager, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    const result = await emailService.testConnection(email);

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to send test email'
      });
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test email'
    });
  }
});

/**
 * POST /api/email-notifications/send-daily-summary
 * Manually trigger daily summary email (for testing)
 */
router.post('/send-daily-summary', authenticateToken, setupMainDatabase, setupBusinessDatabase, requireAdminOrManager, async (req, res) => {
  try {
    const { Business } = req.mainModels;
    const { Staff, Receipt, Sale, Appointment, Client } = req.businessModels;
    const business = await Business.findById(req.user.branchId);

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Business not found'
      });
    }

    const settings = business.settings?.emailNotificationSettings;
    if (!settings?.dailySummary?.enabled) {
      return res.status(400).json({
        success: false,
        error: 'Daily summary notifications are not enabled'
      });
    }

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayDateString = today.toISOString().split('T')[0];

    // Get today's sales (from Sale model - this is the primary sales data)
    const sales = await Sale.find({
      branchId: req.user.branchId,
      date: {
        $gte: today,
        $lt: tomorrow
      },
      status: { $nin: ['cancelled', 'Cancelled'] } // Exclude cancelled sales (case variations)
    }).lean();

    // Also get receipts for backward compatibility (if any exist)
    const receipts = await Receipt.find({
      branchId: req.user.branchId,
      date: {
        $gte: todayDateString,
        $lt: tomorrow.toISOString().split('T')[0]
      }
    }).lean();

    const appointments = await Appointment.find({
      branchId: req.user.branchId,
      date: todayDateString
    }).lean();

    const newClients = await Client.find({
      branchId: req.user.branchId,
      createdAt: { $gte: today }
    }).lean();

    // Calculate summary from Sales (primary) and Receipts (backup)
    const salesRevenue = sales.reduce((sum, s) => {
      const amount = s.grossTotal || s.totalAmount || s.netTotal || 0;
      return sum + amount;
    }, 0);
    
    const receiptsRevenue = receipts.reduce((sum, r) => sum + (r.total || 0), 0);
    
    const totalRevenue = salesRevenue + receiptsRevenue;
    const totalSales = sales.length + receipts.length;
    const appointmentCount = appointments.length;
    const newClientsCount = newClients.length;

    // Get recipient staff
    const recipientStaffIds = settings.dailySummary.recipientStaffIds || [];
    const recipients = await Staff.find({
      _id: { $in: recipientStaffIds },
      'emailNotifications.enabled': true,
      'emailNotifications.preferences.dailySummary': true,
      email: { $exists: true, $ne: '' }
    }).lean();

    // Send emails
    const results = [];
    for (const staff of recipients) {
      const result = await emailService.sendDailySummary({
        to: staff.email,
        businessName: business.name,
        date: today.toISOString().split('T')[0],
        summaryData: {
          totalSales,
          totalRevenue,
          appointmentCount,
          newClients: newClientsCount,
          topServices: [],
          topProducts: []
        }
      });
      results.push({ email: staff.email, success: result.success });
    }

    res.json({
      success: true,
      message: `Daily summary sent to ${results.filter(r => r.success).length} recipients`,
      results
    });
  } catch (error) {
    console.error('Error sending daily summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send daily summary'
    });
  }
});

module.exports = router;

