/**
 * Payment gateway abstraction for wallet recharge.
 *
 * Reads the active provider from admin settings
 * (`api.integrations.paymentGateway.provider`) and delegates order creation +
 * verification to the matching implementation. All amounts are handled in
 * paise internally; each provider converts to its own smallest unit.
 */

'use strict';

const crypto = require('crypto');
const axios = require('axios');
const { logger } = require('../utils/logger');

const SUPPORTED_PROVIDERS = ['razorpay', 'stripe', 'zoho'];

function readGatewaySettings(adminSettings) {
  // Support both legacy (`api.integrations.paymentGateway`) and current
  // (`integrations.paymentGateway`) paths — admin UI persists via the `api`
  // settings category, but the form writes under the top-level `integrations` key.
  const fromAdmin =
    adminSettings?.integrations?.paymentGateway ||
    adminSettings?.api?.integrations?.paymentGateway ||
    {};

  // Fall back to process.env for any credential the admin UI hasn't filled in.
  // This keeps the admin panel authoritative but lets local/dev setups work by
  // just setting RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / STRIPE_* / ZOHO_* in .env.
  const merged = {
    ...fromAdmin,
    razorpayKeyId: fromAdmin.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: fromAdmin.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '',
    razorpayWebhookSecret:
      fromAdmin.razorpayWebhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || '',
    stripePublishableKey:
      fromAdmin.stripePublishableKey || process.env.STRIPE_PUBLISHABLE_KEY || '',
    stripeSecretKey: fromAdmin.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret:
      fromAdmin.stripeWebhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '',
    zohoClientId: fromAdmin.zohoClientId || process.env.ZOHO_CLIENT_ID || '',
    zohoClientSecret: fromAdmin.zohoClientSecret || process.env.ZOHO_CLIENT_SECRET || '',
    zohoRefreshToken: fromAdmin.zohoRefreshToken || process.env.ZOHO_REFRESH_TOKEN || '',
    zohoOrganizationId:
      fromAdmin.zohoOrganizationId || process.env.ZOHO_ORGANIZATION_ID || '',
    zohoReturnUrl: fromAdmin.zohoReturnUrl || process.env.ZOHO_RETURN_URL || '',
  };

  // If admin has not picked a provider but Razorpay env credentials exist,
  // default to razorpay so the wallet recharge works out-of-the-box.
  if (!merged.provider) {
    if (merged.razorpayKeyId && merged.razorpayKeySecret) merged.provider = 'razorpay';
    else if (merged.stripeSecretKey && merged.stripePublishableKey) merged.provider = 'stripe';
    else if (merged.zohoClientId && merged.zohoRefreshToken) merged.provider = 'zoho';
  }

  return merged;
}

function getGatewayConfig(adminSettings) {
  const gw = readGatewaySettings(adminSettings);
  const provider = String(gw.provider || 'razorpay').toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }
  if (gw.enabled === false) {
    throw new Error('Payment gateway is disabled in admin settings');
  }
  return { provider, config: gw };
}

// ── Razorpay ────────────────────────────────────────────────────────────────
async function createRazorpayOrder(config, amountPaise, receipt) {
  const { razorpayKeyId, razorpayKeySecret } = config;
  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new Error('Razorpay credentials are not configured');
  }
  const Razorpay = require('razorpay');
  const instance = new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret });
  const order = await instance.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    payment_capture: 1,
  });
  return {
    provider: 'razorpay',
    orderId: order.id,
    amountPaise,
    currency: order.currency,
    publicKey: razorpayKeyId,
  };
}

function verifyRazorpayPayment(config, payload) {
  const { razorpayKeySecret } = config;
  const { orderId, paymentId, signature } = payload;
  if (!orderId || !paymentId || !signature) {
    return { verified: false, error: 'Missing Razorpay verification fields' };
  }
  const expected = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const verified = crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(String(signature), 'utf8')
  );
  return {
    verified,
    providerOrderId: orderId,
    providerPaymentId: paymentId,
  };
}

// ── Stripe ──────────────────────────────────────────────────────────────────
async function createStripePaymentIntent(config, amountPaise, receipt) {
  const { stripeSecretKey, stripePublishableKey } = config;
  if (!stripeSecretKey || !stripePublishableKey) {
    throw new Error('Stripe credentials are not configured');
  }
  const Stripe = require('stripe');
  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
  // Stripe INR amounts are in paise (same unit).
  const intent = await stripe.paymentIntents.create({
    amount: amountPaise,
    currency: 'inr',
    metadata: { receipt },
    automatic_payment_methods: { enabled: true },
  });
  return {
    provider: 'stripe',
    orderId: intent.id,
    clientSecret: intent.client_secret,
    amountPaise,
    currency: 'INR',
    publicKey: stripePublishableKey,
  };
}

async function verifyStripePayment(config, payload) {
  const { stripeSecretKey } = config;
  const { orderId, paymentId } = payload;
  const paymentIntentId = paymentId || orderId;
  if (!paymentIntentId) {
    return { verified: false, error: 'Missing Stripe PaymentIntent id' };
  }
  const Stripe = require('stripe');
  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const verified = intent?.status === 'succeeded';
  return {
    verified,
    providerOrderId: intent?.id || paymentIntentId,
    providerPaymentId: intent?.latest_charge || intent?.id || paymentIntentId,
    amountPaise: intent?.amount,
    error: verified ? null : `Stripe PaymentIntent status: ${intent?.status || 'unknown'}`,
  };
}

