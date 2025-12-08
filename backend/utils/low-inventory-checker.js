const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');

/**
 * Check for low inventory products and send alerts for a specific business
 * @param {string} businessId - The business ID to check
 * @param {string} productId - Optional: specific product ID that was updated
 */
async function checkAndSendLowInventoryAlerts(businessId, productId = null) {
  try {
    // Get main connection
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    
    const business = await Business.findById(businessId);
    if (!business) {
      console.log(`⚠️  Business not found: ${businessId}`);
      return;
    }
    
    const emailSettings = business.settings?.emailNotificationSettings;
    
    // Check if low inventory alerts are enabled
    const lowInventoryEnabled = emailSettings?.systemAlerts?.enabled === true && 
                                 emailSettings?.systemAlerts?.lowInventory === true;
    
    if (!lowInventoryEnabled) {
      console.log(`⏭️  Low inventory alerts disabled for ${business.name}`);
      return;
    }
    
    // Get business database connection
    const businessDb = await databaseManager.getConnection(business._id, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Product, Staff } = businessModels;
    
    // Find products with low stock
    let query = { isActive: true };
    if (productId) {
      // If specific product was updated, only check that product
      query._id = productId;
    }
    
    const allProducts = await Product.find(query).lean();
    const lowStockProducts = allProducts.filter(product => {
      const stock = product.stock || 0;
      const minStock = product.minimumStock || product.minStock || 0;
      return minStock > 0 && stock < minStock;
    });
    
    if (lowStockProducts.length === 0) {
      return; // No low stock products
    }
    
    console.log(`⚠️  Found ${lowStockProducts.length} low stock product(s) for ${business.name}`);
    
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
      // Check if admin has low inventory preference enabled (default to true)
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
      console.log(`⚠️  No recipients found for low inventory alerts for ${business.name}`);
      return;
    }
    
    // Prepare product data for email
    const productsForEmail = lowStockProducts.map(p => ({
      name: p.name,
      stock: p.stock || 0,
      minStock: p.minimumStock || p.minStock || 0,
      unit: p.unit || 'units'
    }));
    
    // Send emails to all recipients
    for (const recipient of recipients) {
      try {
        await emailService.sendLowInventoryAlert({
          to: recipient.email,
          products: productsForEmail,
          businessName: business.name
        });
        console.log(`✅ Low inventory alert sent to ${recipient.email} (${recipient.name || recipient.role}) for business ${business.name}`);
      } catch (error) {
        console.error(`❌ Error sending low inventory alert to ${recipient.email}:`, error);
      }
    }
  } catch (error) {
    console.error(`❌ Error checking low inventory for business ${businessId}:`, error);
  }
}

module.exports = {
  checkAndSendLowInventoryAlerts
};

