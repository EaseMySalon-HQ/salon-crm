const mongoose = require('mongoose');

const packageAuditLogSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  package_id: {
    type: mongoose.Schema.Types.ObjectId
    // no ref — may reference a package that was archived
  },
  action: {
    type: String,
    required: true
    // e.g. PACKAGE_CREATED, PACKAGE_UPDATED, PACKAGE_ARCHIVED,
    //      PACKAGE_SOLD, EXPIRY_EXTENDED, REDEMPTION, REVERSAL
  },
  performed_by: {
    type: mongoose.Schema.Types.ObjectId
    // intentionally no ref — could be User or Staff
  },
  old_value: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  new_value: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  performed_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false   // performed_at is the canonical timestamp
});

packageAuditLogSchema.index({ branchId: 1, package_id: 1 });
packageAuditLogSchema.index({ branchId: 1, performed_at: -1 });

// ── Immutability enforcement ────────────────────────────────────────────────
// Audit logs must never be modified. Any update attempt throws immediately.
function blockUpdate() {
  throw new Error('PackageAuditLog is immutable — updates are not allowed');
}

packageAuditLogSchema.pre('findOneAndUpdate', blockUpdate);
packageAuditLogSchema.pre('updateOne', blockUpdate);
packageAuditLogSchema.pre('updateMany', blockUpdate);
packageAuditLogSchema.pre('replaceOne', blockUpdate);
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  schema: packageAuditLogSchema,
  model: mongoose.model('PackageAuditLog', packageAuditLogSchema)
};
