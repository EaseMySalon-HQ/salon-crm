/**
 * Weekly GMB health score snapshots (tenant DB).
 */

'use strict';

const mongoose = require('mongoose');

const gmbHealthSnapshotSchema = new mongoose.Schema(
  {
    locationId: { type: String, required: true, index: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    components: {
      profileCompleteness: { type: Number, default: 0 },
      recentPostActivity: { type: Number, default: 0 },
      reviewResponseRate: { type: Number, default: 0 },
      photoRecency: { type: Number, default: 0 },
      serviceListCompleteness: { type: Number, default: 0 },
      qaAnswered: { type: Number, default: 0 },
    },
    snapshotDate: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = {
  schema: gmbHealthSnapshotSchema,
  model: mongoose.models.GmbHealthSnapshot || mongoose.model('GmbHealthSnapshot', gmbHealthSnapshotSchema),
};
