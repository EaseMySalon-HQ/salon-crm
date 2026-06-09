const mongoose = require('mongoose');

/** Pre-aggregated branch metrics (main DB) for branch-management overview cache. */
const dailyMetricSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    revenue: { type: Number, default: 0 },
    appointments: { type: Number, default: 0 },
    completedAppointments: { type: Number, default: 0 },
    avgRating: { type: Number, default: null },
    bookedMinutes: { type: Number, default: 0 },
    availableMinutes: { type: Number, default: 0 },
    capacityUtilizationPct: { type: Number, default: 0 },
  },
  { timestamps: true }
);

dailyMetricSchema.index({ branchId: 1, date: 1 }, { unique: true });

module.exports = {
  schema: dailyMetricSchema,
  model: mongoose.model('DailyMetric', dailyMetricSchema),
};
