/**
 * Unit tests for the WhatsApp Business module primitives:
 *   - lib/crypto       (round-trip + tamper detection)
 *   - lib/whatsapp-intents (descriptor lookups)
 *   - config/whatsapp-pricing (CSW/FEP free-window resolver)
 *   - lib/send-whatsapp (dedupe key shape)
 *
 * These tests are intentionally pure-JS and avoid a real Mongo connection so
 * they run in CI without infra.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// Provide a deterministic 32-byte key before requiring the crypto module.
process.env.WHATSAPP_TOKEN_ENC_KEY = crypto.randomBytes(32).toString('hex');

const { encrypt, decrypt } = require('../../lib/crypto');
const { INTENTS, getDescriptor, isValidIntent } = require('../../lib/whatsapp-intents');
const { resolveCostPaise, RATE_TABLE } = require('../../config/whatsapp-pricing');
const { buildDedupeKey } = require('../../lib/send-whatsapp');

test('crypto: round-trip preserves plaintext', () => {
  const plain = 'EAAG-some-fake-meta-token-1234';
  const env = encrypt(plain);
  assert.equal(decrypt(env), plain);
  assert.match(env, /^v1:[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
});

test('crypto: tamper detection throws', () => {
  const plain = 'sensitive';
  const env = encrypt(plain);
  // Flip one byte of the cipher portion to simulate tamper.
  const parts = env.split(':');
  const cipherHex = Buffer.from(parts[3], 'hex');
  cipherHex[0] = cipherHex[0] ^ 0xff;
  parts[3] = cipherHex.toString('hex');
  const tampered = parts.join(':');
  assert.throws(() => decrypt(tampered), /unable to authenticate|bad/i);
});

test('intents: marketing_campaign is gupshup_only', () => {
  const desc = getDescriptor(INTENTS.MARKETING_CAMPAIGN);
  assert.equal(desc.providerPolicy, 'gupshup_only');
  assert.equal(desc.category, 'marketing');
  assert.equal(desc.cswFreeIfOpen, false);
});

test('intents: appointment_reminder is utility/gupshup_only with CSW free', () => {
  const desc = getDescriptor(INTENTS.APPOINTMENT_REMINDER);
  assert.equal(desc.providerPolicy, 'gupshup_only');
  assert.equal(desc.category, 'utility');
  assert.equal(desc.cswFreeIfOpen, true);
  assert.equal(desc.fallbackChannel, 'sms');
});

test('intents: invalid intent rejected', () => {
  assert.equal(isValidIntent('not_an_intent'), false);
});

test('pricing: utility inside CSW is free; outside is paid', () => {
  const free = resolveCostPaise({ category: 'utility', countryCode: 'IN', freeWindow: true });
  const paid = resolveCostPaise({ category: 'utility', countryCode: 'IN', freeWindow: false });
  assert.equal(free, 0);
  assert.equal(paid, RATE_TABLE.IN.utility);
});

test('pricing: marketing always paid regardless of free window', () => {
  const inWindow = resolveCostPaise({ category: 'marketing', countryCode: 'IN', freeWindow: true });
  assert.equal(inWindow, RATE_TABLE.IN.marketing);
});

test('pricing: service category is always free (only allowed inside CSW)', () => {
  assert.equal(resolveCostPaise({ category: 'service', freeWindow: true }), 0);
  assert.equal(resolveCostPaise({ category: 'service', freeWindow: false }), 0);
});

test('dedupeKey: same args within a bucket produce the same hash', () => {
  const a = buildDedupeKey({
    businessId: 'b1', clientId: 'c1', intent: 'invoice', recipientPhone: '919', templateId: 't1', bucketSeconds: 60,
  });
  const b = buildDedupeKey({
    businessId: 'b1', clientId: 'c1', intent: 'invoice', recipientPhone: '919', templateId: 't1', bucketSeconds: 60,
  });
  assert.equal(a, b);
});

test('dedupeKey: campaign bucket overrides time bucket', () => {
  const c1 = buildDedupeKey({
    businessId: 'b1', clientId: 'c1', intent: 'marketing_campaign', recipientPhone: '919', templateId: 't1',
    campaignId: 'c-abc', bucketSeconds: 60,
  });
  const c2 = buildDedupeKey({
    businessId: 'b1', clientId: 'c1', intent: 'marketing_campaign', recipientPhone: '919', templateId: 't1',
    campaignId: 'c-abc', bucketSeconds: 60,
  });
  assert.equal(c1, c2);
  const c3 = buildDedupeKey({
    businessId: 'b1', clientId: 'c1', intent: 'marketing_campaign', recipientPhone: '919', templateId: 't1',
    campaignId: 'c-OTHER', bucketSeconds: 60,
  });
  assert.notEqual(c1, c3);
});

test('dedupeKey: explicit override wins', () => {
  const k = buildDedupeKey({
    businessId: 'b', clientId: 'c', intent: 'invoice', recipientPhone: '919',
    explicit: 'fixed-dedupe-123',
  });
  assert.equal(k, 'fixed-dedupe-123');
});

// Webhook signature verification — replicate the function locally to test it
// without booting Express.
function verifySignature(rawBuffer, headerSig, appSecret) {
  if (!headerSig || !appSecret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBuffer).digest('hex')}`;
  try {
    const a = Buffer.from(headerSig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

test('webhook signature: matches when computed from same secret + body', () => {
  const secret = 'shhh-app-secret';
  const body = Buffer.from(JSON.stringify({ a: 1 }));
  const sig = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifySignature(body, sig, secret), true);
});

test('webhook signature: mismatched secret rejected', () => {
  const body = Buffer.from('{}');
  const sig = `sha256=${crypto.createHmac('sha256', 'wrong').update(body).digest('hex')}`;
  assert.equal(verifySignature(body, sig, 'right'), false);
});

// Status priority rule from the webhook handler.
const STATUS_PRIORITY = { queued: 1, sent: 2, delivered: 3, read: 4, failed: 99 };
function shouldApply(current, incoming) {
  if (current === 'failed') return false;
  return (STATUS_PRIORITY[incoming] || 0) > (STATUS_PRIORITY[current] || 0);
}

test('status priority: read after delivered applies; delivered after read does not', () => {
  assert.equal(shouldApply('delivered', 'read'), true);
  assert.equal(shouldApply('read', 'delivered'), false);
});

test('status priority: failed is terminal — nothing else applies', () => {
  assert.equal(shouldApply('failed', 'delivered'), false);
  assert.equal(shouldApply('failed', 'read'), false);
});

test('status priority: read can arrive before delivered (out-of-order webhook)', () => {
  assert.equal(shouldApply('sent', 'read'), true);
  // and a later delivered should NOT downgrade
  assert.equal(shouldApply('read', 'delivered'), false);
});

// STOP / UNSUBSCRIBE detection used by the webhook
const STOP_WORDS = /^\s*(STOP|UNSUBSCRIBE|OPTOUT|OPT-OUT|OPT OUT)\b/i;

test('opt-out parser: STOP / UNSUBSCRIBE / OPTOUT matched, free text not matched', () => {
  assert.equal(STOP_WORDS.test('STOP'), true);
  assert.equal(STOP_WORDS.test('  unsubscribe please'), true);
  assert.equal(STOP_WORDS.test('OPT-OUT now'), true);
  assert.equal(STOP_WORDS.test('hi can you reschedule?'), false);
  assert.equal(STOP_WORDS.test('I want to stop by tomorrow'), false);
});
