const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const emailService = require('../services/email-service');

/**
 * Send daily summary email for a specific date (used when cash registry is verified).
 * Only sends if daily summary is enabled and mode is 'afterClosing'.
 *
 * @param {string} businessId - Business ID (from main DB)
 * @param {string} branchId - Branch ID for querying business data (usually same as businessId)
 * @param {Date} targetDate - The date to send summary for
 * @returns {Promise<{ sent: number, skipped: boolean, error?: string }>}
 */
async function sendDailySummaryForDate(businessId, branchId, targetDate) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const Business = mainConnection.model('Business', require('../models/Business').schema);

    const business = await Business.findById(businessId).lean();
    if (!business) {
      return { sent: 0, skipped: true, error: 'Business not found' };
    }

    const settings = business.settings?.emailNotificationSettings;
    if (!settings?.dailySummary?.enabled) {
      return { sent: 0, skipped: true };
    }

    if (settings.dailySummary.mode !== 'afterClosing') {
      return { sent: 0, skipped: true };
    }

    const businessDb = await databaseManager.getConnection(businessId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Staff, Receipt, Sale, CashRegistry, Expense } = businessModels;

    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dateString = dayStart.toISOString().split('T')[0];
    const dateFormatted = dayStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    const sales = await Sale.find({
      branchId,
      date: { $gte: dayStart, $lt: dayEnd },
      status: { $nin: ['cancelled', 'Cancelled'] }
    }).lean();

    const receipts = await Receipt.find({
      branchId,
      date: { $gte: dateString, $lt: dayEnd.toISOString().split('T')[0] }
    }).lean();

    const closingRegistry = await CashRegistry.findOne({
      branchId,
      date: { $gte: dayStart, $lt: dayEnd },
      shiftType: 'closing'
    }).lean();

    const cashExpenses = await Expense.find({
      branchId,
      date: { $gte: dayStart, $lt: dayEnd },
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
        if (d && d >= dayStart && d < dayEnd) duesCollected += ph.amount || 0;
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

    if (recipients.length === 0) {
      return { sent: 0, skipped: false };
    }

    let sentCount = 0;
    for (const staff of recipients) {
      try {
        await emailService.sendDailySummary({
          to: staff.email,
          businessName: business.name,
          date: dateString,
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
        sentCount++;
      } catch (err) {
        console.error(`Error sending daily summary to ${staff.email}:`, err);
      }
    }

    console.log(`📧 Daily summary sent to ${sentCount} recipients for ${business.name} (date: ${dateString})`);
    return { sent: sentCount, skipped: false };
  } catch (error) {
    console.error('Error sending daily summary for date:', error);
    return { sent: 0, skipped: false, error: error.message };
  }
}

module.exports = { sendDailySummaryForDate };
