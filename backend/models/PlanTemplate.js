const mongoose = require('mongoose');

const planTemplateSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  monthlyPrice: {
    type: Number,
    default: null, // null means custom pricing
  },
  yearlyPrice: {
    type: Number,
    default: null,
  },
  features: [{
    type: String,
  }],
  limits: {
    locations: { type: Number, default: 1 },
    staff: { type: Number, default: Infinity },
    whatsappMessages: { type: Number, default: 0 },
    smsMessages: { type: Number, default: 0 },
  },
  support: {
    email: { type: Boolean, default: true },
    phone: { type: Boolean, default: false },
    priority: { type: Boolean, default: false },
    dedicatedManager: { type: Boolean, default: false },
    onSiteTraining: { type: Boolean, default: false },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isDefault: {
    type: Boolean,
    default: false, // Only one default plan
  },
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    notes: String,
  },
}, {
  timestamps: true,
});

// Ensure only one default plan
planTemplateSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    const PlanTemplate = this.constructor;
    await PlanTemplate.updateMany(
      { _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

module.exports = {
  schema: planTemplateSchema,
  model: mongoose.model('PlanTemplate', planTemplateSchema)
};

