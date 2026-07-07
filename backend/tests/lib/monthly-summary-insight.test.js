'use strict';

const { generateMonthlyInsight, momPercent, yoyPercent, growthBand } = require('../../lib/monthly-summary-insight');

describe('monthly-summary-insight', () => {
  test('generateMonthlyInsight celebrates goal hit', () => {
    const insight = generateMonthlyInsight({
      monthTotalRevenue: 550000,
      previousMonthTotalRevenue: 480000,
      monthlyRevenueGoal: 500000,
      monthName: 'June',
    });
    expect(insight.tone).toBe('positive');
    expect(insight.text).toMatch(/Goal crushed/i);
  });

  test('generateMonthlyInsight celebrates strong MoM growth', () => {
    const insight = generateMonthlyInsight({
      monthTotalRevenue: 120000,
      previousMonthTotalRevenue: 100000,
    });
    expect(insight.tone).toBe('positive');
    expect(insight.text).toMatch(/up 20%/);
  });

  test('generateMonthlyInsight flags dip', () => {
    const insight = generateMonthlyInsight({
      monthTotalRevenue: 80000,
      previousMonthTotalRevenue: 100000,
    });
    expect(insight.tone).toBe('warning');
    expect(insight.text).toMatch(/dipped/i);
  });

  test('momPercent handles zero previous month', () => {
    expect(momPercent(50000, 0)).toBe(100);
    expect(momPercent(0, 0)).toBe(0);
  });

  test('yoyPercent returns null without last year data', () => {
    expect(yoyPercent(100000, null)).toBeNull();
  });

  test('growthBand maps performance bands', () => {
    expect(growthBand(15).label).toBe('Strong growth');
    expect(growthBand(-15).label).toBe('Needs attention');
  });
});
