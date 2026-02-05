const mongoose = require('mongoose');

const blockTimeSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  startDate: {
    type: String,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  recurringFrequency: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none'
  },
  endDate: {
    type: String,
    default: null
  },
  description: {
    type: String,
    default: '',
    maxlength: 200
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
}, { timestamps: true });

blockTimeSchema.index({ staffId: 1, startDate: 1 });
blockTimeSchema.index({ branchId: 1, startDate: 1 });

module.exports = {
  schema: blockTimeSchema
};
