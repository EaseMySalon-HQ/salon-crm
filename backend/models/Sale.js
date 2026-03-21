const mongoose = require('mongoose');

const staffContributionSchema = new mongoose.Schema({
  staffId: { type: String, required: true },
  staffName: { type: String, required: true },
  percentage: { type: Number, required: true, min: 0, max: 100 }, // Percentage of service performed by this staff
  amount: { type: Number, required: true, min: 0 } // Amount earned by this staff member
}, { _id: false });

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['service', 'product'], required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  total: { type: Number, required: true },
  discount: { type: Number, default: 0 }, // Line-level discount (percentage)
  // Product reference for inventory tracking
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, // For products only
  // Service reference for auto consumption (type === 'service')
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
  variantKey: { type: String, default: '' }, // e.g. 'short'|'medium'|'long' for variant-based rules
  autoConsumptionProcessedAt: { type: Date }, // Set when consumption run for this line; cleared on reversal
  // Legacy fields for backward compatibility
  staffId: { type: String, default: '' },
  staffName: { type: String, default: '' },
  // New multi-staff support
  staffContributions: [staffContributionSchema],
  // Membership audit fields
  isMembershipFree: { type: Boolean, default: false },
  membershipDiscountPercent: { type: Number, default: 0 },
  // HSN/SAC code for receipt display
  hsnSacCode: { type: String, default: '' },
  // Price per unit excluding GST (for receipt display)
  priceExcludingGST: { type: Number },
  // Applicable tax rate % (for receipt display)
  taxRate: { type: Number }
}, { _id: false });

const paymentHistorySchema = new mongoose.Schema({
  date: { type: Date, required: true, default: Date.now },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ['Cash', 'Card', 'Online'], required: true },
  notes: { type: String, default: '' },
  collectedBy: { type: String, default: '' }
}, { _id: false });

const saleSchema = new mongoose.Schema({
  billNo: { type: String, required: true, unique: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  customerName: { type: String, required: true },
  customerPhone: { type: String, default: '' },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  date: { type: Date, required: true },
  time: { type: String, default: '' },
  
  // Enhanced payment status system
  status: { 
    type: String, 
    enum: ['completed', 'partial', 'unpaid', 'cancelled', 'pending', 'overdue', 'Completed', 'Partial', 'Unpaid', 'Cancelled', 'Pending', 'Overdue'], 
    default: 'unpaid' 
  },
  
  // Payment tracking
  paymentStatus: {
    totalAmount: { type: Number, required: true },      // Total bill amount
    paidAmount: { type: Number, default: 0 },          // Amount collected so far
    remainingAmount: { type: Number, default: 0 },     // Still owed
    dueDate: { type: Date, default: Date.now },        // When payment is due
    lastPaymentDate: { type: Date },                   // When last payment was made
    isOverdue: { type: Boolean, default: false }       // Payment overdue flag
  },
  
  // Support for split payments (legacy and enhanced)
  paymentMode: { type: String, default: '' }, // Can be "Cash", "Card", "Online", or "Cash, Card", etc.
  payments: [{
    mode: { type: String, enum: ['Cash', 'Card', 'Online'], required: true },
    amount: { type: Number, required: true, min: 0 }
  }],
  
  // Payment history for tracking all payments made
  paymentHistory: [paymentHistorySchema],
  
  // Bill details
  netTotal: { type: Number, required: true },
  taxAmount: { type: Number, required: true },
  grossTotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  tip: { type: Number, default: 0, min: 0 },
  tipStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
  tipStaffName: { type: String, default: '' },

  staffName: { type: String, required: true },
  items: [itemSchema],
  
  // Additional fields
  notes: { type: String, default: '' },
  customerAddress: { type: String, default: '' },
  // Track if bill has been edited
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date },
  customerEmail: { type: String, default: '' },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  // Share token for public receipt access
  shareToken: { 
    type: String, 
    unique: true,
    sparse: true // Allows null values but enforces uniqueness when present
  },
  // Assign membership on checkout (Quick Sale flow)
  planToAssignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan', default: null },
  membershipPlanPrice: { type: Number, default: 0 },
  // Tax breakdown for receipt display (serviceRate, serviceTax, productTaxByRate)
  taxBreakdown: {
    serviceTax: { type: Number, default: 0 },
    serviceRate: { type: Number, default: 5 },
    productTaxByRate: { type: mongoose.Schema.Types.Mixed, default: {} }
  }
}, {
  timestamps: true
});

