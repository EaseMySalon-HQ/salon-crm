'use strict';

const mongoose = require('mongoose');

const dailyRevenueSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    dayLabel: { type: String, default: '' },
    netRevenue: { type: Number, default: 0 },
    bills: { type: Number, default: 0 },
  },
  { _id: false }
);

const weeklySummarySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    weekStartDate: { type: String, required: true },
    weekEndDate: { type: String, required: true },
    weekTotalRevenue: { type: Number, default: 0 },
    weekTotalBills: { type: Number, default: 0 },
    weekTotalAppointments: { type: Number, default: 0 },
    previousWeekTotalRevenue: { type: Number, default: 0 },
    dailyRevenue: [dailyRevenueSchema],
    bestDay: {
      date: { type: String, default: '' },
      dayLabel: { type: String, default: '' },
      revenue: { type: Number, default: 0 },
    },
    slowestDay: {
      date: { type: String, default: '' },
      dayLabel: { type: String, default: '' },
      revenue: { type: Number, default: 0 },
    },
    topServices: [
      {
        name: { type: String, default: '' },
        revenue: { type: Number, default: 0 },
        count: { type: Number, default: 0 },
      },
    ],
    newCustomers: { type: Number, default: 0 },
    returningCustomers: { type: Number, default: 0 },
    appointmentFunnel: {
      booked: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
      noShow: { type: Number, default: 0 },
    },
    staffLeaderboard: [
      {
        name: { type: String, default: '' },
        billsHandled: { type: Number, default: 0 },
        revenueGenerated: { type: Number, default: 0 },
      },
    ],
    weeklyRevenueGoal: { type: Number, default: 0 },
    weeksSinceBest: { type: Number, default: 0 },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'weekly_summaries' }
);

weeklySummarySchema.index({ branchId: 1, weekStartDate: 1 }, { unique: true });

module.exports = { schema: weeklySummarySchema };
