const mongoose = require('mongoose');

/**
 * Persists refresh-token jti for rotation / reuse detection.
 * TTL index removes expired rows; revoked rows kept briefly for audit (optional trim job).
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    subjectType: { type: String, enum: ['user', 'staff'], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    staffId: { type: mongoose.Schema.Types.ObjectId },
    branchId: { type: mongoose.Schema.Types.ObjectId },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 * 2 });

module.exports = {
  schema: refreshTokenSchema,
};
