const emailService = require('../services/email-service');
const databaseManager = require('../config/database-manager');
const { logger } = require('./logger');
const modelFactory = require('../models/model-factory');
const { resolveReportRecipients } = require('../lib/report-email-recipients');

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
      logger.debug(`⚠️  Business not found: ${businessId}`);
      return;
    }

    const { isPlatformEmailDisabled } = require('../lib/business-email-policy');
    if (isPlatformEmailDisabled(business)) {
      logger.debug(`⏭️  Low inventory skipped — platform email disabled for ${business.name}`);
      return;
    }

    const emailSettings = business.settings?.emailNotificationSettings;
    
    // Check if low inventory alerts are enabled
    const lowInventoryEnabled = emailSettings?.systemAlerts?.enabled === true && 
                                 emailSettings?.systemAlerts?.lowInventory === true;
    
    if (!lowInventoryEnabled) {
      logger.debug(`⏭️  Low inventory alerts disabled for ${business.name}`);
      return;
    }
    
    // Get business database connection
    const businessDb = await databaseManager.getConnection(business._id, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Product } = businessModels;
    
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
    
    logger.debug(`⚠️  Found ${lowStockProducts.length} low stock product(s) for ${business.name}`);
    
    const recipients = await resolveReportRecipients({
      business,
      businessModels,
      mainConnection,
      prefKey: 'lowInventory',
      recipientStaffIds: emailSettings?.systemAlerts?.recipientStaffIds || [],
    });
    
    if (recipients.length === 0) {
      logger.debug(`⚠️  No recipients found for low inventory alerts for ${business.name}`);
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
        logger.debug(`✅ Low inventory alert sent to ${recipient.email} (${recipient.name || recipient.role}) for business ${business.name}`);
      } catch (error) {
        logger.error(`❌ Error sending low inventory alert to ${recipient.email}:`, error);
      }
    }
  } catch (error) {
    logger.error(`❌ Error checking low inventory for business ${businessId}:`, error);
  }
}

module.exports = {
  checkAndSendLowInventoryAlerts
};

