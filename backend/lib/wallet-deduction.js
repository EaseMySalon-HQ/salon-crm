/**
 * Wallet deduction helpers for SMS / WhatsApp send sites.
 *
 * Pricing (in paise):
 *   - SMS                              : 20 paise
 *   - WhatsApp (messageType=campaign)  : 120 paise (promotional)
 *   - WhatsApp (any other messageType) : 20 paise (transactional)
 *
 * `can*` helpers are cheap reads against an already-fetched Business document.
 * `deduct*` helpers perform an atomic conditional `$inc` on the Main DB's
 * Business collection and log a WalletTransaction. They treat insufficient
 * balance as a soft failure (`{ success: false }`) so callers can skip the
 * send without throwing.
 */

'use strict';

const databaseManager = require('../config/database-manager');
const { logger } = require('../utils/logger');

const SMS_COST_PAISE = 20;
const WHATSAPP_PROMO_COST_PAISE = 120;
const WHATSAPP_TXN_COST_PAISE = 20;

function getBusinessBalance(business) {
  return Number(business?.wallet?.balancePaise || 0);
}

function whatsAppCostPaise(messageType) {
  return messageType === 'campaign' ? WHATSAPP_PROMO_COST_PAISE : WHATSAPP_TXN_COST_PAISE;
}

function whatsAppCategory(messageType) {
  return messageType === 'campaign' ? 'promotional' : 'transactional';
}

function canDeductSms(business) {
  return getBusinessBalance(business) >= SMS_COST_PAISE;
}

function canDeductWhatsApp(business, messageType) {
  return getBusinessBalance(business) >= whatsAppCostPaise(messageType);
}

async function getMainModels() {
  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const WalletTransaction = mainConnection.model(
    'WalletTransaction',
    require('../models/WalletTransaction').schema
  );
  return { Business, WalletTransaction };
}

async function atomicDeduct({ businessId, costPaise, channel, messageCategory, description, relatedEntity }) {
  try {
    if (!businessId || !Number.isInteger(costPaise) || costPaise <= 0) {
      return { success: false, error: 'Invalid deduction parameters' };
    }
    const { Business, WalletTransaction } = await getMainModels();
    const updated = await Business.findOneAndUpdate(
      { _id: businessId, 'wallet.balancePaise': { $gte: costPaise } },
      { $inc: { 'wallet.balancePaise': -costPaise } },
      { new: true, lean: true }
    );
    if (!updated) {
      return { success: false, error: 'Insufficient wallet balance' };
    }
    const newBalancePaise = Number(updated?.wallet?.balancePaise || 0);
    await WalletTransaction.create({
      businessId,
      type: 'debit',
      amountPaise: costPaise,
      channel,
      messageCategory,
      provider: 'system',
      description: description || null,
      relatedEntityId: relatedEntity?.id || null,
      relatedEntityType: relatedEntity?.type || null,
      balanceAfterPaise: newBalancePaise,
      timestamp: new Date(),
    });
    return { success: true, newBalancePaise };
  } catch (err) {
    logger.error('[wallet-deduction] atomic deduct failed:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

async function deductSms(businessId, { description, relatedEntity } = {}) {
  return atomicDeduct({
    businessId,
    costPaise: SMS_COST_PAISE,
    channel: 'sms',
    messageCategory: 'transactional',
    description: description || 'SMS send',
    relatedEntity,
  });
}

async function deductWhatsApp(businessId, messageType, { description, relatedEntity } = {}) {
  const cost = whatsAppCostPaise(messageType);
  return atomicDeduct({
    businessId,
    costPaise: cost,
    channel: 'whatsapp',
    messageCategory: whatsAppCategory(messageType),
    description: description || `WhatsApp ${messageType || 'send'}`,
    relatedEntity,
  });
}

module.exports = {
  SMS_COST_PAISE,
  WHATSAPP_PROMO_COST_PAISE,
  WHATSAPP_TXN_COST_PAISE,
  canDeductSms,
  canDeductWhatsApp,
  deductSms,
  deductWhatsApp,
  whatsAppCostPaise,
};
