'use strict';

function momPercent(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p <= 0) return c > 0 ? 100 : 0;
  return ((c - p) / p) * 100;
}

function yoyPercent(current, lastYear) {
  if (lastYear == null || lastYear === '') return null;
  return momPercent(current, lastYear);
}

/**
 * @param {object} data
 * @returns {{ text: string, tone: 'positive' | 'warning' | 'neutral' }}
 */
function generateMonthlyInsight(data) {
  const revenue = Number(data?.monthTotalRevenue) || 0;
  const prev = Number(data?.previousMonthTotalRevenue) || 0;
  const goal = Number(data?.monthlyRevenueGoal) || 0;
  const mom = momPercent(revenue, prev);

  if (goal > 0 && revenue >= goal) {
    const pct = Math.round((revenue / goal) * 100);
    return {
      text: `🎉 Goal crushed — ₹${revenue.toLocaleString('en-IN')} this month (${pct}% of target)!`,
      tone: 'positive',
    };
  }

  if (mom >= 15) {
    return {
      text: `🎉 Your best stretch — ₹${revenue.toLocaleString('en-IN')}, up ${Math.round(mom)}% from last month`,
      tone: 'positive',
    };
  }

  if (mom >= 5) {
    return {
      text: `📈 Solid month — ₹${revenue.toLocaleString('en-IN')}, up ${Math.round(mom)}% vs last month`,
      tone: 'positive',
    };
  }

  if (mom <= -10) {
    return {
      text: `This month dipped ${Math.abs(Math.round(mom))}% — here's the full breakdown`,
      tone: 'warning',
    };
  }

  return {
    text: `Here's your ${data?.monthName || 'monthly'} snapshot — revenue, VIPs, and what's next`,
    tone: 'neutral',
  };
}

function growthBand(pct) {
  const n = Number(pct) || 0;
  if (n >= 10) return { color: '#16a34a', label: 'Strong growth' };
  if (n >= 0) return { color: '#6366f1', label: 'Steady' };
  if (n >= -10) return { color: '#d97706', label: 'Slight dip' };
  return { color: '#dc2626', label: 'Needs attention' };
}

module.exports = {
  generateMonthlyInsight,
  momPercent,
  yoyPercent,
  growthBand,
};
