const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: {
    type: String,
    default: 'admin'
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminRole'
  },
  permissions: [{
    module: { type: String, required: true }, // 'businesses', 'users', 'billing', 'settings'
    actions: [{ type: String }] // ['create', 'read', 'update', 'delete']
  }],
  // Mixed: `remove` is reserved by Mongoose; legacy docs used { remove: [...] } — normalized on read/save.
  permissionOverrides: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ add: [], revoke: [] })
  },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

adminSchema.pre('save', function migratePermissionOverrides(next) {
  const po = this.permissionOverrides;
  if (!po || typeof po !== 'object') return next();
  if (Array.isArray(po.remove) && (!Array.isArray(po.revoke) || po.revoke.length === 0)) {
    po.revoke = po.remove;
  }
  if ('remove' in po) {
    delete po.remove;
  }
  next();
});

// Virtual for full name
adminSchema.virtual('name').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtuals are serialized
adminSchema.set('toJSON', { virtuals: true });

// Export both schema and model for flexibility
module.exports = {
  schema: adminSchema,
  model: mongoose.model('Admin', adminSchema)
};
