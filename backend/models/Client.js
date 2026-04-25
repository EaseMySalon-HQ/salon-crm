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
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
}, {
  timestamps: true
});

clientSchema.index({ branchId: 1, status: 1 });
clientSchema.index({ branchId: 1, lastVisit: -1 });
clientSchema.index({ branchId: 1, createdAt: -1 });
clientSchema.index({ branchId: 1, name: 1 });
clientSchema.index({ branchId: 1, phone: 1 });
// Email lookup within a branch (e.g. duplicate-check, client search by email)
clientSchema.index({ branchId: 1, email: 1 }, { sparse: true });

// Export both schema and model for flexibility
module.exports = {
  schema: clientSchema,
  model: mongoose.model('Client', clientSchema)
}; 