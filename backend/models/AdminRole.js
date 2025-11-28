const mongoose = require('mongoose');

const adminRoleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  key: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  color: { type: String, default: 'gray' },
  isSystem: { type: Boolean, default: false },
  permissions: [{
    module: { type: String, required: true },
    actions: [{ type: String, required: true }]
  }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, {
  timestamps: true
});

adminRoleSchema.index({ key: 1 }, { unique: true });

module.exports = {
  schema: adminRoleSchema,
  model: mongoose.models.AdminRole || mongoose.model('AdminRole', adminRoleSchema)
};

