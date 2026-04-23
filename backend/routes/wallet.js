/**
 * Wallet + recharge routes.
 *
 * Surface for the frontend Recharge settings card:
 *   GET  /api/wallet/balance
 *   GET  /api/wallet/transactions
 *   POST /api/wallet/recharge/order
 *   POST /api/wallet/recharge/verify
 */

'use strict';

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { setupMainDatabase } = require('../middleware/business-db');
const databaseManager = require('../config/database-manager');
const paymentGateway = require('../lib/payment-gateway');
const {
  sendWalletRechargeInvoice,
  buildInvoicePDFForTransaction,
} = require('../lib/send-wallet-invoice');

const MIN_RECHARGE_RUPEES = 10;
const MAX_RECHARGE_RUPEES = 50000;

// 18% GST is added on top of the entered recharge amount. The user is
// charged `base × 1.18`; only the base (pre-tax) amount is credited to the
// wallet. The GST slice is recorded for audit on the WalletTransaction row.
const GST_RATE = 0.18;

function computeRechargeBreakdown(amountRupees) {
  const basePaise = Math.round(Number(amountRupees) * 100);
  const gstPaise = Math.round(basePaise * GST_RATE);
  const totalPaise = basePaise + gstPaise;
  return {
    basePaise,
    gstPaise,
    totalPaise,
    baseRupees: basePaise / 100,
    gstRupees: gstPaise / 100,
    totalRupees: totalPaise / 100,
    gstRate: GST_RATE,
  };
}

async function getMainModels() {
  const mainConnection = await databaseManager.getMainConnection();
  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const AdminSettings = mainConnection.model(
    'AdminSettings',
    require('../models/AdminSettings').schema
  );
  const WalletTransaction = mainConnection.model(
    'WalletTransaction',
    require('../models/WalletTransaction').schema
  );
  return { Business, AdminSettings, WalletTransaction };
}

function paiseToRupees(p) {
  return Math.round(Number(p || 0)) / 100;
}

// ── GET /balance ────────────────────────────────────────────────────────────
router.get('/balance', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID not found' });
    const { Business } = await getMainModels();
    const business = await Business.findById(businessId).select('wallet').lean();
    const balancePaise = Number(business?.wallet?.balancePaise || 0);
    res.json({
      success: true,
      data: { balancePaise, balanceRupees: paiseToRupees(balancePaise) },
    });
  } catch (err) {
    logger.error('Error fetching wallet balance:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch wallet balance' });
  }
});

// ── GET /transactions ───────────────────────────────────────────────────────
router.get('/transactions', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID not found' });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const { WalletTransaction } = await getMainModels();
    const filter = { businessId };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.channel) filter.channel = req.query.channel;

    const [logs, total] = await Promise.all([
      WalletTransaction.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      WalletTransaction.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        logs: logs.map(t => ({
          _id: t._id,
          type: t.type,
          amountPaise: t.amountPaise,
          amountRupees: paiseToRupees(t.amountPaise),
          gstPaise: Number(t.gstPaise || 0),
          gstRupees: paiseToRupees(t.gstPaise || 0),
          gstRate: Number(t.gstRate || 0),
          totalChargedPaise: Number(t.totalChargedPaise || 0),
          totalChargedRupees: paiseToRupees(t.totalChargedPaise || 0),
          channel: t.channel,
          messageCategory: t.messageCategory,
          provider: t.provider,
          description: t.description,
          balanceAfterPaise: t.balanceAfterPaise,
          balanceAfterRupees: paiseToRupees(t.balanceAfterPaise),
          timestamp: t.timestamp,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (err) {
    logger.error('Error fetching wallet transactions:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch wallet transactions' });
  }
});

// ── POST /recharge/order ────────────────────────────────────────────────────
// `amountRupees` in the body is the **base (pre-GST) amount the user wants
// credited to their wallet**. Server adds 18% GST on top and instructs the
// gateway to capture `base + GST`.
router.post('/recharge/order', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID not found' });
    const amountRupees = Number(req.body?.amountRupees);
    if (!Number.isFinite(amountRupees) || amountRupees < MIN_RECHARGE_RUPEES || amountRupees > MAX_RECHARGE_RUPEES) {
      return res.status(400).json({
        success: false,
        error: `Recharge amount must be between ₹${MIN_RECHARGE_RUPEES} and ₹${MAX_RECHARGE_RUPEES}`,
      });
    }
    const breakdown = computeRechargeBreakdown(amountRupees);

    const { AdminSettings } = await getMainModels();
    const adminSettings = await AdminSettings.getSettings();
    // Razorpay enforces a 40-character limit on `receipt`. Use the last 10
    // chars of the business id + a short base36 timestamp to stay well under it.
    const shortBiz = String(businessId).slice(-10);
    const shortTs = Date.now().toString(36);
    const receipt = `wlt_${shortBiz}_${shortTs}`;
    const order = await paymentGateway.createOrder(
      adminSettings,
      breakdown.totalPaise,
      receipt
    );
    res.json({
      success: true,
      data: {
        ...order,
        // Echo the full breakdown so the UI can render "wallet credit / GST /
        // total payable". `amountPaise` on the gateway order is the GST-inclusive
        // total charged to the customer.
        baseAmountPaise: breakdown.basePaise,
        gstPaise: breakdown.gstPaise,
        totalAmountPaise: breakdown.totalPaise,
        gstRate: breakdown.gstRate,
      },
    });
  } catch (err) {
    logger.error('Error creating recharge order:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Failed to create recharge order',
    });
  }
});

