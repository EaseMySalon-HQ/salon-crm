const cron = require('node-cron');
const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');
const { sendStaffIncentiveSummaries } = require('../utils/staff-incentive-summary-sender');
const { sendMonthlyPayrollSlips } = require('../lib/payroll-email-notifier');
const { sendMonthlyTimesheetReports } = require('../lib/timesheet-email-notifier');
const {
  sendDailySummaryForBusiness,
  EMAIL_DELAY_MS,
} = require('../lib/daily-summary-dispatch');
const { sendWeeklySummaryForBusiness } = require('../lib/weekly-summary-dispatch');
const { sendMonthlySummaryForBusiness } = require('../lib/monthly-summary-dispatch');
const { precomputeAllMonthlySummaries } = require('../lib/monthly-summary-precompute');
const { isPlatformEmailDisabled } = require('../lib/business-email-policy');
const { staffEmailPreferenceFindQuery } = require('../lib/admin-email-preferences');

/**
 * Send daily summary emails to all businesses
 */
async function sendDailySummaries() {
  try {
    logger.info('Starting daily summary email job');

    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const businesses = await Business.find({ status: 'active' });
    logger.info(`Found ${businesses.length} active businesses for daily summary`);

    for (const business of businesses) {
      try {
        if (isPlatformEmailDisabled(business)) {
          logger.debug(`Skipping daily summary for ${business.name} — platform email disabled`);
          continue;
        }

        const emailSettings = business.settings?.emailNotificationSettings;
        const recipientListConfigured = emailSettings?.dailySummary?.recipientStaffIds?.length > 0;
        const dailySummaryEnabled =
          emailSettings?.dailySummary?.enabled !== false ||
          (emailSettings?.dailySummary?.enabled === false && !recipientListConfigured);

        if (!dailySummaryEnabled) {
          logger.debug(`Skipping daily summary for ${business.name} - disabled in settings`);
          continue;
        }

        logger.debug(`Processing daily summary for business: ${business.name}`);
        const result = await sendDailySummaryForBusiness(business, mainConnection);
        if (result.skipped) {
          logger.debug(`Daily summary skipped for ${business.name}: ${result.reason || 'unknown'}`);
        } else {
          logger.info(`Daily summary sent for ${business.name}: ${result.sent}/${result.recipientCount} recipients`);
        }
        await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
      } catch (error) {
        logger.error(`Error processing daily summary for business ${business.name}:`, error);
      }
    }

    logger.info('Daily summary email job completed');
  } catch (error) {
    logger.error('Daily summary email job failed:', error);
  }
}

/**
 * Send weekly summary emails to all businesses (Mon 9 AM IST — previous Mon–Sun week).
 */
async function sendWeeklySummaries() {
  try {
    logger.info('Starting weekly summary email job');

    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const businesses = await Business.find({ status: 'active' });
    logger.info(`Found ${businesses.length} active businesses for weekly summary`);

    for (const business of businesses) {
      try {
        if (isPlatformEmailDisabled(business)) {
          logger.debug(`Skipping weekly summary for ${business.name} — platform email disabled`);
          continue;
        }

        const emailSettings = business.settings?.emailNotificationSettings;
        const recipientListConfigured = emailSettings?.weeklySummary?.recipientStaffIds?.length > 0;
        const weeklySummaryEnabled =
          emailSettings?.weeklySummary?.enabled !== false ||
          (emailSettings?.weeklySummary?.enabled === false && !recipientListConfigured);

        if (!weeklySummaryEnabled) {
          logger.debug(`Skipping weekly summary for ${business.name} - disabled in settings`);
          continue;
        }

        logger.debug(`Processing weekly summary for business: ${business.name}`);
        const result = await sendWeeklySummaryForBusiness(business, mainConnection);
        if (result.skipped) {
          logger.debug(`Weekly summary skipped for ${business.name}: ${result.reason || 'unknown'}`);
        } else {
          logger.info(
            `Weekly summary sent for ${business.name}: ${result.sent}/${result.recipientCount} recipients`
          );
        }
        await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
      } catch (error) {
        logger.error(`Error processing weekly summary for business ${business.name}:`, error);
      }
    }

    logger.info('Weekly summary email job completed');
  } catch (error) {
    logger.error('Weekly summary email job failed:', error);
  }
}

/**
 * Send monthly summary emails (1st of month, 9 AM IST — previous calendar month).
 */
