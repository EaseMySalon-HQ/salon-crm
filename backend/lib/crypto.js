/**
 * AES-256-GCM symmetric encryption for sensitive secrets (e.g. WhatsApp Cloud API
 * access tokens). Keyed off `WHATSAPP_TOKEN_ENC_KEY` (32 raw bytes; supplied as
 * 64-char hex or base64). One IV per record; authentication tag stored.
 *
 * Format: `v1:<iv-hex>:<tag-hex>:<cipher-hex>`
 */

'use strict';

const crypto = require('crypto');

const FORMAT_VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;
const TAG_LEN = 16;

let cachedKey = null;

function loadKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.WHATSAPP_TOKEN_ENC_KEY;
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      'WHATSAPP_TOKEN_ENC_KEY env var is required for WhatsApp token encryption'
    );
  }
  let buf = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    buf = Buffer.from(raw.trim(), 'hex');
  } else {
    try {
      buf = Buffer.from(raw.trim(), 'base64');
    } catch {
      buf = null;
    }
  }
  if (!buf || buf.length !== KEY_LEN) {
    throw new Error(
      `WHATSAPP_TOKEN_ENC_KEY must decode to ${KEY_LEN} bytes (hex or base64). Got ${
        buf ? buf.length : 0
      }.`
    );
  }
  cachedKey = buf;
  return cachedKey;
}

/** Encrypt a UTF-8 string. Returns the cipher envelope. */
function encrypt(plain) {
  if (plain == null) return null;
  if (typeof plain !== 'string') {
    throw new TypeError('encrypt: plain must be a string');
  }
  const key = loadKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString('hex'),
    tag.toString('hex'),
    enc.toString('hex'),
  ].join(':');
}

/** Decrypt an envelope produced by `encrypt`. Throws on tamper. */
function decrypt(envelope) {
  if (envelope == null || envelope === '') return null;
  if (typeof envelope !== 'string') {
    throw new TypeError('decrypt: envelope must be a string');
  }
  const parts = envelope.split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error('decrypt: unsupported envelope format');
  }
  const [, ivHex, tagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error('decrypt: malformed envelope');
  }
  const key = loadKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

/** Lazily verify that the env key is loadable; useful at boot time. */
function assertKeyLoaded() {
  loadKey();
}

module.exports = { encrypt, decrypt, assertKeyLoaded, FORMAT_VERSION };
