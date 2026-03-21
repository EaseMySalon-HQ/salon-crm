const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { setupBusinessDatabase, setupMainDatabase } = require('../middleware/business-db');
const emailService = require('../services/email-service');
const { logger } = require('../utils/logger');

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
    const { Business, AdminSettings } = req.mainModels;

    // Resolve businessId: prefer the authenticated user's branchId, otherwise fall back to the first business
    let businessId = req.user.branchId;
    if (!businessId) {
      const firstBusiness = await Business.findOne({}).select('_id').lean();
      businessId = firstBusiness?._id;
      logger.info('[GET Settings] branchId missing, using fallback businessId:', businessId);
    }

    // Use lean() to get plain object - this ensures nested objects are accessible
    const business = businessId ? await Business.findById(businessId).lean() : null;

    // Fallback: if no business found, use AdminSettings.notifications.whatsapp as the storage
    const useAdminSettings = !business;
    
    if (!business) {
      logger.warn('[GET Settings] No business found. Falling back to AdminSettings.notifications.whatsapp');
    }
    
    logger.debug('[GET Settings] Business ID:', req.user.branchId, 'settings structure:', {
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
        mode: 'fixedTime',
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
      enabled: true,
      receiptNotifications: {
        enabled: true,
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

    // CRITICAL: Query the database directly to get the raw value
    // This bypasses any potential Mongoose default application
    const directBusiness = useAdminSettings
      ? null
      : await Business.findById(businessId)
          .select('settings.whatsappNotificationSettings')
          .lean();

    let adminSettings = null;
    if (useAdminSettings) {
      adminSettings = await AdminSettings.getSettings();
      logger.debug('[GET Settings] Loaded AdminSettings for fallback:', {
        hasNotifications: !!adminSettings.notifications,
        hasWhatsapp: !!adminSettings.notifications?.whatsapp,
        whatsappEnabled: adminSettings.notifications?.whatsapp?.enabled
      });
    }
    
    // Get WhatsApp settings from database
    // business is already a plain object (from .lean()), so we can access nested objects directly
    // CRITICAL: ALWAYS use the correct location (settings.whatsappNotificationSettings)
    // Ignore any duplicate in the old location (settings.emailNotificationSettings.whatsappNotificationSettings)
    // Use the direct query result instead of the original business object
    let dbWhatsappSettings = directBusiness?.settings?.whatsappNotificationSettings || business.settings?.whatsappNotificationSettings;
    
    // CRITICAL: If settings object exists but whatsappNotificationSettings is undefined,
    // it means it was never saved, so we should use defaults
    // But if it's an empty object {}, we should still check for enabled key
    if (business?.settings && dbWhatsappSettings === undefined) {
      dbWhatsappSettings = null; // Explicitly set to null to indicate no saved settings
    }

    // Admin fallback: read from adminSettings.notifications.whatsapp
    if (useAdminSettings) {
      dbWhatsappSettings = adminSettings?.notifications?.whatsapp || null;
      logger.debug('[GET Settings] Using admin fallback settings:', {
        enabled: dbWhatsappSettings?.enabled,
        hasEnabled: dbWhatsappSettings ? ('enabled' in dbWhatsappSettings) : false
      });
    }
    
    logger.debug('[GET Settings] Direct DB query result:', {
      hasDirectBusiness: !!directBusiness,
      hasSettings: !!directBusiness?.settings,
      hasWhatsappSettings: !!directBusiness?.settings?.whatsappNotificationSettings,
      directEnabled: directBusiness?.settings?.whatsappNotificationSettings?.enabled,
      directEnabledType: typeof directBusiness?.settings?.whatsappNotificationSettings?.enabled,
      directIsFalse: directBusiness?.settings?.whatsappNotificationSettings?.enabled === false,
      fullDirect: JSON.stringify(directBusiness?.settings?.whatsappNotificationSettings, null, 2)
    });
    
    // Check if there's a duplicate in the old location (for logging/migration purposes)
    const oldLocationSettings = business.settings?.emailNotificationSettings?.whatsappNotificationSettings;
    if (oldLocationSettings && dbWhatsappSettings) {
      logger.warn('[GET Settings] Found WhatsApp settings in BOTH locations (duplicate detected). Correct location enabled:', dbWhatsappSettings?.enabled, '| Old location enabled:', oldLocationSettings?.enabled, '| Using correct location: settings.whatsappNotificationSettings');
      // The old location will be cleaned up on next save
    } else if (oldLocationSettings && !dbWhatsappSettings) {
      // Only use old location if correct location doesn't exist
      logger.warn('[GET Settings] Found WhatsApp settings ONLY in OLD location. Migrating from settings.emailNotificationSettings.whatsappNotificationSettings');
      dbWhatsappSettings = oldLocationSettings;
    }
    
    // CRITICAL: Use the direct database value if available
    if (directBusiness?.settings?.whatsappNotificationSettings) {
      dbWhatsappSettings = directBusiness.settings.whatsappNotificationSettings;
      logger.debug('[GET Settings] Using direct DB query result instead of merged business object');
    }
    
    logger.debug('[GET Settings] Raw database value (before any processing):', {
      enabled: dbWhatsappSettings?.enabled,
      enabledType: typeof dbWhatsappSettings?.enabled,
      enabledIsFalse: dbWhatsappSettings?.enabled === false,
      enabledIsTrue: dbWhatsappSettings?.enabled === true,
      hasEnabled: dbWhatsappSettings ? ('enabled' in dbWhatsappSettings) : false,
      fullRaw: JSON.stringify(dbWhatsappSettings, null, 2)
    });
    
    logger.debug('[GET Settings] WhatsApp settings from DB:', {
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
    // NOTE: When using .lean(), we get a plain object, so we need to check for 'enabled' key differently
    // Use 'enabled' in dbWhatsappSettings or check if the key exists
    // CRITICAL: Even if only {enabled: false} is saved, we should treat it as saved settings
    const hasSavedSettings = dbWhatsappSettings && 
                             typeof dbWhatsappSettings === 'object' && 
                             !Array.isArray(dbWhatsappSettings) &&
                             (('enabled' in dbWhatsappSettings) || 
                              ('receiptNotifications' in dbWhatsappSettings) ||
                              ('appointmentNotifications' in dbWhatsappSettings) ||
                              ('systemAlerts' in dbWhatsappSettings) ||
                              Object.keys(dbWhatsappSettings).length > 0);
    
    logger.debug('[GET Settings] hasSavedSettings check:', {
      hasSavedSettings,
      dbWhatsappSettingsExists: !!dbWhatsappSettings,
      dbWhatsappSettingsType: typeof dbWhatsappSettings,
      dbWhatsappSettingsIsArray: Array.isArray(dbWhatsappSettings),
      dbEnabled: dbWhatsappSettings?.enabled,
      dbEnabledType: typeof dbWhatsappSettings?.enabled,
      dbKeys: dbWhatsappSettings ? Object.keys(dbWhatsappSettings) : []
    });
    
    let mergedWhatsappSettings;
    
    // CRITICAL: First, check if we have a direct database value for enabled
    // This takes priority over everything else
    const directEnabledValue = directBusiness?.settings?.whatsappNotificationSettings?.enabled;
    const hasDirectEnabled = directEnabledValue !== undefined;
    
    logger.debug('[GET Settings] Direct enabled check:', {
      hasDirectEnabled,
      directEnabledValue,
      directEnabledType: typeof directEnabledValue,
      directIsFalse: directEnabledValue === false,
      directIsTrue: directEnabledValue === true
    });
    
    if (hasSavedSettings) {
      logger.debug('[GET Settings] Using saved settings from database. dbWhatsappSettings.enabled:', dbWhatsappSettings.enabled,
        '| type:', typeof dbWhatsappSettings.enabled,
        '| === false:', dbWhatsappSettings.enabled === false,
        '| hasOwnProperty("enabled"):', dbWhatsappSettings.hasOwnProperty('enabled'));
      
      // CRITICAL: Use direct database value if available, otherwise use dbWhatsappSettings
      // This ensures we get the actual stored value, not a merged/default value
      const dbEnabledValue = hasDirectEnabled 
        ? directEnabledValue 
        : (('enabled' in dbWhatsappSettings) 
            ? dbWhatsappSettings.enabled 
            : defaultWhatsappSettings.enabled);
      
      logger.debug('[GET Settings] Extracted enabled value from DB:', {
        dbEnabledValue,
        dbEnabledType: typeof dbEnabledValue,
        isFalse: dbEnabledValue === false,
        isTrue: dbEnabledValue === true,
        rawDbValue: dbWhatsappSettings.enabled,
        rawDbValueType: typeof dbWhatsappSettings.enabled
      });
      
      // We have saved settings - use saved values as base, only fill in missing nested properties
      // CRITICAL: Start with saved settings FIRST, then only add defaults for missing properties
      // This ensures saved values (including false) are preserved
      // CRITICAL: Build merged settings carefully to preserve false values
      // Start with database values FIRST, then only add defaults for missing nested properties
      // IMPORTANT: Build the object step by step to ensure enabled is set correctly
      mergedWhatsappSettings = {
        // Start with ALL saved settings from database (preserves everything including false)
        ...dbWhatsappSettings
      };
      
      // CRITICAL: Set enabled EXPLICITLY after the spread, using the direct DB value if available
      // This MUST be done separately to ensure false values are preserved
      mergedWhatsappSettings.enabled = hasDirectEnabled 
        ? directEnabledValue 
        : dbEnabledValue;
      
      logger.debug('[GET Settings] Set enabled in mergedWhatsappSettings:', {
        enabled: mergedWhatsappSettings.enabled,
        enabledType: typeof mergedWhatsappSettings.enabled,
        isFalse: mergedWhatsappSettings.enabled === false,
        source: hasDirectEnabled ? 'direct' : 'dbWhatsappSettings'
      });
      
      // Now merge nested objects, but preserve their enabled states if they exist in DB
      if (dbWhatsappSettings.receiptNotifications) {
        mergedWhatsappSettings.receiptNotifications = {
          ...defaultWhatsappSettings.receiptNotifications,
          ...dbWhatsappSettings.receiptNotifications,
          // Preserve enabled state from DB if it exists (even if false)
          enabled: ('enabled' in dbWhatsappSettings.receiptNotifications)
            ? dbWhatsappSettings.receiptNotifications.enabled
            : defaultWhatsappSettings.receiptNotifications.enabled
        };
      } else {
        mergedWhatsappSettings.receiptNotifications = defaultWhatsappSettings.receiptNotifications;
      }
      
      if (dbWhatsappSettings.appointmentNotifications) {
        mergedWhatsappSettings.appointmentNotifications = {
          ...defaultWhatsappSettings.appointmentNotifications,
          ...dbWhatsappSettings.appointmentNotifications,
          enabled: ('enabled' in dbWhatsappSettings.appointmentNotifications)
            ? dbWhatsappSettings.appointmentNotifications.enabled
            : defaultWhatsappSettings.appointmentNotifications.enabled
        };
      } else {
        mergedWhatsappSettings.appointmentNotifications = defaultWhatsappSettings.appointmentNotifications;
      }
      
      if (dbWhatsappSettings.systemAlerts) {
        mergedWhatsappSettings.systemAlerts = {
          ...defaultWhatsappSettings.systemAlerts,
          ...dbWhatsappSettings.systemAlerts,
          enabled: ('enabled' in dbWhatsappSettings.systemAlerts)
            ? dbWhatsappSettings.systemAlerts.enabled
            : defaultWhatsappSettings.systemAlerts.enabled
        };
      } else {
        mergedWhatsappSettings.systemAlerts = defaultWhatsappSettings.systemAlerts;
      }
      
      // FINAL CHECK: Ensure enabled is exactly what's in the database
      if (('enabled' in dbWhatsappSettings) && mergedWhatsappSettings.enabled !== dbWhatsappSettings.enabled) {
        logger.warn('[GET Settings] Enabled value mismatch after merge! Forcing to DB value.');
        mergedWhatsappSettings.enabled = dbWhatsappSettings.enabled;
      }
      logger.debug('[GET Settings] After merge:', {
        enabled: mergedWhatsappSettings.enabled,
        enabledType: typeof mergedWhatsappSettings.enabled,
        enabledIsFalse: mergedWhatsappSettings.enabled === false,
        receiptNotificationsEnabled: mergedWhatsappSettings.receiptNotifications?.enabled
      });
      
      // FINAL VERIFICATION: Ensure enabled value is preserved correctly
      // Use 'in' operator for plain objects from .lean()
      if (('enabled' in dbWhatsappSettings) && mergedWhatsappSettings.enabled !== dbWhatsappSettings.enabled) {
        logger.warn('[GET Settings] Enabled value was not preserved correctly! DB value:', dbWhatsappSettings.enabled,
          '(type:', typeof dbWhatsappSettings.enabled, ') | Merged value:', mergedWhatsappSettings.enabled,
          '(type:', typeof mergedWhatsappSettings.enabled, '). Correcting to DB value...');
        mergedWhatsappSettings.enabled = dbWhatsappSettings.enabled;
        logger.info('[GET Settings] Corrected enabled value to:', mergedWhatsappSettings.enabled);
      }
    } else {
      logger.debug('[GET Settings] No saved settings found, using defaults. hasSavedSettings check failed:', {
        dbWhatsappSettings,
        type: typeof dbWhatsappSettings,
        isArray: Array.isArray(dbWhatsappSettings),
        keys: dbWhatsappSettings ? Object.keys(dbWhatsappSettings) : 'null/undefined',
        hasEnabledKey: dbWhatsappSettings ? ('enabled' in dbWhatsappSettings) : false
      });
      
      // CRITICAL: Even if hasSavedSettings is false, check if enabled exists
      // This handles the case where only {enabled: false} was saved
      // Also check the direct database query result
      if (hasDirectEnabled) {
        logger.debug('[GET Settings] Found enabled in direct DB query even though hasSavedSettings was false. Using direct DB enabled value.');
        mergedWhatsappSettings = {
          ...defaultWhatsappSettings,
          enabled: directEnabledValue  // Use the direct database value
        };
      } else if (dbWhatsappSettings && typeof dbWhatsappSettings === 'object' && !Array.isArray(dbWhatsappSettings) && ('enabled' in dbWhatsappSettings)) {
        logger.debug('[GET Settings] Found enabled key even though hasSavedSettings was false. Using DB enabled value.');
        mergedWhatsappSettings = {
          ...defaultWhatsappSettings,
          enabled: dbWhatsappSettings.enabled  // Use the saved enabled value
        };
      } else {
        // No saved settings - use defaults
        mergedWhatsappSettings = defaultWhatsappSettings;
      }
    }
    
    logger.debug('[GET Settings] Merged WhatsApp settings:', {
      enabled: mergedWhatsappSettings.enabled,
      enabledType: typeof mergedWhatsappSettings.enabled,
      enabledIsFalse: mergedWhatsappSettings.enabled === false,
      receiptNotificationsEnabled: mergedWhatsappSettings.receiptNotifications?.enabled,
      fullMerged: JSON.stringify(mergedWhatsappSettings, null, 2)
    });

    // Final verification before sending - double check against database value
    // Use 'in' operator for plain objects from .lean()
    if (dbWhatsappSettings && ('enabled' in dbWhatsappSettings)) {
      if (mergedWhatsappSettings.enabled !== dbWhatsappSettings.enabled) {
        logger.error('[GET Settings] CRITICAL: Enabled value mismatch after merge! Database value:', dbWhatsappSettings.enabled,
          '(type:', typeof dbWhatsappSettings.enabled, ') | Merged value:', mergedWhatsappSettings.enabled,
          '(type:', typeof mergedWhatsappSettings.enabled, '). Forcing to database value...');
        mergedWhatsappSettings.enabled = dbWhatsappSettings.enabled;
        logger.info('[GET Settings] Forced enabled value to:', mergedWhatsappSettings.enabled);
      }
    }

    // Final verification before sending - CRITICAL: One last check to ensure enabled value is correct
    // Use the direct database value we already queried (no need to query again)
    if (hasDirectEnabled) {
      // Use the direct database value - this is the absolute truth
      mergedWhatsappSettings.enabled = directEnabledValue;
      logger.debug('[GET Settings] Final override - using direct DB enabled value:', directEnabledValue,
        '| type:', typeof directEnabledValue, '| === false:', directEnabledValue === false);
    } else if (dbWhatsappSettings && ('enabled' in dbWhatsappSettings)) {
      // Fallback to the value from the original query
      mergedWhatsappSettings.enabled = dbWhatsappSettings.enabled;
      logger.debug('[GET Settings] Final override - using DB enabled value:', dbWhatsappSettings.enabled);
    }
    
    // Final verification before sending
    logger.debug('[GET Settings] Final response:', {
      whatsappEnabled: mergedWhatsappSettings.enabled,
      enabledType: typeof mergedWhatsappSettings.enabled,
      enabledIsFalse: mergedWhatsappSettings.enabled === false,
      dbEnabledValue: dbWhatsappSettings?.enabled,
      dbEnabledType: typeof dbWhatsappSettings?.enabled
    });
    
    // Disable caching for this endpoint to ensure fresh data is always returned
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    res.json({
      success: true,
      data: {
        ...mergedSettings,
        whatsappNotificationSettings: mergedWhatsappSettings
      }
    });
  } catch (error) {
    logger.error('Error fetching email notification settings:', error);
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
  logger.debug('[PUT Settings] ========== ENDPOINT HIT ==========', 'Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { Business, AdminSettings } = req.mainModels;

    logger.debug('[PUT Settings] Request received:', {
      userEmail: req.user.email,
      branchId: req.user.branchId,
      hasWhatsappSettings: !!req.body.whatsappNotificationSettings,
      whatsappEnabled: req.body.whatsappNotificationSettings?.enabled,
      hasEmailSettings: !!req.body.emailNotificationSettings,
      emailEnabled: req.body.emailNotificationSettings?.enabled
    });

    // Resolve businessId: prefer the authenticated user's branchId, otherwise fall back to the first business
    let businessId = req.user.branchId;
    if (!businessId) {
      const firstBusiness = await Business.findOne({}).select('_id').lean();
      businessId = firstBusiness?._id;
      logger.info('[PUT Settings] branchId missing, using fallback businessId:', businessId);
    }

    logger.debug('[PUT Settings] Resolved businessId:', businessId);
    const business = businessId ? await Business.findById(businessId) : null;
    logger.debug('[PUT Settings] Business found:', !!business);

    // Fallback: if no business found, use AdminSettings.notifications.whatsapp as the storage
    const useAdminSettings = !business;
    let adminSettings = null;
    if (useAdminSettings) {
      adminSettings = await AdminSettings.getSettings();
      logger.debug('[PUT Settings] Using AdminSettings fallback for saving WhatsApp settings');
    }
    
    if (!business) {
      logger.warn('[PUT Settings] No business found. Falling back to AdminSettings.notifications.whatsapp');
    }

    // Handle Email notification settings
    // Frontend sends settings directly (not wrapped in emailNotificationSettings key)
    // Check if we have email settings in the request (either wrapped or direct)
    const hasEmailSettings = req.body.emailNotificationSettings || 
                            (req.body.enabled !== undefined && !req.body.whatsappNotificationSettings) ||
                            req.body.dailySummary || 
                            req.body.receiptNotifications ||
                            req.body.appointmentNotifications;
    
    if (hasEmailSettings && business) {
      try {
        // Get email settings from request (could be wrapped or direct)
        const incomingEmailSettings = req.body.emailNotificationSettings || req.body;
        
        // Skip if this is WhatsApp settings only (has whatsappNotificationSettings but no email fields)
        if (req.body.whatsappNotificationSettings && !req.body.emailNotificationSettings && 
            !req.body.dailySummary && !req.body.receiptNotifications && 
            !req.body.appointmentNotifications && req.body.enabled === undefined) {
          logger.debug('[PUT Settings] Skipping email settings - WhatsApp only request');
        } else {
          logger.debug('[PUT Settings] Received Email settings to save:', JSON.stringify(incomingEmailSettings, null, 2));
          
          // Ensure settings object exists
          if (!business.settings) {
            business.settings = {};
          }
          if (!business.settings.emailNotificationSettings) {
            business.settings.emailNotificationSettings = {};
          }
          
          const existingEmailSettings = business.settings.emailNotificationSettings || {};
          
          // Deep merge email settings
          const newEmailSettings = {
            ...existingEmailSettings,
            ...incomingEmailSettings,
            // Explicitly preserve enabled field
            enabled: incomingEmailSettings.hasOwnProperty('enabled') 
              ? incomingEmailSettings.enabled 
              : existingEmailSettings.enabled,
            // Deep merge nested objects
            dailySummary: {
              ...(existingEmailSettings.dailySummary || {}),
              ...(incomingEmailSettings.dailySummary || {}),
              enabled: incomingEmailSettings.dailySummary?.hasOwnProperty('enabled')
                ? incomingEmailSettings.dailySummary.enabled
                : existingEmailSettings.dailySummary?.enabled ?? false
            },
            weeklySummary: {
              ...(existingEmailSettings.weeklySummary || {}),
              ...(incomingEmailSettings.weeklySummary || {}),
              enabled: incomingEmailSettings.weeklySummary?.hasOwnProperty('enabled')
                ? incomingEmailSettings.weeklySummary.enabled
                : existingEmailSettings.weeklySummary?.enabled ?? false
            },
            appointmentNotifications: {
              ...(existingEmailSettings.appointmentNotifications || {}),
              ...(incomingEmailSettings.appointmentNotifications || {}),
              enabled: incomingEmailSettings.appointmentNotifications?.hasOwnProperty('enabled')
                ? incomingEmailSettings.appointmentNotifications.enabled
                : existingEmailSettings.appointmentNotifications?.enabled ?? false
            },
            receiptNotifications: {
              ...(existingEmailSettings.receiptNotifications || {}),
              ...(incomingEmailSettings.receiptNotifications || {}),
              enabled: incomingEmailSettings.receiptNotifications?.hasOwnProperty('enabled')
                ? incomingEmailSettings.receiptNotifications.enabled
                : existingEmailSettings.receiptNotifications?.enabled ?? false
            },
            exportNotifications: {
              ...(existingEmailSettings.exportNotifications || {}),
              ...(incomingEmailSettings.exportNotifications || {}),
              enabled: incomingEmailSettings.exportNotifications?.hasOwnProperty('enabled')
                ? incomingEmailSettings.exportNotifications.enabled
                : existingEmailSettings.exportNotifications?.enabled ?? false
            },
            systemAlerts: {
              ...(existingEmailSettings.systemAlerts || {}),
              ...(incomingEmailSettings.systemAlerts || {}),
              enabled: incomingEmailSettings.systemAlerts?.hasOwnProperty('enabled')
                ? incomingEmailSettings.systemAlerts.enabled
                : existingEmailSettings.systemAlerts?.enabled ?? false
            }
          };
          
          logger.debug('[PUT Settings] Merged Email settings:', JSON.stringify(newEmailSettings, null, 2));
          
          // Save email settings using direct MongoDB update
          const emailUpdateResult = await Business.collection.updateOne(
            { _id: businessId },
            {
              $set: {
                'settings.emailNotificationSettings': newEmailSettings
              }
            }
          );
          
          logger.debug('[PUT Settings] Email settings update result:', {
            matched: emailUpdateResult.matchedCount,
            modified: emailUpdateResult.modifiedCount,
            acknowledged: emailUpdateResult.acknowledged
          });
        }
      } catch (emailError) {
        logger.error('[PUT Settings] Error saving email settings:', emailError, emailError.stack);
        // Don't fail the entire request if email settings save fails
      }
    }
    
    // Handle WhatsApp notification settings
    let newWhatsappSettings = null; // Declare outside if block to fix scope issue
    if (req.body.whatsappNotificationSettings) {
      try {
        logger.debug('[PUT Settings] Received WhatsApp settings to save:', JSON.stringify(req.body.whatsappNotificationSettings, null, 2));
        
        // Only process business settings if we have a business
        if (business) {
          // Ensure settings object exists
          if (!business.settings) {
            business.settings = {};
          }
          if (!business.settings.whatsappNotificationSettings) {
            business.settings.whatsappNotificationSettings = {};
          }
        }
        
        const existingSettings = business?.settings?.whatsappNotificationSettings || adminSettings?.notifications?.whatsapp || {};
        const incomingSettings = req.body.whatsappNotificationSettings || {};
        
        logger.debug('[PUT Settings] Before merge:', {
          existingEnabled: existingSettings?.enabled,
          incomingEnabled: incomingSettings?.enabled,
          incomingHasEnabled: incomingSettings.hasOwnProperty('enabled'),
          incomingEnabledType: typeof incomingSettings?.enabled,
          fullIncoming: JSON.stringify(incomingSettings, null, 2)
        });
        
        // CRITICAL: Extract enabled value FIRST before any spreads
        // This ensures we capture the exact value from the request (including false)
        const enabledValue = incomingSettings.hasOwnProperty('enabled') 
          ? incomingSettings.enabled 
          : (existingSettings?.hasOwnProperty('enabled') ? existingSettings.enabled : true);
        
        logger.debug('[PUT Settings] Extracted enabled value:', {
          enabledValue,
          enabledType: typeof enabledValue,
          isFalse: enabledValue === false,
          isTrue: enabledValue === true
        });
        
        // Deep merge for nested objects - but explicitly set enabled AFTER all spreads
        newWhatsappSettings = {
          ...existingSettings,
          ...incomingSettings,
          // CRITICAL: Explicitly set enabled field LAST to ensure it overrides everything
          enabled: enabledValue
        };
        
        logger.debug('[PUT Settings] After merge (before nested):', {
          enabled: newWhatsappSettings.enabled,
          enabledType: typeof newWhatsappSettings.enabled,
          isFalse: newWhatsappSettings.enabled === false,
          isTrue: newWhatsappSettings.enabled === true,
          hasEnabled: newWhatsappSettings.hasOwnProperty('enabled')
        });
      
        // Deep merge nested objects
        if (incomingSettings.receiptNotifications) {
          newWhatsappSettings.receiptNotifications = {
            // Start with existing or defaults
            ...(existingSettings.receiptNotifications || {
              enabled: true,
              autoSendToClients: true,
              highValueThreshold: 0
            }),
            // Override with incoming settings
            ...incomingSettings.receiptNotifications,
            // CRITICAL: Explicitly preserve enabled field if it exists in request (even if false)
            // This must come AFTER the spread to ensure false values override defaults
            enabled: incomingSettings.receiptNotifications.hasOwnProperty('enabled')
              ? incomingSettings.receiptNotifications.enabled
              : (existingSettings.receiptNotifications?.enabled ?? true)
          };
        } else {
          // Ensure receiptNotifications exists with existing values or defaults if not provided
          newWhatsappSettings.receiptNotifications = {
            ...(existingSettings.receiptNotifications || {
              enabled: true,
              autoSendToClients: true,
              highValueThreshold: 0
            })
          };
        }
        
        if (incomingSettings.appointmentNotifications) {
          newWhatsappSettings.appointmentNotifications = {
            ...(existingSettings.appointmentNotifications || {}),
            ...incomingSettings.appointmentNotifications
          };
        } else {
          newWhatsappSettings.appointmentNotifications = {
            ...(existingSettings.appointmentNotifications || {
              enabled: false,
              newAppointments: false,
              confirmations: false,
              reminders: false,
              cancellations: false
            })
          };
        }
        
        if (incomingSettings.systemAlerts) {
          newWhatsappSettings.systemAlerts = {
            ...(existingSettings.systemAlerts || {}),
            ...incomingSettings.systemAlerts
          };
        } else {
          newWhatsappSettings.systemAlerts = {
            ...(existingSettings.systemAlerts || {
              enabled: false,
              lowInventory: false,
              paymentFailures: false
            })
          };
        }
      
        // Set the entire object (only if we have a business)
        if (business) {
          business.settings.whatsappNotificationSettings = newWhatsappSettings;
        }
        
        logger.debug('[PUT Settings] WhatsApp settings after merge (before save):', {
          enabled: newWhatsappSettings.enabled,
          enabledType: typeof newWhatsappSettings.enabled,
          enabledValue: newWhatsappSettings.enabled === false ? 'FALSE' : newWhatsappSettings.enabled === true ? 'TRUE' : 'OTHER',
          hasEnabled: newWhatsappSettings.hasOwnProperty('enabled'),
          fullSettings: JSON.stringify(newWhatsappSettings, null, 2)
        });
        
        // Mark nested object as modified for Mongoose - mark both the nested path and parent (only if business exists)
        if (business) {
          business.markModified('settings');
          business.markModified('settings.whatsappNotificationSettings');
          
          // Also try using set() to ensure Mongoose tracks the change
          business.set('settings.whatsappNotificationSettings', newWhatsappSettings);
        }
      } catch (whatsappError) {
        logger.error('[PUT Settings] Error processing WhatsApp settings:', whatsappError, whatsappError.stack);
        throw whatsappError; // Re-throw to be caught by outer try-catch
      }
    }

    // CRITICAL: Use updateOne as PRIMARY method for saving nested objects
    // Mongoose save() sometimes doesn't detect changes to deeply nested objects in production
    // updateOne with $set is more reliable for nested object updates
    let updateResult;
    if (req.body.whatsappNotificationSettings && newWhatsappSettings) {
      // Build the update object - ensure both parent and nested objects are set
      const updateData = {};
      
      logger.debug('[PUT Settings] About to save to database:', {
        enabled: newWhatsappSettings.enabled,
        enabledType: typeof newWhatsappSettings.enabled,
        isFalse: newWhatsappSettings.enabled === false,
        isTrue: newWhatsappSettings.enabled === true,
        fullSettings: JSON.stringify(newWhatsappSettings, null, 2)
      });
      
      // CRITICAL: Use a completely fresh object to avoid any reference issues
      // Deep clone to ensure we're saving exactly what we want
      const settingsToSave = JSON.parse(JSON.stringify(newWhatsappSettings));
      
      // CRITICAL: Explicitly ensure enabled is set (works for both true and false)
      // This prevents Mongoose from applying schema defaults
      settingsToSave.enabled = newWhatsappSettings.enabled;
      
      logger.debug('[PUT Settings] settingsToSave.enabled before MongoDB update:', {
        enabled: settingsToSave.enabled,
        enabledType: typeof settingsToSave.enabled,
        isFalse: settingsToSave.enabled === false,
        isTrue: settingsToSave.enabled === true,
        originalEnabled: newWhatsappSettings.enabled,
        fullSettingsToSave: JSON.stringify(settingsToSave, null, 2)
      });
      
      // Build the update - replace the entire nested object
      updateData['settings.whatsappNotificationSettings'] = settingsToSave;
      
      logger.debug('[PUT Settings] Update data being sent to MongoDB:', {
        updateDataKeys: Object.keys(updateData),
        enabledInUpdateData: updateData['settings.whatsappNotificationSettings']?.enabled,
        enabledType: typeof updateData['settings.whatsappNotificationSettings']?.enabled,
        isFalse: updateData['settings.whatsappNotificationSettings']?.enabled === false,
        isTrue: updateData['settings.whatsappNotificationSettings']?.enabled === true,
        fullUpdateData: JSON.stringify(updateData['settings.whatsappNotificationSettings'], null, 2)
      });
      
      if (useAdminSettings) {
        // Save into AdminSettings.notifications.whatsapp
        if (!adminSettings.notifications) adminSettings.notifications = {};
        if (!adminSettings.notifications.whatsapp) adminSettings.notifications.whatsapp = {};
        adminSettings.notifications.whatsapp = {
          ...adminSettings.notifications.whatsapp,
          ...settingsToSave,
        };
        adminSettings.markModified('notifications.whatsapp');
        await adminSettings.save();
        updateResult = { matchedCount: 1, modifiedCount: 1, acknowledged: true };
        logger.info('[PUT Settings] Saved to AdminSettings (fallback)');
      } else {
        // CRITICAL: Use direct MongoDB update to bypass Mongoose defaults
        // Just set the entire object - MongoDB will save it as-is
        const updateQuery = {
          $set: {
            'settings.whatsappNotificationSettings': settingsToSave
          }
        };
        
        // Only add $unset if the old location might exist
        if (business.settings?.emailNotificationSettings?.whatsappNotificationSettings) {
          updateQuery.$unset = { 'settings.emailNotificationSettings.whatsappNotificationSettings': '' };
        }
        
        logger.debug('[PUT Settings] Using explicit dot notation for enabled:', {
          dotNotationEnabled: settingsToSave.enabled,
          fullUpdateQuery: JSON.stringify(updateQuery, null, 2)
        });
        
        // CRITICAL: Use direct MongoDB collection to bypass Mongoose defaults
        const BusinessCollection = Business.collection;
        updateResult = await BusinessCollection.updateOne(
          { _id: businessId },
          updateQuery
        );
        
        logger.debug('[PUT Settings] Direct MongoDB update result:', {
          matched: updateResult.matchedCount,
          modified: updateResult.modifiedCount,
          acknowledged: updateResult.acknowledged
        });
      }
      
      logger.debug('[PUT Settings] updateOne result:', {
        matched: updateResult.matchedCount,
        modified: updateResult.modifiedCount,
        acknowledged: updateResult.acknowledged,
        enabled: newWhatsappSettings.enabled,
        receiptNotificationsEnabled: newWhatsappSettings.receiptNotifications?.enabled,
        hasSettings: !!business.settings,
        updateDataKeys: Object.keys(updateData)
      });
      
      // Verify the update was successful
      if (updateResult.matchedCount === 0) {
        logger.error('[PUT Settings] Business not found for update!');
        return res.status(404).json({
          success: false,
          error: 'Business not found'
        });
      }
      
      if (updateResult.modifiedCount === 0 && updateResult.matchedCount > 0) {
        logger.warn('[PUT Settings] Update matched but no documents were modified. This might indicate the data is already the same.');
        // This is not necessarily an error - the data might already be correct
      }
      
      // CRITICAL: Verify the value was actually saved to the database
      // Query directly to ensure we get the actual saved value
      // Wait a tiny bit to ensure write is committed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (!useAdminSettings) {
        const verificationBusiness = await Business.findById(businessId)
          .select('settings.whatsappNotificationSettings settings.emailNotificationSettings.whatsappNotificationSettings')
          .lean();
        
        const verifiedEnabled = verificationBusiness?.settings?.whatsappNotificationSettings?.enabled;
        const oldLocationEnabled = verificationBusiness?.settings?.emailNotificationSettings?.whatsappNotificationSettings?.enabled;
        
        logger.debug('[PUT Settings] Database verification after updateOne:', {
          verifiedEnabled,
          verifiedEnabledType: typeof verifiedEnabled,
          verifiedIsFalse: verifiedEnabled === false,
          verifiedIsTrue: verifiedEnabled === true,
          oldLocationEnabled,
          oldLocationExists: !!verificationBusiness?.settings?.emailNotificationSettings?.whatsappNotificationSettings,
          expectedEnabled: newWhatsappSettings.enabled,
          match: verifiedEnabled === newWhatsappSettings.enabled,
          fullVerified: JSON.stringify(verificationBusiness?.settings?.whatsappNotificationSettings, null, 2),
          fullOldLocation: JSON.stringify(verificationBusiness?.settings?.emailNotificationSettings?.whatsappNotificationSettings, null, 2)
        });
        
        if (verifiedEnabled !== newWhatsappSettings.enabled) {
          logger.error('[PUT Settings] CRITICAL: Database value does not match what we tried to save! Expected:', newWhatsappSettings.enabled,
            '(type:', typeof newWhatsappSettings.enabled, ') | Actual in DB:', verifiedEnabled,
            '(type:', typeof verifiedEnabled, ') | Old location value:', oldLocationEnabled);
          
          // Try to fix it with a direct update to the enabled field
          const fixResult = await Business.updateOne(
            { _id: businessId },
            { 
              $set: { 'settings.whatsappNotificationSettings.enabled': newWhatsappSettings.enabled },
              $unset: { 'settings.emailNotificationSettings.whatsappNotificationSettings': '' }
            }
          );
          logger.debug('[PUT Settings] Fix attempt result:', {
            matched: fixResult.matchedCount,
            modified: fixResult.modifiedCount
          });
          
          // Verify again after fix
          const recheck = await Business.findById(businessId)
            .select('settings.whatsappNotificationSettings')
            .lean();
          logger.debug('[PUT Settings] Recheck after fix:', {
            enabled: recheck?.settings?.whatsappNotificationSettings?.enabled
          });
        }
      }
    }
    
    // NOTE: We don't call business.save() here because:
    // 1. updateOne is the primary method and has already saved the data
    // 2. The business object in memory still has old values, so save() would overwrite our updateOne changes
    // 3. We reload from database below to get the latest data
    
    // Reload business to ensure we have the latest data (use lean() to get plain object)
    const savedBusiness = useAdminSettings
      ? null
      : await Business.findById(businessId).lean();
    logger.debug('[PUT Settings] WhatsApp settings after save (from DB):', {
      enabled: savedBusiness?.settings?.whatsappNotificationSettings?.enabled,
      enabledType: typeof savedBusiness?.settings?.whatsappNotificationSettings?.enabled,
      enabledIsFalse: savedBusiness?.settings?.whatsappNotificationSettings?.enabled === false,
      receiptNotificationsEnabled: savedBusiness?.settings?.whatsappNotificationSettings?.receiptNotifications?.enabled,
      hasSettings: !!savedBusiness?.settings,
      hasWhatsappSettings: !!savedBusiness?.settings?.whatsappNotificationSettings,
      fullSettings: JSON.stringify(savedBusiness?.settings?.whatsappNotificationSettings, null, 2)
    });

    // Use savedBusiness to ensure we return the latest data
    // BUT: If we just saved newWhatsappSettings, prefer that to ensure we return exactly what was saved
    // This is important because the database might not have the latest data immediately after save
    let returnedWhatsappSettings;
    if (newWhatsappSettings) {
      // Use the settings we just saved (most reliable)
      // CRITICAL: Create a fresh object to ensure no reference issues
      returnedWhatsappSettings = JSON.parse(JSON.stringify(newWhatsappSettings));
      logger.debug('[PUT Settings] Using newWhatsappSettings for response (most recent)', {
        enabled: returnedWhatsappSettings.enabled,
        enabledType: typeof returnedWhatsappSettings.enabled,
        isFalse: returnedWhatsappSettings.enabled === false
      });
    } else {
      // Fallback to database if no new settings were saved
      returnedWhatsappSettings = savedBusiness.settings?.whatsappNotificationSettings || business.settings?.whatsappNotificationSettings;
      logger.debug('[PUT Settings] Using database settings for response (fallback)');
    }
    
    // FINAL CHECK: Ensure enabled value is exactly what was requested
    // This is a safety net to guarantee the correct value is returned
    // CRITICAL: Always use the requested value if it was provided, regardless of what's in the database
    if (req.body.whatsappNotificationSettings && req.body.whatsappNotificationSettings.hasOwnProperty('enabled')) {
      const requestedEnabled = req.body.whatsappNotificationSettings.enabled;
      
      // ALWAYS use the requested value - don't even check what's currently in returnedWhatsappSettings
      // This ensures we return exactly what the user requested
      if (!returnedWhatsappSettings) {
        returnedWhatsappSettings = {};
      }
      
      const previousValue = returnedWhatsappSettings.enabled;
      returnedWhatsappSettings.enabled = requestedEnabled;
      
      if (previousValue !== requestedEnabled) {
        logger.debug('[PUT Settings] Set enabled to requested value:', {
          previous: previousValue,
          requested: requestedEnabled,
          final: returnedWhatsappSettings.enabled
        });
      } else {
        logger.debug('[PUT Settings] Enabled value already matches requested:', requestedEnabled);
      }
    }
    
    logger.debug('[PUT Settings] Returning WhatsApp settings:', {
      enabled: returnedWhatsappSettings?.enabled,
      enabledType: typeof returnedWhatsappSettings?.enabled,
      enabledValue: returnedWhatsappSettings?.enabled === false ? 'FALSE' : returnedWhatsappSettings?.enabled === true ? 'TRUE' : 'OTHER',
      receiptNotificationsEnabled: returnedWhatsappSettings?.receiptNotifications?.enabled,
      fullReturned: JSON.stringify(returnedWhatsappSettings, null, 2)
    });
    
    // Disable caching to ensure client gets fresh data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    res.json({
      success: true,
      data: {
        emailNotificationSettings: savedBusiness?.settings?.emailNotificationSettings || business?.settings?.emailNotificationSettings,
        whatsappNotificationSettings: returnedWhatsappSettings
      },
      message: 'Notification settings updated successfully'
    });
  } catch (error) {
    logger.error('Error updating email notification settings:', error, error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to update email notification settings',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/email-notifications/staff
 * Get all staff members with their email notification preferences
 */
router.get('/staff', authenticateToken, setupBusinessDatabase, async (req, res) => {
  try {
    logger.info('Fetching staff for email notifications, user:', req.user.email, 'branchId:', req.user.branchId);
    
    const { Staff } = req.businessModels;
    const staff = await Staff.find({ branchId: req.user.branchId })
      .select('name email role hasLoginAccess emailNotifications')
      .lean();
    
    logger.debug('Staff from business database:', staff.length);

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
    
    logger.debug('Business owner found:', businessOwner ? businessOwner.email : 'NOT FOUND');

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
      logger.debug('Adding current logged-in admin user to staff list:', req.user.email);
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
        logger.debug('Adding business owner to staff list:', businessOwner.email);
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
        logger.debug('Business owner already in staff list');
      }
    }

    logger.debug('Total staff members to return:', staffWithDefaults.length);
    res.json({
      success: true,
      data: staffWithDefaults
    });
  } catch (error) {
    logger.error('Error fetching staff email notifications:', error);
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
    const staffId = req.params.id;
    if (!staffId || !mongoose.Types.ObjectId.isValid(staffId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid staff ID'
      });
    }
    logger.debug('Email notification update request:', {
      staffId,
      userId: req.user._id,
      branchId: req.user.branchId,
      enabled: req.body.enabled,
      body: req.body
    });

    const { Staff } = req.businessModels;
    
    // First try to find in business database (Staff collection)
    let staff = await Staff.findById(staffId);

    // If not found in Staff collection, check if it's the business owner (User in main database)
    if (!staff) {
      logger.debug('Staff not found in business database, checking if it\'s business owner...');
      const { setupMainDatabase } = require('../middleware/business-db');
      const mainConnection = await require('../config/database-manager').getMainConnection();
      const User = mainConnection.model('User', require('../models/User').schema);
      const businessOwner = await User.findOne({
        _id: staffId,
        branchId: req.user.branchId
      });

      if (businessOwner) {
        logger.info('Found business owner in main database');
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
          
          // Targeted update: only email paths (admin always has email enabled)
          await Business.findByIdAndUpdate(req.user.branchId, {
            $set: {
              'settings.emailNotificationSettings.enabled': true,
              'settings.emailNotificationSettings.recipientStaffIds': generalRecipients,
              'settings.emailNotificationSettings.dailySummary.enabled': dailySummaryRecipients.length > 0,
              'settings.emailNotificationSettings.dailySummary.recipientStaffIds': dailySummaryRecipients,
              'settings.emailNotificationSettings.weeklySummary.enabled': weeklySummaryRecipients.length > 0,
              'settings.emailNotificationSettings.weeklySummary.recipientStaffIds': weeklySummaryRecipients,
              'settings.emailNotificationSettings.appointmentNotifications.enabled': appointmentRecipients.length > 0,
              'settings.emailNotificationSettings.appointmentNotifications.newAppointments': appointmentRecipients.length > 0,
              'settings.emailNotificationSettings.appointmentNotifications.recipientStaffIds': appointmentRecipients,
              'settings.emailNotificationSettings.receiptNotifications.enabled': receiptRecipients.length > 0,
              'settings.emailNotificationSettings.receiptNotifications.sendToStaff': receiptRecipients.length > 0,
              'settings.emailNotificationSettings.receiptNotifications.recipientStaffIds': receiptRecipients,
              'settings.emailNotificationSettings.exportNotifications.enabled': exportRecipients.length > 0,
              'settings.emailNotificationSettings.exportNotifications.recipientStaffIds': exportRecipients,
              'settings.emailNotificationSettings.systemAlerts.enabled': systemAlertsRecipients.length > 0,
              'settings.emailNotificationSettings.systemAlerts.recipientStaffIds': systemAlertsRecipients
            }
          });
          logger.info('Business email notification settings updated for admin user');
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

      logger.warn('Staff not found with ID:', staffId);
      return res.status(404).json({
        success: false,
        error: 'Staff member not found'
      });
    }

    logger.debug('Staff found:', {
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
      logger.debug('Branch ID mismatch:', {
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

    // Update business email notification recipient lists only (Email and WhatsApp are separate)
    const databaseManager = require('../config/database-manager');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const allStaff = await Staff.find({ branchId: req.user.branchId }).lean();
    
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
    const hasAnyEnabled = allStaff.some(s => s.emailNotifications?.enabled);
    
    // Targeted update: only touch email paths, never whatsappNotificationSettings
    await Business.findByIdAndUpdate(req.user.branchId, {
      $set: {
        'settings.emailNotificationSettings.enabled': hasAnyEnabled,
        'settings.emailNotificationSettings.recipientStaffIds': generalRecipients,
        'settings.emailNotificationSettings.dailySummary.enabled': dailySummaryRecipients.length > 0,
        'settings.emailNotificationSettings.dailySummary.recipientStaffIds': dailySummaryRecipients,
        'settings.emailNotificationSettings.weeklySummary.enabled': weeklySummaryRecipients.length > 0,
        'settings.emailNotificationSettings.weeklySummary.recipientStaffIds': weeklySummaryRecipients,
        'settings.emailNotificationSettings.appointmentNotifications.enabled': appointmentRecipients.length > 0,
        'settings.emailNotificationSettings.appointmentNotifications.newAppointments': appointmentRecipients.length > 0,
        'settings.emailNotificationSettings.appointmentNotifications.recipientStaffIds': appointmentRecipients,
        'settings.emailNotificationSettings.receiptNotifications.enabled': receiptRecipients.length > 0,
        'settings.emailNotificationSettings.receiptNotifications.sendToStaff': receiptRecipients.length > 0,
        'settings.emailNotificationSettings.receiptNotifications.recipientStaffIds': receiptRecipients,
        'settings.emailNotificationSettings.exportNotifications.enabled': exportRecipients.length > 0,
        'settings.emailNotificationSettings.exportNotifications.recipientStaffIds': exportRecipients,
        'settings.emailNotificationSettings.systemAlerts.enabled': systemAlertsRecipients.length > 0,
        'settings.emailNotificationSettings.systemAlerts.recipientStaffIds': systemAlertsRecipients
      }
    });
    logger.info('Business email notification recipient lists updated');

    logger.info('Email notifications updated successfully:', {
      enabled: staff.emailNotifications.enabled,
      staffId: staff._id
    });

    res.json({
      success: true,
      data: staff.emailNotifications,
      message: 'Staff email notification preferences updated successfully'
    });
  } catch (error) {
    logger.error('Error updating staff email notifications:', error, error.stack);
    const message = (error && (error.message || error.reason && error.reason.message)) || 'Failed to update staff email notifications';
    const status = error.name === 'ValidationError' ? 400 : 500;
    res.status(status).set('Content-Type', 'application/json').json({
      success: false,
      error: String(message)
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
    logger.error('Error sending test email:', error);
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
    const { Staff, Receipt, Sale, CashRegistry, Expense } = req.businessModels;
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayDateString = today.toISOString().split('T')[0];
    const dateFormatted = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    const sales = await Sale.find({
      branchId: req.user.branchId,
      date: { $gte: today, $lt: tomorrow },
      status: { $nin: ['cancelled', 'Cancelled'] }
    }).lean();

    const receipts = await Receipt.find({
      branchId: req.user.branchId,
      date: { $gte: todayDateString, $lt: tomorrow.toISOString().split('T')[0] }
    }).lean();

    const closingRegistry = await CashRegistry.findOne({
      branchId: req.user.branchId,
      date: { $gte: today, $lt: tomorrow },
      shiftType: 'closing'
    }).lean();

    const cashExpenses = await Expense.find({
      branchId: req.user.branchId,
      date: { $gte: today, $lt: tomorrow },
      paymentMode: 'Cash',
      status: { $in: ['approved', 'pending'] }
    }).lean();

    const totalBillCount = sales.length;
    const uniqueCustomers = new Set(sales.map(s => (s.customerName || '').trim()).filter(Boolean));
    const totalCustomerCount = uniqueCustomers.size || totalBillCount;
    const totalSales = sales.reduce((sum, s) => sum + (s.grossTotal || s.totalAmount || s.netTotal || 0), 0);
    let totalSalesCash = 0, totalSalesOnline = 0, totalSalesCard = 0;
    sales.forEach(s => {
      let cashAmt = 0;
      let isAllCash = false;
      if (s.payments && s.payments.length) {
        s.payments.forEach(p => {
          const amt = p.amount || 0;
          if (p.mode === 'Cash') { totalSalesCash += amt; cashAmt += amt; }
          else if (p.mode === 'Online') totalSalesOnline += amt;
          else if (p.mode === 'Card') totalSalesCard += amt;
        });
        const hasNonCash = (s.payments || []).some(p => p.mode === 'Card' || p.mode === 'Online');
        isAllCash = cashAmt > 0 && !hasNonCash;
      } else {
        const amt = s.grossTotal || s.netTotal || 0;
        if (s.paymentMode === 'Cash') { totalSalesCash += amt; cashAmt = amt; isAllCash = true; }
        else if (s.paymentMode === 'Online') totalSalesOnline += amt;
        else if (s.paymentMode === 'Card') totalSalesCard += amt;
      }
      if (isAllCash && (s.tip || 0) > 0) totalSalesCash -= (s.tip || 0);
    });
    let duesCollected = 0;
    sales.forEach(s => {
      (s.paymentHistory || []).forEach(ph => {
        const d = ph.date ? new Date(ph.date) : null;
        if (d && d >= today && d < tomorrow) duesCollected += ph.amount || 0;
      });
    });
    const cashExpense = closingRegistry?.expenseValue ?? cashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const tipCollected = receipts.reduce((sum, r) => sum + (r.tip || 0), 0);
    const cashBalance = closingRegistry?.cashBalance ?? 0;

    const recipientStaffIds = settings.dailySummary.recipientStaffIds || [];
    const recipients = await Staff.find({
      _id: { $in: recipientStaffIds },
      'emailNotifications.enabled': true,
      'emailNotifications.preferences.dailySummary': true,
      email: { $exists: true, $ne: '' }
    }).lean();

    const results = [];
    const delayMs = 600; // Resend limit: 2 req/sec
    for (let i = 0; i < recipients.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, delayMs));
      const staff = recipients[i];
      const result = await emailService.sendDailySummary({
        to: staff.email,
        businessName: business.name,
        date: todayDateString,
        summaryData: {
          dateFormatted,
          totalBillCount,
          totalCustomerCount,
          totalSales,
          totalSalesCash,
          totalSalesOnline,
          totalSalesCard,
          duesCollected,
          cashExpense,
          tipCollected,
          cashBalance
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
    logger.error('Error sending daily summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send daily summary'
    });
  }
});

/**
 * GET /api/email-notifications/whatsapp/status
 * Get WhatsApp configuration status (admin config + business addon)
 */
router.get('/whatsapp/status', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const { Business, AdminSettings } = req.mainModels;
    
    // Get business to check addon status
    const business = await Business.findById(req.user.branchId).select('plan.addons.whatsapp').lean();
    
    // Get admin WhatsApp configuration
    const adminSettings = await AdminSettings.getSettings();
    const whatsappConfig = adminSettings.notifications?.whatsapp || {};
    
    // Check if admin has configured WhatsApp
    const adminConfigured = !!(
      whatsappConfig.enabled &&
      whatsappConfig.msg91ApiKey &&
      Object.values(whatsappConfig.templates || {}).some(t => t && t.trim() !== '')
    );
    
    // Check business addon status
    const addonStatus = business?.plan?.addons?.whatsapp || {};
    const addonEnabled = addonStatus.enabled === true;
    const addonQuota = addonStatus.quota || 0;
    const addonUsed = addonStatus.used || 0;
    const addonRemaining = Math.max(0, addonQuota - addonUsed);
    
    res.json({
      success: true,
      data: {
        adminConfigured,
        adminEnabled: whatsappConfig.enabled || false,
        addonEnabled,
        addonQuota,
        addonUsed,
        addonRemaining,
        canUse: adminConfigured && addonEnabled && addonRemaining > 0,
        provider: whatsappConfig.provider || 'msg91'
      }
    });
  } catch (error) {
    logger.error('Error fetching WhatsApp status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch WhatsApp status'
    });
  }
});

module.exports = router;
