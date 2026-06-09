const mongoose = require('mongoose');
const { DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES } = require('../lib/public-pricing-matrix-defaults');

const matrixRowSchema = new mongoose.Schema(
  {
    feature: { type: String, required: true, trim: true },
    hint: { type: String, default: '', trim: true },
    starter: { type: String, required: true, trim: true },
    growth: { type: String, required: true, trim: true },
    pro: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const matrixCategorySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    rows: { type: [matrixRowSchema], default: [] },
  },
  { _id: false }
);

const publicPricingMatrixSchema = new mongoose.Schema(
  {
    categories: { type: [matrixCategorySchema], default: [] },
    updatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

publicPricingMatrixSchema.statics.getMatrixDocument = async function getMatrixDocument() {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({
      categories: DEFAULT_PUBLIC_PRICING_MATRIX_CATEGORIES,
    });
  }
  return doc;
};

module.exports = {
  schema: publicPricingMatrixSchema,
  model: mongoose.model('PublicPricingMatrix', publicPricingMatrixSchema),
};
