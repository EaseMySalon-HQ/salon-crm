const mongoose = require('mongoose');

const cashRegistrySchema = new mongoose.Schema({
  date: { 
    type: Date, 
    required: true,
    index: true 
  },
  shiftType: { 
    type: String, 
    enum: ['opening', 'closing'], 
    required: true 
  },
  createdBy: { 
    type: String, 
    required: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Opening/Closing Balance
  openingBalance: { 
    type: Number, 
    default: 0 
  },
  closingBalance: { 
    type: Number, 
    default: 0 
  },
  
  // Cash Denominations
  denominations: [{
    value: { type: Number, required: true },
    count: { type: Number, required: true },
    total: { type: Number, required: true }
  }],
  closingDenominations: [{
    value: { type: Number, required: true },
    count: { type: Number, required: true },
    total: { type: Number, required: true }
  }],
  
  // Cash Flow
  cashCollected: { 
    type: Number, 
    default: 0 
  },
  expenseValue: { 
    type: Number, 
    default: 0 
  },
  cashBalance: { 
    type: Number, 
    default: 0 
  },
  
  // Petty Cash (separate from main cash - not treated as cash)
  pettyCashOpeningBalance: { type: Number, default: 0 },
  pettyCashClosingBalance: { type: Number, default: 0 },
  
  // Balance Differences
  balanceDifference: { 
    type: Number, 
    default: 0 
  },
  balanceDifferenceReason: { 
    type: String, 
    default: '' 
  },
  balanceDifferenceNote: { 
    type: String, 
    default: '' 
  },
  balanceDifferenceUpdatedAt: { type: Date },
  balanceDifferenceUpdatedBy: { type: String, default: '' },
  
  // Online vs POS Cash
  onlineCash: { 
    type: Number, 
    default: 0 
  },
  posCash: { 
    type: Number, 
    default: 0 
  },
  onlinePosDifference: { 
    type: Number, 
    default: 0 
  },
  onlineCashDifferenceReason: { 
    type: String, 
    default: '' 
  },
  onlineCashDifferenceNote: { type: String, default: '' },
  onlineCashDifferenceUpdatedAt: { type: Date },
  onlineCashDifferenceUpdatedBy: { type: String, default: '' },
  
  // Verification
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  verifiedBy: { 
    type: String, 
    default: '' 
  },
  verifiedAt: { 
    type: Date 
  },
  verificationNotes: { 
    type: String, 
    default: '' 
  },
  
  // Additional Info
  notes: { 
    type: String, 
    default: '' 
  },
  status: { 
    type: String, 
    enum: ['active', 'closed', 'verified'], 
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

// Index for efficient queries
cashRegistrySchema.index({ date: 1, shiftType: 1 });
cashRegistrySchema.index({ createdBy: 1 });
cashRegistrySchema.index({ status: 1 });

// Export both schema and model for flexibility
module.exports = {
  schema: cashRegistrySchema,
  model: mongoose.model('CashRegistry', cashRegistrySchema)
};