// ── POST /recharge/verify ───────────────────────────────────────────────────
router.post('/recharge/verify', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    if (!businessId) return res.status(400).json({ success: false, error: 'Business ID not found' });
    const { provider, orderId, paymentId, signature, amountRupees } = req.body || {};
    if (!provider) return res.status(400).json({ success: false, error: 'Missing provider' });

    const { AdminSettings, Business, WalletTransaction } = await getMainModels();
    const adminSettings = await AdminSettings.getSettings();
    const verification = await paymentGateway.verifyPayment(adminSettings, {
      provider,
      orderId,
      paymentId,
      signature,
    });
    if (!verification?.verified) {
      return res.status(400).json({
        success: false,
        error: verification?.error || 'Payment could not be verified',
      });
    }

    // Idempotency — if we've already credited this payment, return current balance.
    const existing = await WalletTransaction.findOne({
      businessId,
      type: 'credit',
      providerPaymentId: verification.providerPaymentId || null,
    }).lean();
    const fresh = await Business.findById(businessId).select('wallet').lean();
    if (existing) {
      return res.json({
        success: true,
        data: {
          newBalancePaise: Number(fresh?.wallet?.balancePaise || 0),
          alreadyCredited: true,
          amountPaise: Number(existing.amountPaise || 0),
          basePaise: Number(existing.amountPaise || 0),
          gstPaise: Number(existing.gstPaise || 0),
          gstRate: Number(existing.gstRate || 0),
          totalChargedPaise: Number(existing.totalChargedPaise || existing.amountPaise || 0),
        },
      });
    }

    // Derive base (wallet credit) + GST from the client intent and cross-check
    // the gateway-captured amount. The client sends `amountRupees` = the
    // pre-GST base; we expected to charge base × 1.18.
    const clientBaseRupees = Number(amountRupees);
    const expected = Number.isFinite(clientBaseRupees) && clientBaseRupees > 0
      ? computeRechargeBreakdown(clientBaseRupees)
      : null;

    const gatewayTotalPaise =
      Number.isInteger(verification.amountPaise) && verification.amountPaise > 0
        ? verification.amountPaise
        : null;

    let basePaise = null;
    let gstPaise = 0;
    let totalChargedPaise = null;
    let gstRateApplied = 0;

    if (expected && gatewayTotalPaise !== null) {
      // Tolerate 1-paise rounding slop between our computation and the gateway.
      if (Math.abs(gatewayTotalPaise - expected.totalPaise) <= 1) {
        basePaise = expected.basePaise;
        gstPaise = expected.gstPaise;
        totalChargedPaise = gatewayTotalPaise;
        gstRateApplied = expected.gstRate;
      } else if (Math.abs(gatewayTotalPaise - expected.basePaise) <= 1) {
        // Legacy in-flight order that was placed before GST was introduced —
        // the gateway captured the bare base amount. Credit what was paid.
        basePaise = gatewayTotalPaise;
        totalChargedPaise = gatewayTotalPaise;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Amount mismatch between client and payment gateway',
        });
      }
    } else if (gatewayTotalPaise !== null) {
      // No client base supplied — credit whatever the gateway captured. Treat
      // the entire amount as GST-inclusive (back-compat path, no GST split).
      basePaise = gatewayTotalPaise;
      totalChargedPaise = gatewayTotalPaise;
    } else if (expected) {
      // Gateway didn't tell us the captured amount — fall back to the
      // expected total and credit the base.
      basePaise = expected.basePaise;
      gstPaise = expected.gstPaise;
      totalChargedPaise = expected.totalPaise;
      gstRateApplied = expected.gstRate;
    }

    if (!basePaise || basePaise <= 0) {
      return res.status(400).json({ success: false, error: 'Could not determine recharge amount' });
    }

    const updated = await Business.findByIdAndUpdate(
      businessId,
      { $inc: { 'wallet.balancePaise': basePaise } },
      { new: true, lean: true }
    );
    const newBalancePaise = Number(updated?.wallet?.balancePaise || 0);

    const gstSuffix =
      gstPaise > 0
        ? ` (incl. ₹${(gstPaise / 100).toFixed(2)} GST @ ${(gstRateApplied * 100).toFixed(0)}%)`
        : '';

    const creditTxn = await WalletTransaction.create({
      businessId,
      type: 'credit',
      amountPaise: basePaise,
      gstPaise,
      gstRate: gstRateApplied,
      totalChargedPaise,
      channel: null,
      messageCategory: null,
      provider,
      providerOrderId: verification.providerOrderId || orderId || null,
      providerPaymentId: verification.providerPaymentId || paymentId || null,
      description: `Wallet recharge via ${provider}${gstSuffix}`,
      balanceAfterPaise: newBalancePaise,
      timestamp: new Date(),
    });

    // Fire-and-forget: generate GST invoice PDF and email it to the
    // business owner (+ the user who initiated the recharge, if different).
    // Any failure is logged inside the orchestrator and must never block
    // the recharge success response or roll back the credit.
    setImmediate(() => {
      sendWalletRechargeInvoice({
        transactionId: creditTxn._id,
        triggeredByEmail: req.user?.email || null,
      }).catch(err => {
        logger.error(
          '[wallet-invoice] fire-and-forget send failed:',
          err?.message || err
        );
      });
    });

    res.json({
      success: true,
      data: {
        newBalancePaise,
        newBalanceRupees: paiseToRupees(newBalancePaise),
        amountPaise: basePaise,
        basePaise,
        gstPaise,
        gstRate: gstRateApplied,
        totalChargedPaise,
      },
    });
  } catch (err) {
    logger.error('Error verifying recharge:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Failed to verify recharge',
    });
  }
});

