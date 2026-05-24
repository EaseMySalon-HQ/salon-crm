/**
 * Append-only audit trail of WhatsApp / SMS / email consent changes per client.
 * Lives on the tenant database alongside Client.
 */

'use strict';

const mongoose = require('mongoose');

const clientConsentEventSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: ['whatsapp', 'sms', 'email'],
      required: true,
      default: 'whatsapp',
    },
    event: {
      type: String,
      enum: ['opt_in', 'opt_out'],
      required: true,
    },
    source: {
      type: String,
      enum: ['booking', 'checkout', 'manual', 'import', 'staff', 'inbound_message', 'system'],
      default: 'manual',
    },
    actorType: {
      type: String,
      enum: ['user', 'admin', 'system', 'webhook', 'staff'],
      default: 'staff',
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

clientConsentEventSchema.index({ clientId: 1, createdAt: -1 });
clientConsentEventSchema.index({ branchId: 1, channel: 1, createdAt: -1 });

clientConsentEventSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate'],
  function block(next) {
    return next(new Error('ClientConsentEvent is append-only'));
  }
);
clientConsentEventSchema.pre(
  ['deleteOne', 'deleteMany', 'findOneAndDelete'],
  function block(next) {
    return next(new Error('ClientConsentEvent is append-only'));
  }
);

module.exports = {
  schema: clientConsentEventSchema,
  model:
    mongoose.models.ClientConsentEvent ||
    mongoose.model('ClientConsentEvent', clientConsentEventSchema),
};