// Pre-save middleware to handle payment status calculations
saleSchema.pre('save', function(next) {
  // Calculate remaining amount
  this.paymentStatus.remainingAmount = this.paymentStatus.totalAmount - this.paymentStatus.paidAmount;
  
  // Update status based on payment amount
  if (this.paymentStatus.paidAmount >= this.paymentStatus.totalAmount) {
    this.status = 'completed';
  } else if (this.paymentStatus.paidAmount > 0) {
    this.status = 'partial';
  } else {
    this.status = 'unpaid';
  }
  
  // Note: We removed the overdue status check since we're simplifying to just Completed/Partial/Unpaid
  // Overdue logic can be handled in the frontend by comparing dueDate with current date
  
  // If payments array is provided and has multiple payment types, update paymentMode
  if (this.payments && this.payments.length > 0) {
    const uniqueModes = [...new Set(this.payments.map(p => p.mode))]
    if (uniqueModes.length > 1) {
      this.paymentMode = uniqueModes.join(', ')
    } else if (uniqueModes.length === 1) {
      this.paymentMode = uniqueModes[0]
    }
  }
  
  // Generate shareToken if it doesn't exist (for public receipt access)
  if (!this.shareToken) {
    const crypto = require('crypto');
    this.shareToken = crypto.randomBytes(32).toString('hex');
  }
  
  next()
});

// Method to add a payment
saleSchema.methods.addPayment = function(paymentData) {
  this.paymentHistory.push(paymentData);
  this.paymentStatus.paidAmount += paymentData.amount;
  this.paymentStatus.lastPaymentDate = new Date();
  
  // Also update the payments array for consistency with frontend display
  this.payments.push({
    mode: paymentData.method,
    amount: paymentData.amount
  });
  
  // Let the pre-save middleware handle status updates
  // This prevents conflicts and ensures consistent status logic
  
  return this.save();
};

// Method to calculate payment summary
saleSchema.methods.getPaymentSummary = function() {
  return {
    totalAmount: this.paymentStatus.totalAmount,
    paidAmount: this.paymentStatus.paidAmount,
    remainingAmount: this.paymentStatus.remainingAmount,
    status: this.status,
    isOverdue: this.paymentStatus.isOverdue,
    dueDate: this.paymentStatus.dueDate
  };
};

// Method to calculate staff contributions for a service item (tax-exclusive amounts)
saleSchema.methods.calculateStaffContributions = function(itemIndex) {
  const item = this.items[itemIndex];
  if (!item || !item.staffContributions || item.staffContributions.length === 0) {
    return [];
  }
  const { getItemPreTaxTotal } = require('../lib/sale-item-pretax');
  const linePreTax = getItemPreTaxTotal(item);
  return item.staffContributions.map(contribution => ({
    ...contribution,
    amount: (linePreTax * contribution.percentage) / 100
  }));
};

// Method to get all staff members involved in a sale
saleSchema.methods.getAllStaffInvolved = function() {
  const staffSet = new Set();
  
  this.items.forEach(item => {
    if (item.staffContributions && item.staffContributions.length > 0) {
      item.staffContributions.forEach(contribution => {
        staffSet.add(contribution.staffId);
      });
    } else if (item.staffId) {
      // Legacy support
      staffSet.add(item.staffId);
    }
  });
  
  return Array.from(staffSet);
};

// Indexes: branch-scoped lists, status filters, lookups by phone / appointment / token
saleSchema.index({ branchId: 1, date: -1 });
saleSchema.index({ branchId: 1, status: 1, date: -1 });
saleSchema.index({ branchId: 1, createdAt: -1 });
saleSchema.index({ status: 1 });
saleSchema.index({ customerPhone: 1, branchId: 1 });
saleSchema.index({ customerId: 1, branchId: 1 });
saleSchema.index({ appointmentId: 1 });
// shareToken: unique+sparse in schema already creates an index

// Export both schema and model for flexibility
module.exports = {
  schema: saleSchema,
  model: mongoose.model('Sale', saleSchema)
};