async function sendMonthlySummaries() {
  try {
    logger.info('Starting monthly summary email job');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const businesses = await Business.find({ status: 'active' });

    for (const business of businesses) {
      try {
        if (isPlatformEmailDisabled(business)) continue;
        const emailSettings = business.settings?.emailNotificationSettings;
        const recipientListConfigured = emailSettings?.monthlySummary?.recipientStaffIds?.length > 0;
        const enabled =
          emailSettings?.monthlySummary?.enabled !== false ||
          (emailSettings?.monthlySummary?.enabled === false && !recipientListConfigured);
        if (!enabled) continue;

        const result = await sendMonthlySummaryForBusiness(business, mainConnection);
        if (!result.skipped) {
          logger.info(`Monthly summary for ${business.name}: ${result.sent} sent`);
        }
        await new Promise((r) => setTimeout(r, EMAIL_DELAY_MS));
      } catch (err) {
        logger.error(`Monthly summary error for ${business.name}:`, err);
      }
    }
    logger.info('Monthly summary email job completed');
  } catch (error) {
    logger.error('Monthly summary email job failed:', error);
  }
}

/**
 * Expire membership subscriptions where expiryDate < today
 */
async function expireMembershipSubscriptions() {
  try {
    logger.info('Starting membership expiry job');
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const businesses = await Business.find({ status: 'active' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    logger.info(`Processing membership expiry for ${businesses.length} active businesses`);
    for (const business of businesses) {
      try {
        const businessDb = await databaseManager.getConnection(business._id, mainConnection);
        const businessModels = modelFactory.createBusinessModels(businessDb);
        const { MembershipSubscription } = businessModels;

        const result = await MembershipSubscription.updateMany(
          { status: 'ACTIVE', expiryDate: { $ne: null, $lt: today } },
          { $set: { status: 'EXPIRED' } }
        );

        if (result.modifiedCount > 0) {
          logger.debug(`Expired ${result.modifiedCount} membership(s) for ${business.name}`);
        }
      } catch (err) {
        logger.error(`Error expiring memberships for ${business.name}:`, err);
      }
    }
    logger.info('Membership expiry job completed');
  } catch (error) {
    logger.error('Membership expiry job failed:', error);
  }
}

/**
 * Setup email scheduler cron jobs
 */
function setupEmailScheduler() {
  // Membership expiry - runs daily at 00:05 IST
  cron.schedule('5 0 * * *', async () => {
    logger.info('Running membership expiry job');
    await expireMembershipSubscriptions();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  // Daily summary - runs every day at configured time (default 9 PM)
  // For now, we'll check all businesses and use their configured times
  // In production, you might want separate cron jobs per business
  cron.schedule('0 21 * * *', async () => {
    logger.info('Running daily summary email job');
    await sendDailySummaries();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  // Weekly summary — Monday 9:00 AM IST (previous Mon–Sun week)
  cron.schedule('0 9 * * 1', async () => {
    logger.info('Running weekly summary email job');
    await sendWeeklySummaries();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  // Monthly summary precompute — 1st of month 12:01 AM IST
  cron.schedule('1 0 1 * *', async () => {
    logger.info('Running monthly summary precompute job');
    await precomputeAllMonthlySummaries();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });

  // Monthly summary send — 1st of month 9:00 AM IST
  cron.schedule('0 9 1 * *', async () => {
    logger.info('Running monthly summary email job');
    await sendMonthlySummaries();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });

  // Staff incentive summary + payroll slips + timesheet reports — 1st of each month at 12:00 PM IST
  cron.schedule('0 12 1 * *', async () => {
    logger.info('Running monthly staff incentive summary email job');
    await sendStaffIncentiveSummaries();
    logger.info('Running monthly payroll slip email job');
    await sendMonthlyPayrollSlips();
    logger.info('Running monthly timesheet report email job');
    await sendMonthlyTimesheetReports();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });
  
  // Low inventory check - runs every day at 10 AM
  cron.schedule('0 10 * * *', async () => {
    logger.info('Running low inventory check job');
    await checkLowInventory();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  logger.info('Email scheduler jobs configured: membership expiry 12:05 AM IST, daily summary 9:00 PM IST, weekly summary Mon 9:00 AM IST, monthly summary precompute 1st 12:01 AM + send 1st 9:00 AM IST, staff incentive + payroll + timesheet 1st 12:00 PM IST, low inventory 10:00 AM IST');
}

/**
 * Check for low inventory products and send alerts
 */
async function checkLowInventory() {
  try {
    logger.info('Starting low inventory check job');
    
    // Get main connection
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    
    // Get all active businesses
    const businesses = await Business.find({ status: 'active' });
    logger.info(`Found ${businesses.length} active businesses for low inventory check`);
    
    for (const business of businesses) {
      try {
        if (isPlatformEmailDisabled(business)) {
          logger.debug(`Skipping low inventory email for ${business.name} — platform email disabled`);
          continue;
        }
        const emailSettings = business.settings?.emailNotificationSettings;
        
        // Check if low inventory alerts are enabled
        const lowInventoryEnabled = emailSettings?.systemAlerts?.enabled === true && 
                                   emailSettings?.systemAlerts?.lowInventory === true;
        
        if (!lowInventoryEnabled) {
          logger.debug(`Skipping low inventory check for ${business.name} - disabled in settings`);
          continue;
        }
        
        logger.debug(`Checking low inventory for business: ${business.name}`);
        
        // Get business database connection
        const businessDb = await databaseManager.getConnection(business._id, mainConnection);
        const businessModels = modelFactory.createBusinessModels(businessDb);
        const { Product, Staff } = businessModels;
        
        // Find products with low stock
        const allProducts = await Product.find({ isActive: true }).lean();
        const lowStockProducts = allProducts.filter(product => {
          const stock = product.stock || 0;
          const minStock = product.minimumStock || product.minStock || 0;
          return minStock > 0 && stock < minStock;
        });
        
        if (lowStockProducts.length === 0) {
          logger.debug(`No low stock products found for ${business.name}`);
          continue;
        }
        
        logger.debug(`Found ${lowStockProducts.length} low stock product(s) for ${business.name}`);
        
        // Get recipient staff
        const recipientStaffIds = emailSettings?.systemAlerts?.recipientStaffIds || [];
        let recipients = [];
        
        if (recipientStaffIds.length > 0) {
          recipients = await Staff.find(
            staffEmailPreferenceFindQuery('lowInventory', { recipientStaffIds })
          ).lean();
        } else {
          recipients = await Staff.find(
            staffEmailPreferenceFindQuery('lowInventory', { branchId: business._id })
          ).lean();
        }
        
        // Add admin users from User model
        const User = mainConnection.model('User', require('../models/User').schema);
        const adminUsers = await User.find({
          branchId: business._id,
          role: 'admin',
          email: { $exists: true, $ne: '' }
        }).lean();
        
        // Add admin users to recipients (they always have notifications enabled)
        for (const admin of adminUsers) {
          const adminHasPreference = admin.emailNotifications?.preferences?.lowInventory !== false;
          if (adminHasPreference && admin.email) {
            recipients.push({
              _id: admin._id,
              email: admin.email,
              name: admin.firstName + ' ' + admin.lastName || admin.email,
              role: 'admin'
            });
          }
        }
        
        if (recipients.length === 0) {
          logger.warn(`No recipients found for low inventory alerts for ${business.name}`);
          continue;
        }
        
        // Prepare product data for email
        const productsForEmail = lowStockProducts.map(p => ({
          name: p.name,
          stock: p.stock || 0,
          minStock: p.minimumStock || p.minStock || 0,
          unit: p.unit || 'units'
        }));
        
        // Send emails to all recipients (Resend limit: 2 req/sec)
        logger.debug(`Sending low inventory alert to ${recipients.length} recipient(s) for ${business.name}`);
        const invDelayMs = 600;
        for (let i = 0; i < recipients.length; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, invDelayMs));
          const recipient = recipients[i];
          try {
            await emailService.sendLowInventoryAlert({
              to: recipient.email,
              products: productsForEmail,
              businessName: business.name
            });
            logger.debug(`Low inventory alert sent to ${recipient.email} (${recipient.name || recipient.role}) for business ${business.name}`);
          } catch (error) {
            logger.error(`Error sending low inventory alert to ${recipient.email}:`, error);
          }
        }
      } catch (error) {
        logger.error(`Error processing low inventory check for business ${business.name}:`, error);
      }
    }
    
    logger.info('Low inventory check job completed');
  } catch (error) {
    logger.error('Low inventory check job failed:', error);
  }
}

module.exports = {
  sendDailySummaries,
  sendWeeklySummaries,
  sendStaffIncentiveSummaries,
  checkLowInventory,
  expireMembershipSubscriptions,
  setupEmailScheduler
};
