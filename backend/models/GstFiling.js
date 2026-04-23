/**
 * One row per GST return filing period (e.g. "2026-03").
 *
 * Writing a row:
 *   - locks every Invoice in that filingPeriod (status → 'filed')
 *   - stores a point-in-time snapshot of counts + totals so the dashboard
 *     can show historical filings without re-aggregating Invoice rows.
 *
 * Reopen / edit of a filing is guarded — intended for rare admin hot-fixes.
 */

'use strict';

const mongoose = require('mongoose');

const gstFilingSchema = new mongoose.Schema(
  {
    period: {
      type: String, // "YYYY-MM"
      required: true,
      unique: true,
      index: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    fiscalYear: { type: String, default: '' }, // e.g. "2025-26"
    filedAt: { type: Date, default: Date.now },
    filedBy: { type: String, default: '' }, // admin email/username
    reopenedAt: { type: Date, default: null },
    reopenedBy: { type: String, default: null },

    counts: {
      total: { type: Number, default: 0 },
      b2b: { type: Number, default: 0 },
      b2c: { type: Number, default: 0 },
    },
    totals: {
      taxablePaise: { type: Number, default: 0 },
      cgstPaise: { type: Number, default: 0 },
      sgstPaise: { type: Number, default: 0 },
      igstPaise: { type: Number, default: 0 },
      totalTaxPaise: { type: Number, default: 0 },
      grandTotalPaise: { type: Number, default: 0 },
    },

    snapshotPath: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GstFiling', gstFilingSchema);
