const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: [
      "Supplies",
      "Equipment", 
      "Utilities",
      "Marketing",
      "Rent",
      "Insurance",
      "Maintenance",
      "Professional Services",
      "Travel",
      "Other"
    ]
  },
  description: {
    type: String,
    required: true,
    maxlength: 200
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMode: {
    type: String,
    required: true,
    enum: [
      "Cash",
      "Card",
      "Bank Transfer",
      "UPI",
      "Cheque",
      "Petty Cash Wallet"
    ]
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    required: true,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  vendor: {
    type: String,
    default: ""
  },
  approvedBy: {
    type: String,
    default: ""
  },
  receipt: {
    type: String,
    default: ""
  },
  notes: {
    type: String,
    default: ""
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
}, {
  timestamps: true
});

// Index for better query performance
expenseSchema.index({ branchId: 1, date: -1 });
expenseSchema.index({ branchId: 1, status: 1, date: -1 });
expenseSchema.index({ branchId: 1, category: 1 });
expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ paymentMode: 1 });
expenseSchema.index({ status: 1 });
expenseSchema.index({ createdBy: 1 });

// Export both schema and model for flexibility
module.exports = {
  schema: expenseSchema,
  model: mongoose.model('Expense', expenseSchema)
};
