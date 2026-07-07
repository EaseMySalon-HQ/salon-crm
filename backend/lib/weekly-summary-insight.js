'use strict';

/**
 * Rule-based hero insight for the weekly summary email.
 */

function wowPercent(weekTotalRevenue, previousWeekTotalRevenue) {
  const current = Number(weekTotalRevenue) || 0;
  const prev = Number(previousWeekTotalRevenue) || 0;
  if (prev <= 0) return current > 0 ? 100 : 0;
  return ((current - prev) / prev) * 100;
}

/**
 * @param {object} data
 * @returns {{ text: string, tone: 'positive' | 'warning' | 'neutral' }}
 */
function generateWeeklyInsight(data) {
  const weekTotalRevenue = Number(data?.weekTotalRevenue) || 0;
  const previousWeekTotalRevenue = Number(data?.previousWeekTotalRevenue) || 0;
  const weeklyRevenueGoal = Number(data?.weeklyRevenueGoal) || 0;
  const weeksSinceBest = Number(data?.weeksSinceBest) || 0;
  const wow = wowPercent(weekTotalRevenue, previousWeekTotalRevenue);
  const goalPct =
    weeklyRevenueGoal > 0 ? Math.round((weekTotalRevenue / weeklyRevenueGoal) * 100) : null;

  if (weeklyRevenueGoal > 0 && weekTotalRevenue >= weeklyRevenueGoal) {
    return {
      text: `🎯 You hit your weekly revenue goal — ${goalPct}% of target achieved!`,
      tone: 'positive',
    };
  }

  if (wow >= 15 && weeksSinceBest >= 4) {
    return {
      text: `📈 Revenue up ${Math.round(wow)}% vs last week — your best week in ${weeksSinceBest} weeks!`,
      tone: 'positive',
    };
  }

  if (wow >= 10) {
    return {
      text: `📈 Revenue up ${Math.round(wow)}% vs last week — strong momentum this week`,
      tone: 'positive',
    };
  }

  if (wow <= -10) {
    const drop = Math.abs(Math.round(wow));
    return {
      text: `This week was quieter — revenue down ${drop}% vs last week. Here's what changed`,
      tone: 'warning',
    };
  }

  if (goalPct != null && goalPct >= 85) {
    return {
      text: `Almost there — ${goalPct}% of your weekly goal. One strong day can close the gap`,
      tone: 'neutral',
    };
  }

  return {
    text: 'Here\'s your week at a glance — bills, bookings, and where revenue came from',
    tone: 'neutral',
  };
}

module.exports = {
  generateWeeklyInsight,
  wowPercent,
};
