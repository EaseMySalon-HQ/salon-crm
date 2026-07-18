'use strict';

const databaseManager = require('../config/database-manager');

const DEFAULT_GST_RATE = 0.18;

async function getWalletGstRate() {
  try {
    const main = await databaseManager.getMainConnection();
    const AdminSettings = main.model('AdminSettings', require('../models/AdminSettings').schema);
    const settings = await AdminSettings.getSettings();
    const rate = Number(settings?.invoice?.gstRate);
    if (Number.isFinite(rate) && rate >= 0 && rate <= 1) return rate;
  } catch {
    // fall through
  }
  return DEFAULT_GST_RATE;
}

/** Wallet credit (base) + GST — same split as tenant self-serve recharge. */
function computeWalletRechargeBreakdown(amountRupees, gstRate = DEFAULT_GST_RATE) {
  const rate = Number.isFinite(gstRate) && gstRate >= 0 ? gstRate : DEFAULT_GST_RATE;
  const basePaise = Math.round(Number(amountRupees) * 100);
  const gstPaise = Math.round(basePaise * rate);
  const totalPaise = basePaise + gstPaise;
  return {
    basePaise,
    gstPaise,
    totalPaise,
    baseRupees: basePaise / 100,
    gstRupees: gstPaise / 100,
    totalRupees: totalPaise / 100,
    gstRate: rate,
  };
}

module.exports = {
  DEFAULT_GST_RATE,
  getWalletGstRate,
  computeWalletRechargeBreakdown,
};
