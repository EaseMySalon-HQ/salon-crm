const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    lowercase: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    lowercase: true
  },
  dob: {
    type: Date
  },
  lastVisit: {
    type: Date
  },
  totalVisits: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  /** Denormalized cache; updated only with PointsLedger writes */
  rewardPointsBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  /**
   * WhatsApp marketing consent (single source of truth read by the WhatsApp
   * Business module). History is recorded in `ClientConsentEvent`.
   */
  whatsappConsent: {
    optedIn: { type: Boolean, default: true },
    source: {
      type: String,
      enum: [
        'booking',
        'checkout',
        'manual',
        'import',
        'staff',
        'inbound_message',
        'system',
        /**
         * `user_preferences` webhook — recipient toggled the WhatsApp-level
         * marketing opt-out from inside the WhatsApp client. Treated the same
         * as a STOP reply for compliance.
         */
        'user_preferences',
      ],
      default: null
    },
    optedInAt: { type: Date, default: null },
    optedOutAt: { type: Date, default: null },
    optInReason: { type: String, default: null },
    optOutReason: { type: String, default: null },
    lastInboundAt: { type: Date, default: null },
    lastOutboundAt: { type: Date, default: null },
    /**
     * Meta-level marketing opt-out (`user_preferences` webhook). Independent
     * from `optedIn` so we keep an audit trail of WA-platform-level state
     * even if local opt-in flips back on.
     */
    waMarketingOptOut: { type: Boolean, default: false },
    waMarketingOptOutAt: { type: Date, default: null }
  },
  /** System placeholder profile for anonymous walk-ins (see backend/lib/ensure-walk-in-client.js). */
  isWalkIn: {
    type: Boolean,
    default: false
  },
  /** Bulk campaigns, offers, and marketing broadcasts via WhatsApp. */
  promotionalWhatsappEnabled: { type: Boolean, default: true },
  /** Utility WhatsApp: confirmations, reminders, invoices, booking updates. */
  transactionalWhatsappEnabled: { type: Boolean, default: true },
  /** Utility SMS: confirmations, reminders, invoices, payment updates. */
  transactionalSmsEnabled: { type: Boolean, default: true },
}, {
  timestamps: true
});

clientSchema.index({ branchId: 1, status: 1 });
clientSchema.index({ branchId: 1, lastVisit: -1 });
clientSchema.index({ branchId: 1, createdAt: -1 });
clientSchema.index({ branchId: 1, name: 1 });
clientSchema.index({ branchId: 1, phone: 1 });
clientSchema.index({ branchId: 1, promotionalWhatsappEnabled: 1 });

// Export both schema and model for flexibility
module.exports = {
  schema: clientSchema,
  model: mongoose.model('Client', clientSchema)
}; 