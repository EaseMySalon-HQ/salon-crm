'use strict';

/**
 * Auto-generate the hero insight one-liner for the daily summary email.
 * Pure function — unit-testable, not tied to the HTML template.
 *
 * @param {object} data
 * @param {number} data.todayNetRevenue
 * @param {number} data.last7DayAvgRevenue
 * @param {number} data.todayAppointments
 * @param {number} data.todayBills
 * @returns {{ text: string, tone: 'positive' | 'warning' | 'neutral' }}
 */
function generateInsight(data) {
  const todayNetRevenue = Number(data?.todayNetRevenue) || 0;
  const last7DayAvgRevenue = Number(data?.last7DayAvgRevenue) || 0;
  const todayAppointments = Number(data?.todayAppointments) || 0;
  const todayBills = Number(data?.todayBills) || 0;

  if (last7DayAvgRevenue > 0 && todayNetRevenue > last7DayAvgRevenue * 1.15) {
    return { text: '🔥 Best day this week!', tone: 'positive' };
  }

  if (last7DayAvgRevenue > 0 && todayNetRevenue < last7DayAvgRevenue * 0.7) {
    const pct = Math.round((1 - todayNetRevenue / last7DayAvgRevenue) * 100);
    return {
      text: `📉 Slower day — ${pct}% below your weekly average`,
      tone: 'warning',
    };
  }

  if (todayBills > 0 && todayAppointments > todayBills * 1.3) {
    const gap = Math.max(0, Math.round(todayAppointments - todayBills));
    return {
      text: `⚠️ ${gap} appointments didn't convert to bills — check no-shows`,
      tone: 'warning',
    };
  }

  return {
    text: '✅ Steady day, in line with your weekly average',
    tone: 'neutral',
  };
}

/**
 * Revenue delta vs yesterday as a signed percentage (null when yesterday was 0).
 */
function revenueDeltaPercent(todayNetRevenue, yesterdayNetRevenue) {
  const today = Number(todayNetRevenue) || 0;
  const yesterday = Number(yesterdayNetRevenue) || 0;
  if (yesterday <= 0) return today > 0 ? 100 : 0;
  return ((today - yesterday) / yesterday) * 100;
}

module.exports = {
  generateInsight,
  revenueDeltaPercent,
};
