const cron = require('node-cron');
const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { logger } = require('../utils/logger');

/**
 * Send daily summary emails to all businesses
 */
async function sendDailySummaries() {
  try {
    logger.info('Starting daily summary email job');
    
    // Get main connection
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    
    // Get all active businesses
    const businesses = await Business.find({ status: 'active' });
    logger.info(`Found ${businesses.length} active businesses for daily summary`);
    
    for (const business of businesses) {
      try {
        const emailSettings = business.settings?.emailNotificationSettings;
        
        // Check if daily summary is enabled
        // Default to enabled if not explicitly disabled, or if disabled but no recipient list configured (never configured)
        const recipientListConfigured = emailSettings?.dailySummary?.recipientStaffIds?.length > 0;
        const dailySummaryEnabled = emailSettings?.dailySummary?.enabled !== false || 
          (emailSettings?.dailySummary?.enabled === false && !recipientListConfigured);
        
        if (!dailySummaryEnabled) {
          logger.debug(`Skipping daily summary for ${business.name} - disabled in settings`);
          continue;
        }

        // Respect delivery mode: skip scheduler-based send when set to "afterClosing"
        const deliveryMode = emailSettings?.dailySummary?.mode || 'fixedTime';
        if (deliveryMode === 'afterClosing') {
          logger.debug(`Skipping daily summary for ${business.name} - mode set to afterClosing (sent on verification)`);
          continue;
        }
        
        logger.debug(`Processing daily summary for business: ${business.name}`);
        
        // Get business database connection
        const businessDb = await databaseManager.getConnection(business._id, mainConnection);
        const businessModels = modelFactory.createBusinessModels(businessDb);
        const { Staff, Receipt, Sale, Appointment, Client, CashRegistry, Expense } = businessModels;
        
        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const todayDateString = today.toISOString().split('T')[0];
        const dateFormatted = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        
        // Get today's sales (from Sale model - this is the primary sales data)
        const sales = await Sale.find({
          branchId: business._id,
          date: {
            $gte: today,
            $lt: tomorrow
          },
          status: { $nin: ['cancelled', 'Cancelled'] }
        }).lean();
        
        // Also get receipts for backward compatibility (tips, etc.)
        const receipts = await Receipt.find({
          branchId: business._id,
          date: { $gte: todayDateString, $lt: tomorrow.toISOString().split('T')[0] }
        }).lean();
        
        // Today's closing cash registry (for cash balance and cash expense)
        const closingRegistry = await CashRegistry.findOne({
          branchId: business._id,
          date: { $gte: today, $lt: tomorrow },
          shiftType: 'closing'
        }).lean();
        
        // Today's cash expenses (from Expense model if no registry expenseValue)
        const cashExpenses = await Expense.find({
          branchId: business._id,
          date: { $gte: today, $lt: tomorrow },
          paymentMode: 'Cash',
          status: { $in: ['approved', 'pending'] }
        }).lean();
        
        // 1. Total Bill Count
        const totalBillCount = sales.length;
        // 2. Total Customer Count (unique customers by name)
        const uniqueCustomers = new Set(sales.map(s => (s.customerName || '').trim()).filter(Boolean));
        const totalCustomerCount = uniqueCustomers.size || totalBillCount;
        // 3. Total Sales (gross revenue)
        const totalSales = sales.reduce((sum, s) => sum + (s.grossTotal || s.totalAmount || s.netTotal || 0), 0);
        // 4–6. Sales by payment mode (from payments array)
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
        // 7. Dues collected (payments recorded today via paymentHistory)
        let duesCollected = 0;
        sales.forEach(s => {
          (s.paymentHistory || []).forEach(ph => {
            const d = ph.date ? new Date(ph.date) : null;
            if (d && d >= today && d < tomorrow) duesCollected += ph.amount || 0;
          });
        });
        // 8. Cash expense (from closing registry or sum of cash expenses)
        const cashExpense = closingRegistry?.expenseValue ?? cashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        // 9. Tip collected (from receipts for today)
        const tipCollected = receipts.reduce((sum, r) => sum + (r.tip || 0), 0);
        // 10. Cash balance (from today's closing registry)
        const cashBalance = closingRegistry?.cashBalance ?? 0;
        
        logger.debug(`Daily summary for ${business.name}: ${totalBillCount} bills, ₹${totalSales}, cash ₹${totalSalesCash}, card ₹${totalSalesCard}, online ₹${totalSalesOnline}`);
        
        // Get recipient staff
        const recipientStaffIds = emailSettings?.dailySummary?.recipientStaffIds || [];
        let recipients = [];
        
        if (recipientStaffIds.length > 0) {
          recipients = await Staff.find({
            _id: { $in: recipientStaffIds },
            'emailNotifications.enabled': true,
            'emailNotifications.preferences.dailySummary': true,
            email: { $exists: true, $ne: '' }
          }).lean();
        } else {
          // If no recipient list configured, find all staff with daily summary enabled
          recipients = await Staff.find({
            branchId: business._id,
            'emailNotifications.enabled': true,
            'emailNotifications.preferences.dailySummary': true,
            email: { $exists: true, $ne: '' }
          }).lean();
        }
        
        // Add admin users from User model
        const User = mainConnection.model('User', require('../models/User').schema);
        const adminUsers = await User.find({
          branchId: business._id,
          role: 'admin',
          email: { $exists: true, $ne: '' }
        }).lean();
        
        logger.debug(`Found ${adminUsers.length} admin user(s) for daily summary`);
        
        for (const admin of adminUsers) {
          const alreadyInList = recipients.some(r => r.email === admin.email);
          if (!alreadyInList) {
            recipients.push({
              _id: admin._id,
              name: admin.name || `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email,
              email: admin.email,
              role: 'admin'
            });
            logger.debug(`Added admin user to daily summary recipients: ${admin.email}`);
          }
        }
        
        logger.debug(`Found ${recipients.length} total recipients for daily summary`);
        
        if (recipients.length === 0) {
          logger.warn(`No recipients found for ${business.name} - check staff email notification settings, daily summary preferences, and email addresses`);
          continue;
        }
        
        // Send emails (Resend limit: 2 req/sec - add delay between sends)
        logger.debug(`Sending daily summary to ${recipients.length} recipient(s) for ${business.name}`);
        const delayMs = 600; // Stay under 2 req/sec
        for (let i = 0; i < recipients.length; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, delayMs));
          const staff = recipients[i];
          try {
            await emailService.sendDailySummary({
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
            logger.debug(`Daily summary sent to ${staff.email} (${staff.name || staff.role}) for business ${business.name}`);
          } catch (error) {
            logger.error(`Error sending daily summary to ${staff.email}:`, error);
          }
        }
        // Small delay before next business to avoid burst across businesses
        await new Promise(r => setTimeout(r, delayMs));
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
 * Send weekly summary emails to all businesses
 */
async function sendWeeklySummaries() {
  try {
    logger.info('Starting weekly summary email job');
    
    // Get main connection
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    
    // Get all active businesses
    const businesses = await Business.find({ status: 'active' });
    logger.info(`Found ${businesses.length} active businesses for weekly summary`);
    
    for (const business of businesses) {
      try {
        const emailSettings = business.settings?.emailNotificationSettings;
        
        // Check if weekly summary is enabled
        // Default to enabled if not explicitly disabled, or if disabled but no recipient list configured (never configured)
        const recipientListConfigured = emailSettings?.weeklySummary?.recipientStaffIds?.length > 0;
        const weeklySummaryEnabled = emailSettings?.weeklySummary?.enabled !== false || 
          (emailSettings?.weeklySummary?.enabled === false && !recipientListConfigured);
        
        if (!weeklySummaryEnabled) {
          logger.debug(`Skipping weekly summary for ${business.name} - disabled in settings`);
          continue;
        }
        
        // Check if today is the configured day
        const today = new Date();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const todayName = dayNames[today.getDay()];
        const configuredDay = emailSettings?.weeklySummary?.day || 'sunday';
        
        if (configuredDay !== todayName) {
          continue;
        }
        
        logger.debug(`Processing weekly summary for business: ${business.name}`);
        
        // Get business database connection
        const businessDb = await databaseManager.getConnection(business._id, mainConnection);
        const businessModels = modelFactory.createBusinessModels(businessDb);
        const { Staff, Receipt, Sale, Appointment, Client } = businessModels;
        
        // Calculate week start and end
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        // Get week's sales (from Sale model - this is the primary sales data)
        const sales = await Sale.find({
          branchId: business._id,
          date: {
            $gte: weekStart,
            $lte: weekEnd
          },
          status: { $nin: ['cancelled', 'Cancelled'] }
        }).lean();
        
        // Also get receipts for backward compatibility (if any exist)
        const receipts = await Receipt.find({
          branchId: business._id,
          date: {
            $gte: weekStart.toISOString().split('T')[0],
            $lte: weekEnd.toISOString().split('T')[0]
          }
        }).lean();
        
        const appointments = await Appointment.find({
          branchId: business._id,
          date: {
            $gte: weekStart.toISOString().split('T')[0],
            $lte: weekEnd.toISOString().split('T')[0]
          }
        }).lean();
        
        const newClients = await Client.find({
          branchId: business._id,
          createdAt: { $gte: weekStart, $lte: weekEnd }
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
        
        logger.debug(`Weekly summary for ${business.name}: ${totalSales} sales, ₹${totalRevenue}, ${appointmentCount} appointments, ${newClientsCount} new clients`);
        
        // Calculate revenue growth (simplified - compare with previous week)
        let revenueGrowth = null;
        try {
          const prevWeekStart = new Date(weekStart);
          prevWeekStart.setDate(prevWeekStart.getDate() - 7);
          const prevWeekEnd = new Date(prevWeekStart);
          prevWeekEnd.setDate(prevWeekStart.getDate() + 6);
          
          const prevWeekSales = await Sale.find({
            branchId: business._id,
            date: {
              $gte: prevWeekStart,
              $lte: prevWeekEnd
            },
            status: { $nin: ['cancelled', 'Cancelled'] }
          }).lean();
          
          const prevWeekReceipts = await Receipt.find({
            branchId: business._id,
            date: {
              $gte: prevWeekStart.toISOString().split('T')[0],
              $lte: prevWeekEnd.toISOString().split('T')[0]
            }
          }).lean();
          
          const prevWeekSalesRevenue = prevWeekSales.reduce((sum, s) => {
            const amount = s.grossTotal || s.totalAmount || s.netTotal || 0;
            return sum + amount;
          }, 0);
          
          const prevWeekReceiptsRevenue = prevWeekReceipts.reduce((sum, r) => sum + (r.total || 0), 0);
          const prevWeekRevenue = prevWeekSalesRevenue + prevWeekReceiptsRevenue;
          
          if (prevWeekRevenue > 0) {
            revenueGrowth = ((totalRevenue - prevWeekRevenue) / prevWeekRevenue) * 100;
          }
        } catch (error) {
          logger.error('Error calculating revenue growth:', error);
        }
        
        // Get top services and products (simplified)
        const topServices = [];
        const topProducts = [];
        
        // Get recipient staff
        const recipientStaffIds = emailSettings?.weeklySummary?.recipientStaffIds || [];
        let recipients = [];
        
        if (recipientStaffIds.length > 0) {
          recipients = await Staff.find({
            _id: { $in: recipientStaffIds },
            'emailNotifications.enabled': true,
            'emailNotifications.preferences.weeklySummary': true,
            email: { $exists: true, $ne: '' }
          }).lean();
        } else {
          // If no recipient list configured, find all staff with weekly summary enabled
          recipients = await Staff.find({
            branchId: business._id,
            'emailNotifications.enabled': true,
            'emailNotifications.preferences.weeklySummary': true,
            email: { $exists: true, $ne: '' }
          }).lean();
        }
        
        // Add admin users from User model
        const User = mainConnection.model('User', require('../models/User').schema);
        const adminUsers = await User.find({
          branchId: business._id,
          role: 'admin',
          email: { $exists: true, $ne: '' }
        }).lean();
        
        logger.debug(`Found ${adminUsers.length} admin user(s) for weekly summary`);
        
        for (const admin of adminUsers) {
          const alreadyInList = recipients.some(r => r.email === admin.email);
          if (!alreadyInList) {
            recipients.push({
              _id: admin._id,
              name: admin.name || `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email,
              email: admin.email,
              role: 'admin'
            });
            logger.debug(`Added admin user to weekly summary recipients: ${admin.email}`);
          }
        }
        
        logger.debug(`Found ${recipients.length} total recipients for weekly summary`);
        
        if (recipients.length === 0) {
          logger.warn(`No recipients found for ${business.name} - check staff email notification settings, weekly summary preferences, and email addresses`);
          continue;
        }
        
        // Send emails (Resend limit: 2 req/sec - add delay between sends)
        logger.debug(`Sending weekly summary to ${recipients.length} recipient(s) for ${business.name}`);
        const weeklyDelayMs = 600;
        for (let i = 0; i < recipients.length; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, weeklyDelayMs));
          const staff = recipients[i];
          try {
            await emailService.sendWeeklySummary({
              to: staff.email,
              businessName: business.name,
              weekStart: weekStart.toISOString().split('T')[0],
              weekEnd: weekEnd.toISOString().split('T')[0],
              summaryData: {
                totalRevenue,
                totalSales,
                appointmentCount,
                newClients: newClientsCount,
                revenueGrowth,
                topServices,
                topProducts
              }
            });
            logger.debug(`Weekly summary sent to ${staff.email} (${staff.name || staff.role}) for business ${business.name}`);
          } catch (error) {
            logger.error(`Error sending weekly summary to ${staff.email}:`, error);
          }
        }
        await new Promise(r => setTimeout(r, weeklyDelayMs));
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
          { status: 'ACTIVE', expiryDate: { $lt: today } },
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
  
  // Weekly summary - runs every Sunday at configured time (default 8 PM)
  cron.schedule('0 20 * * 0', async () => {
    logger.info('Running weekly summary email job');
    await sendWeeklySummaries();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  // Low inventory check - runs every day at 10 AM
  cron.schedule('0 10 * * *', async () => {
    logger.info('Running low inventory check job');
    await checkLowInventory();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  logger.info('Email scheduler jobs configured: membership expiry 12:05 AM IST, daily summary 9:00 PM IST, weekly summary Sun 8:00 PM IST, low inventory 10:00 AM IST');
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
          recipients = await Staff.find({
            _id: { $in: recipientStaffIds },
            'emailNotifications.enabled': true,
            'emailNotifications.preferences.lowInventory': true,
            email: { $exists: true, $ne: '' }
          }).lean();
        } else {
          // If no recipient list configured, find all staff with low inventory alerts enabled
          recipients = await Staff.find({
            branchId: business._id,
            'emailNotifications.enabled': true,
            'emailNotifications.preferences.lowInventory': true,
            email: { $exists: true, $ne: '' }
          }).lean();
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
  checkLowInventory,
  expireMembershipSubscriptions,
  setupEmailScheduler
};