/**
 * GET /api/wallet/invoice/:transactionId
 *
 * Re-generates the GST tax-invoice PDF for a wallet-recharge transaction
 * and streams it as an attachment. Auth-scoped to the caller's business so
 * users can only download invoices for their own recharges.
 */
router.get('/invoice/:transactionId', authenticateToken, setupMainDatabase, async (req, res) => {
  try {
    const businessId = req.user?.branchId;
    if (!businessId) {
      return res.status(400).json({ success: false, error: 'Business ID not found' });
    }

    const { transactionId } = req.params;
    if (!transactionId || !/^[a-f\d]{24}$/i.test(String(transactionId))) {
      return res.status(400).json({ success: false, error: 'Invalid transaction id' });
    }

    let built;
    try {
      built = await buildInvoicePDFForTransaction({
        transactionId,
        businessIdScope: businessId,
      });
    } catch (err) {
      const code = err?.code;
      if (code === 'NOT_FOUND') {
        return res.status(404).json({ success: false, error: err.message });
      }
      if (code === 'FORBIDDEN') {
        return res.status(403).json({ success: false, error: err.message });
      }
      if (code === 'INVALID_TYPE') {
        return res.status(400).json({ success: false, error: err.message });
      }
      throw err;
    }

    const { pdfBuffer, invoiceNumber } = built;
    const safeFilename = `${String(invoiceNumber).replace(/[^A-Za-z0-9_-]+/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(pdfBuffer);
  } catch (err) {
    logger.error('Error generating invoice PDF:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to generate invoice',
    });
  }
});

module.exports = router;
