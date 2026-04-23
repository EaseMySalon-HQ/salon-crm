/**
 * Atomic counter used to mint sequential invoice numbers per fiscal year
 * (e.g. `WLT/2026-27` → 1, 2, 3 …).
 *
 * We rely on `findOneAndUpdate({ upsert: true, $inc: { seq: 1 } })` which
 * MongoDB serialises at the document level, so two concurrent recharges
 * can never receive the same `seq` for the same `key`.
 */

'use strict';

const mongoose = require('mongoose');

const invoiceCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    seq: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InvoiceCounter', invoiceCounterSchema);
