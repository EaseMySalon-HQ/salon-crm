const cron = require('node-cron');
const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');

/**
 * Send daily summary emails to all businesses
 */
async function sendDailySummaries() {
  try {
    console.log('📧 Starting daily summary email job...');
    
    // Get main connection
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    
    // Get all active businesses
    const businesses = await Business.find({ status: 'active' });
    console.log(`Found ${businesses.length} active businesses`);
    
    for (const business of businesses) {
      try {
        const emailSettings = business.settings?.emailNotificationSettings;
        
        // Check if daily summary is enabled
        // Default to enabled if not explicitly disabled, or if disabled but no recipient list configured (never configured)
        const recipientListConfigured = emailSettings?.dailySummary?.recipientStaffIds?.length > 0;
        const dailySummaryEnabled = emailSettings?.dailySummary?.enabled !== false || 
          (emailSettings?.dailySummary?.enabled === false && !recipientListConfigured);
        
        if (!dailySummaryEnabled) {
          console.log(`⏭️  Skipping daily summary for ${business.name} - disabled in settings`);
          continue;
        }
        
        console.log(`📧 Processing daily summary for business: ${business.name}`);
        
        // Get business database connection
        const businessDb = await databaseManager.getConnection(business._id, mainConnection);
        const businessModels = modelFactory.createBusinessModels(businessDb);
        const { Staff, Receipt, Appointment, Client } = businessModels;
        
        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Get today's data
        const receipts = await Receipt.find({
          branchId: business._id,
          date: {
            $gte: today.toISOString().split('T')[0],
            $lt: tomorrow.toISOString().split('T')[0]
          }
        }).lean();
        
        const appointments = await Appointment.find({
          branchId: business._id,
          date: today.toISOString().split('T')[0]
        }).lean();
        
        const newClients = await Client.find({
          branchId: business._id,
          createdAt: { $gte: today }
        }).lean();
        
        // Calculate summary
        const totalRevenue = receipts.reduce((sum, r) => sum + (r.total || 0), 0);
        const totalSales = receipts.length;
        const appointmentCount = appointments.length;
        const newClientsCount = newClients.length;
        
        console.log(`📊 Daily summary for ${business.name}: ${totalSales} sales, ₹${totalRevenue}, ${appointmentCount} appointments, ${newClientsCount} new clients`);
        
        // Get top services (simplified - can be enhanced)
        const topServices = [];
        
        // Get top products (simplified - can be enhanced)
        const topProducts = [];
        
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
        
        console.log(`📧 Found ${adminUsers.length} admin user(s) for daily summary`);
        
        for (const admin of adminUsers) {
          const alreadyInList = recipients.some(r => r.email === admin.email);
          if (!alreadyInList) {
            recipients.push({
              _id: admin._id,
              name: admin.name || `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email,
              email: admin.email,
              role: 'admin'
            });
            console.log(`📧 Added admin user to daily summary recipients: ${admin.email}`);
          }
        }
        
        console.log(`📧 Found ${recipients.length} total recipients for daily summary`);
        
        if (recipients.length === 0) {
          console.log(`⚠️  No recipients found for ${business.name}. Reasons:`);
          console.log(`   - Check if staff have email notifications enabled`);
          console.log(`   - Check if staff have daily summary preference enabled`);
          console.log(`   - Check if staff have valid email addresses`);
          continue;
        }
        
        // Send emails
        for (const staff of recipients) {
          try {
            await emailService.sendDailySummary({
              to: staff.email,
              businessName: business.name,
              date: today.toISOString().split('T')[0],
              summaryData: {
                totalSales,
                totalRevenue,
                appointmentCount,
                newClients: newClientsCount,
                topServices,
                topProducts
              }
            });
            console.log(`✅ Daily summary sent to ${staff.email} (${staff.name || staff.role}) for business ${business.name}`);
          } catch (error) {
            console.error(`❌ Error sending daily summary to ${staff.email}:`, error);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing daily summary for business ${business.name}:`, error);
      }
    }
    
    console.log('✅ Daily summary email job completed');
  } catch (error) {
    console.error('❌ Error in daily summary email job:', error);
  }
}

/**
 * Send weekly summary emails to all businesses
 */
async function sendWeeklySummaries() {
  try {
    console.log('📧 Starting weekly summary email job...');
    
    // Get main connection
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    
    // Get all active businesses
    const businesses = await Business.find({ status: 'active' });
    console.log(`Found ${businesses.length} active businesses`);
    
    for (const business of businesses) {
      try {
        const emailSettings = business.settings?.emailNotificationSettings;
        
        // Check if weekly summary is enabled
        // Default to enabled if not explicitly disabled, or if disabled but no recipient list configured (never configured)
        const recipientListConfigured = emailSettings?.weeklySummary?.recipientStaffIds?.length > 0;
        const weeklySummaryEnabled = emailSettings?.weeklySummary?.enabled !== false || 
          (emailSettings?.weeklySummary?.enabled === false && !recipientListConfigured);
        
        if (!weeklySummaryEnabled) {
          console.log(`⏭️  Skipping weekly summary for ${business.name} - disabled in settings`);
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
        
        console.log(`📧 Processing weekly summary for business: ${business.name}`);
        
        // Get business database connection
        const businessDb = await databaseManager.getConnection(business._id, mainConnection);
        const businessModels = modelFactory.createBusinessModels(businessDb);
        const { Staff, Receipt, Appointment, Client } = businessModels;
        
        // Calculate week start and end
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        // Get week's data
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
        
        // Calculate summary
        const totalRevenue = receipts.reduce((sum, r) => sum + (r.total || 0), 0);
        const totalSales = receipts.length;
        const appointmentCount = appointments.length;
        const newClientsCount = newClients.length;
        
        console.log(`📊 Weekly summary for ${business.name}: ${totalSales} sales, ₹${totalRevenue}, ${appointmentCount} appointments, ${newClientsCount} new clients`);
        
        // Calculate revenue growth (simplified - compare with previous week)
        let revenueGrowth = null;
        try {
          const prevWeekStart = new Date(weekStart);
          prevWeekStart.setDate(prevWeekStart.getDate() - 7);
          const prevWeekEnd = new Date(prevWeekStart);
          prevWeekEnd.setDate(prevWeekStart.getDate() + 6);
          
          const prevWeekReceipts = await Receipt.find({
            branchId: business._id,
            date: {
              $gte: prevWeekStart.toISOString().split('T')[0],
              $lte: prevWeekEnd.toISOString().split('T')[0]
            }
          }).lean();
          
          const prevWeekRevenue = prevWeekReceipts.reduce((sum, r) => sum + (r.total || 0), 0);
          
          if (prevWeekRevenue > 0) {
            revenueGrowth = ((totalRevenue - prevWeekRevenue) / prevWeekRevenue) * 100;
          }
        } catch (error) {
          console.error('Error calculating revenue growth:', error);
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
        
        console.log(`📧 Found ${adminUsers.length} admin user(s) for weekly summary`);
        
        for (const admin of adminUsers) {
          const alreadyInList = recipients.some(r => r.email === admin.email);
          if (!alreadyInList) {
            recipients.push({
              _id: admin._id,
              name: admin.name || `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.email,
              email: admin.email,
              role: 'admin'
            });
            console.log(`📧 Added admin user to weekly summary recipients: ${admin.email}`);
          }
        }
        
        console.log(`📧 Found ${recipients.length} total recipients for weekly summary`);
        
        if (recipients.length === 0) {
          console.log(`⚠️  No recipients found for ${business.name}. Reasons:`);
          console.log(`   - Check if staff have email notifications enabled`);
          console.log(`   - Check if staff have weekly summary preference enabled`);
          console.log(`   - Check if staff have valid email addresses`);
          continue;
        }
        
        // Send emails
        for (const staff of recipients) {
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
            console.log(`✅ Weekly summary sent to ${staff.email} (${staff.name || staff.role}) for business ${business.name}`);
          } catch (error) {
            console.error(`❌ Error sending weekly summary to ${staff.email}:`, error);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing weekly summary for business ${business.name}:`, error);
      }
    }
    
    console.log('✅ Weekly summary email job completed');
  } catch (error) {
    console.error('❌ Error in weekly summary email job:', error);
  }
}

/**
 * Setup email scheduler cron jobs
 */
function setupEmailScheduler() {
  // Daily summary - runs every day at configured time (default 9 PM)
  // For now, we'll check all businesses and use their configured times
  // In production, you might want separate cron jobs per business
  cron.schedule('0 21 * * *', async () => {
    console.log('⏰ Running daily summary email job...');
    await sendDailySummaries();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  // Weekly summary - runs every Sunday at configured time (default 8 PM)
  cron.schedule('0 20 * * 0', async () => {
    console.log('⏰ Running weekly summary email job...');
    await sendWeeklySummaries();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
  
  console.log('✅ Email scheduler jobs configured');
  console.log('   - Daily summary: Every day at 9:00 PM IST');
  console.log('   - Weekly summary: Every Sunday at 8:00 PM IST');
}

module.exports = {
  sendDailySummaries,
  sendWeeklySummaries,
  setupEmailScheduler
};

