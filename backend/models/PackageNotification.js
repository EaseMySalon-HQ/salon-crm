const mongoose = require('mongoose');

const packageNotificationSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  client_package_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientPackage'
  },
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  type: {
    type: String,
    enum: ['EXPIRY_7D', 'EXPIRY_3D', 'EXPIRY_1D', 'LOW_BALANCE', 'EXPIRED']
  },
  channel: {
    type: String,
    enum: ['SMS', 'EMAIL', 'WHATSAPP']
  },
  status: {
    type: String,
    enum: ['SENT', 'FAILED', 'PENDING'],
    default: 'PENDING'
  },
  sent_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

packageNotificationSchema.index({ branchId: 1, client_package_id: 1 });
packageNotificationSchema.index({ branchId: 1, client_id: 1, type: 1 });
// Composite index to prevent duplicate notifications for same package+type+channel
packageNotificationSchema.index({ client_package_id: 1, type: 1, channel: 1 });

module.exports = {
  schema: packageNotificationSchema,
  model: mongoose.model('PackageNotification', packageNotificationSchema)
};
