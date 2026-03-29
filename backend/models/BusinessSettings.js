const mongoose = require("mongoose");

const businessSettingsSchema = new mongoose.Schema({
  // Basic Information
  name: { type: String, required: true, default: "Glamour Salon & Spa" },
  email: { type: String, required: true, default: "info@glamoursalon.com" },
  phone: { type: String, required: true, default: "(555) 123-4567" },
  website: { type: String, default: "www.glamoursalon.com" },
  description: { type: String, default: "Premium salon and spa services in the heart of the city" },
  
  // Address Information
  address: { type: String, required: true, default: "123 Beauty Street" },
  city: { type: String, required: true, default: "New York" },
  state: { type: String, required: true, default: "NY" },
  zipCode: { type: String, required: true, default: "10001" },
  
  // Receipt/Invoice Settings
  receiptPrefix: { type: String, default: "INV" },
  invoicePrefix: { type: String, default: "INV" },
  receiptNumber: { type: Number, default: 1 },
  autoIncrementReceipt: { type: Boolean, default: true },
  purchaseOrderNumber: { type: Number, default: 1 },
  
  // Payment Settings
  currency: { type: String, default: "INR" },
  taxRate: { type: Number, default: 8.25 },
  processingFee: { type: Number, default: 2.9 },
  enableCurrency: { type: Boolean, default: true },
  enableTax: { type: Boolean, default: true },
  enableProcessingFees: { type: Boolean, default: true },
  
  // Auto Reset Settings
  autoResetReceipt: { type: Boolean, default: false },
  resetFrequency: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  
  // Social Media
  socialMedia: { type: String, default: "@glamoursalon" },
  
  // Branding
  logo: { type: String, default: "" },
  
  // Tax Information
  gstNumber: { type: String, default: "" },
  taxType: { type: String, enum: ['single', 'gst', 'vat', 'sales'], default: 'gst' },
  cgstRate: { type: Number, default: 9 },
  sgstRate: { type: Number, default: 9 },
  igstRate: { type: Number, default: 18 },
  serviceTaxRate: { type: Number, default: 5 },
  /** GST % for membership plans sold on bills (Quick Sale); independent from service tax. */
  membershipTaxRate: { type: Number, default: 5 },
  /** GST % for packages sold on bills (Quick Sale); independent from service tax. */
  packageTaxRate: { type: Number, default: 5 },
  productTaxRate: { type: Number, default: 18 },
  essentialProductRate: { type: Number, default: 5 },
  intermediateProductRate: { type: Number, default: 12 },
  standardProductRate: { type: Number, default: 18 },
  luxuryProductRate: { type: Number, default: 28 },
  exemptProductRate: { type: Number, default: 0 },
  taxCategories: { type: Array, default: [] }, // Array of tax category objects
  priceInclusiveOfTax: { type: Boolean, default: true }, // true = price includes GST, false = GST added on top
  
  // Multi-tenant support
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Export both schema and model for flexibility
module.exports = {
  schema: businessSettingsSchema,
  model: mongoose.model("BusinessSettings", businessSettingsSchema)
};
