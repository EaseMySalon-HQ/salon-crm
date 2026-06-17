/**
 * Signed OAuth state for GMB connect callback.
 */

'use strict';

const crypto = require('crypto');

const STATE_TTL_MS = 15 * 60 * 1000;

function getStateSecret() {
  return (
    process.env.GMB_OAUTH_STATE_SECRET ||
    process.env.JWT_SECRET ||
    process.env.WHATSAPP_TOKEN_ENC_KEY ||
    'gmb-oauth-dev-secret'
  );
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getStateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state) {
  if (!state || typeof state !== 'string') return { ok: false, error: 'Missing state' };
  const parts = state.split('.');
  if (parts.length !== 2) return { ok: false, error: 'Invalid state format' };
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', getStateSecret()).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, error: 'Invalid state signature' };
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'Invalid state payload' };
  }
  if (!parsed.ts || Date.now() - parsed.ts > STATE_TTL_MS) {
    return { ok: false, error: 'State expired' };
  }
  return { ok: true, payload: parsed };
}

module.exports = { signState, verifyState };