// ── Zoho Pay ────────────────────────────────────────────────────────────────
const ZOHO_API_BASE = 'https://payments.zoho.in/api/v1';
const ZOHO_ACCOUNTS_BASE = 'https://accounts.zoho.in/oauth/v2';

async function getZohoAccessToken(config) {
  const { zohoClientId, zohoClientSecret, zohoRefreshToken } = config;
  if (!zohoClientId || !zohoClientSecret || !zohoRefreshToken) {
    throw new Error('Zoho Pay credentials are not configured (client id/secret/refresh token)');
  }
  const params = new URLSearchParams();
  params.set('refresh_token', zohoRefreshToken);
  params.set('client_id', zohoClientId);
  params.set('client_secret', zohoClientSecret);
  params.set('grant_type', 'refresh_token');
  const resp = await axios.post(`${ZOHO_ACCOUNTS_BASE}/token`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  const token = resp?.data?.access_token;
  if (!token) throw new Error('Failed to obtain Zoho access token');
  return token;
}

async function createZohoPaymentSession(config, amountPaise, receipt) {
  const { zohoOrganizationId, zohoReturnUrl } = config;
  if (!zohoOrganizationId) {
    throw new Error('Zoho organization id is not configured');
  }
  const token = await getZohoAccessToken(config);
  const amountRupees = (amountPaise / 100).toFixed(2);
  const payload = {
    amount: amountRupees,
    currency: 'INR',
    description: `Wallet recharge ${receipt}`,
    meta_data: { receipt },
    redirect_url: zohoReturnUrl || null,
  };
  const resp = await axios.post(`${ZOHO_API_BASE}/paymentsessions`, payload, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'X-com-zoho-payments-organizationid': zohoOrganizationId,
      'Content-Type': 'application/json',
    },
    timeout: 20000,
  });
  const session = resp?.data?.payments_session || resp?.data?.payment_session || resp?.data;
  const sessionId = session?.payments_session_id || session?.payment_session_id || session?.id;
  const sessionUrl =
    session?.url ||
    session?.redirect_url ||
    (sessionId ? `https://payments.zoho.in/portal/pay/${sessionId}` : null);
  if (!sessionId || !sessionUrl) {
    throw new Error('Zoho did not return a payment session');
  }
  return {
    provider: 'zoho',
    orderId: sessionId,
    sessionUrl,
    amountPaise,
    currency: 'INR',
    publicKey: zohoOrganizationId,
  };
}

async function verifyZohoPayment(config, payload) {
  const { zohoOrganizationId } = config;
  const { orderId, paymentId } = payload;
  const idToCheck = paymentId || orderId;
  if (!idToCheck) return { verified: false, error: 'Missing Zoho payment id' };
  const token = await getZohoAccessToken(config);
  const resp = await axios.get(`${ZOHO_API_BASE}/payments/${idToCheck}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'X-com-zoho-payments-organizationid': zohoOrganizationId,
    },
    timeout: 15000,
  });
  const payment = resp?.data?.payment || resp?.data;
  const status = String(payment?.status || '').toLowerCase();
  const verified = status === 'success' || status === 'succeeded' || status === 'captured';
  const amount = Number(payment?.amount || 0);
  return {
    verified,
    providerOrderId: orderId || payment?.payment_session_id || idToCheck,
    providerPaymentId: payment?.payment_id || idToCheck,
    amountPaise: Number.isFinite(amount) ? Math.round(amount * 100) : null,
    error: verified ? null : `Zoho payment status: ${payment?.status || 'unknown'}`,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────
/**
 * Create an order with the configured provider. Returns the data the frontend
 * needs to complete payment.
 */
async function createOrder(adminSettings, amountPaise, receipt) {
  const { provider, config } = getGatewayConfig(adminSettings);
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error('amountPaise must be a positive integer');
  }
  const safeReceipt = receipt || `rcpt_${Date.now()}`;
  if (provider === 'razorpay') return createRazorpayOrder(config, amountPaise, safeReceipt);
  if (provider === 'stripe') return createStripePaymentIntent(config, amountPaise, safeReceipt);
  if (provider === 'zoho') return createZohoPaymentSession(config, amountPaise, safeReceipt);
  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Verify a payment callback with the configured provider.
 */
async function verifyPayment(adminSettings, payload) {
  const gwSettings = readGatewaySettings(adminSettings);
  const provider = String(
    payload?.provider ||
      gwSettings?.provider ||
      ''
  ).toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return { verified: false, error: `Unsupported provider: ${provider}` };
  }
  const config = gwSettings;
  try {
    if (provider === 'razorpay') return { provider, ...verifyRazorpayPayment(config, payload) };
    if (provider === 'stripe') return { provider, ...(await verifyStripePayment(config, payload)) };
    if (provider === 'zoho') return { provider, ...(await verifyZohoPayment(config, payload)) };
    return { verified: false, error: `Unsupported provider: ${provider}` };
  } catch (err) {
    logger.error(`[payment-gateway] ${provider} verify failed:`, err?.message || err);
    return { verified: false, provider, error: err?.message || String(err) };
  }
}

module.exports = {
  SUPPORTED_PROVIDERS,
  getGatewayConfig,
  createOrder,
  verifyPayment,
};
