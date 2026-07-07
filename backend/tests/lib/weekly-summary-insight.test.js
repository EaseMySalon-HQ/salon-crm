'use strict';

const { generateWeeklyInsight, wowPercent } = require('../../lib/weekly-summary-insight');

describe('weekly-summary-insight', () => {
  test('generateWeeklyInsight celebrates strong WoW growth', () => {
    const insight = generateWeeklyInsight({
      weekTotalRevenue: 120000,
      previousWeekTotalRevenue: 100000,
      weeksSinceBest: 6,
    });
    expect(insight.tone).toBe('positive');
    expect(insight.text).toMatch(/up 20%/);
  });

  test('generateWeeklyInsight flags quieter week', () => {
    const insight = generateWeeklyInsight({
      weekTotalRevenue: 80000,
      previousWeekTotalRevenue: 100000,
    });
    expect(insight.tone).toBe('warning');
    expect(insight.text).toMatch(/quieter/i);
  });

  test('generateWeeklyInsight celebrates goal hit', () => {
    const insight = generateWeeklyInsight({
      weekTotalRevenue: 110000,
      previousWeekTotalRevenue: 100000,
      weeklyRevenueGoal: 100000,
    });
    expect(insight.text).toMatch(/hit your weekly revenue goal/i);
  });

  test('wowPercent handles zero previous week', () => {
    expect(wowPercent(50000, 0)).toBe(100);
    expect(wowPercent(0, 0)).toBe(0);
  });
});
