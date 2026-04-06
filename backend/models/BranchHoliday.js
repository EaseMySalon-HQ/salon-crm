const mongoose = require('mongoose');

const branchHolidaySchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  date: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    default: '',
    trim: true
  }
}, {
  timestamps: true
});

branchHolidaySchema.index({ branchId: 1, date: 1 }, { unique: true });

module.exports = {
  schema: branchHolidaySchema,
  model: mongoose.model('BranchHoliday', branchHolidaySchema)
};
