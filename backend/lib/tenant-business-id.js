'use strict';

const mongoose = require('mongoose');

/** Main DB models always reference Business rows by `_id`, never by human business `code`. */
const OID_HEX = /^[a-fA-F0-9]{24}$/;

/**
 * @param {unknown} raw
 * @param {import('mongoose').Connection} mainConnection
 * @returns {Promise<{ businessObjectId?: import('mongoose').Types.ObjectId, error?: string }>}
 */
async function resolveTenantBusinessObjectId(raw, mainConnection) {
  if (!mainConnection) {
    return { error: 'Missing main database connection' };
  }

  if (raw instanceof mongoose.Types.ObjectId) {
    return { businessObjectId: raw };
  }

  if (raw == null) {
    return { error: 'Missing business tenant id' };
  }

  const str = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (!str) {
    return { error: 'Missing business tenant id' };
  }

  if (OID_HEX.test(str)) {
    return { businessObjectId: new mongoose.Types.ObjectId(str) };
  }

  const Business = mainConnection.model('Business', require('../models/Business').schema);
  const business = await Business.findOne({ code: str }).select('_id').lean();
  if (business && business._id) {
    return { businessObjectId: business._id };
  }

  return {
    error: `Invalid tenant business id (${str}). Expected a 24-character id or registered business code.`,
  };
}

/**
 * @param {unknown} raw
 * @returns {import('mongoose').Types.ObjectId | null}
 */
function normalizeOptionalObjectId(raw) {
  if (raw == null) return null;
  if (raw instanceof mongoose.Types.ObjectId) return raw;

  const str = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (!OID_HEX.test(str)) return null;

  try {
    return new mongoose.Types.ObjectId(str);
  } catch (_) {
    return null;
  }
}

module.exports = {
  resolveTenantBusinessObjectId,
  normalizeOptionalObjectId,
};
