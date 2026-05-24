const mongoose = require('mongoose');

const platformLeadSchema = new mongoose.Schema({
  /** Contact person name */
  name: {
    type: String,
    required: true,
    trim: true,
  },
  /** Prospective salon / business name */
  salonName: {
    type: String,
    trim: true,
    default: '',
  },
  city: {
    type: String,
    trim: true,
    default: '',
  },
  branchCount: {
    type: String,
    trim: true,
    default: '',
  },
  preferredDemoTime: {
    type: String,
    trim: true,
    default: '',
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
  },
  source: {
    type: String,
    enum: ['walk-in', 'phone', 'website', 'social', 'referral', 'other'],
    default: 'walk-in',
  },
  status: {
    type: String,
    enum: ['new', 'follow-up', 'converted', 'lost'],
    default: 'new',
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'others'],
  },
  /** Comma-separated or free-text interest (plans, modules, etc.) */
  interestedIn: {
    type: String,
    default: '',
  },
  assignedAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  followUpDate: {
    type: Date,
  },
  notes: {
    type: String,
    default: '',
  },
  convertedToBusinessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
  },
  convertedAt: {
    type: Date,
  },
  createdByAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
}, {
  timestamps: true,
});

platformLeadSchema.index({ status: 1, createdAt: -1 });
platformLeadSchema.index({ assignedAdminId: 1 });
platformLeadSchema.index({ followUpDate: 1 });
platformLeadSchema.index({ phone: 1 });

module.exports = {
  schema: platformLeadSchema,
  model: mongoose.model('PlatformLead', platformLeadSchema),
};
