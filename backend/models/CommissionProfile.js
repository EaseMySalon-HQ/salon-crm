const mongoose = require('mongoose');

const targetTierSchema = new mongoose.Schema({
  from: { type: Number, required: true, min: 0 },
  to: { type: Number, required: true, min: 0 },
  calculateBy: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  value: { type: Number, required: true, min: 0 }
}, { _id: false });

const itemRateSchema = new mongoose.Schema({
  itemType: { type: String },
  rate: { type: Number },
  calculateBy: { type: String, enum: ['percent', 'fixed'], default: 'percent' }
}, { _id: false });

const serviceRuleSchema = new mongoose.Schema({
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  calculateBy: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  value: { type: Number, required: true, min: 0 }
}, { _id: false });

const commissionProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['target_based', 'item_based', 'service_based'], default: 'target_based' },
  description: { type: String, default: '' },
  calculationInterval: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'monthly' },
  qualifyingItems: [{ type: String }],
  includeTax: { type: Boolean, default: false },
  cascadingCommission: { type: Boolean, default: false },
  targetTiers: { type: [targetTierSchema], default: [] },
  itemRates: { type: [itemRateSchema], default: [] },
  serviceRules: { type: [serviceRuleSchema], default: [] },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

commissionProfileSchema.virtual('id').get(function () {
  return this._id.toString();
});

commissionProfileSchema.set('toJSON', {
  virtuals: true,
  versionKey: false
});

commissionProfileSchema.set('toObject', {
  virtuals: true,
  versionKey: false
});

module.exports = {
  schema: commissionProfileSchema,
  model: mongoose.model('CommissionProfile', commissionProfileSchema)
};

