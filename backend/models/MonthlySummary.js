'use strict';

const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    services: { type: Number, default: 0 },
    products: { type: Number, default: 0 },
    packages: { type: Number, default: 0 },
    membership: { type: Number, default: 0 },
    prepaid: { type: Number, default: 0 },
  },
  { _id: false }
);

const monthlySummarySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    monthKey: { type: String, required: true },
    monthName: { type: String, default: '' },
    year: { type: Number, default: 0 },
    monthTotalRevenue: { type: Number, default: 0 },
    monthTotalBills: { type: Number, default: 0 },
    monthTotalAppointments: { type: Number, default: 0 },
    previousMonthTotalRevenue: { type: Number, default: 0 },
    sameMonthLastYearRevenue: { type: Number, default: null },
    revenueByCategory: categorySchema,
    monthlyRevenueGoal: { type: Number, default: 0 },
    topClients: [
      {
        name: { type: String, default: '' },
        totalSpend: { type: Number, default: 0 },
        visitCount: { type: Number, default: 0 },
      },
    ],
    newCustomersThisMonth: { type: Number, default: 0 },
    returningCustomers: { type: Number, default: 0 },
    churnedCustomers: { type: Number, default: 0 },
    expenseTotal: { type: Number, default: null },
    netProfit: { type: Number, default: null },
    cancelledBillsTotal: { type: Number, default: 0 },
    feedbackReceivedCount: { type: Number, default: 0 },
    consentFormReceivedCount: { type: Number, default: 0 },
    milestones: [
      {
        type: { type: String, default: '' },
        message: { type: String, default: '' },
      },
    ],
    last6MonthsRevenue: [
      {
        monthKey: { type: String, default: '' },
        label: { type: String, default: '' },
        revenue: { type: Number, default: 0 },
      },
    ],
    nextMonthForecast: { type: Number, default: 0 },
    fastestGrowingCategory: { type: String, default: '' },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'monthly_summaries' }
);

monthlySummarySchema.index({ branchId: 1, monthKey: 1 }, { unique: true });
monthlySummarySchema.index({ monthKey: 1 });

module.exports = { schema: monthlySummarySchema };
