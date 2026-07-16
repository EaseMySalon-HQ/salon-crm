'use strict';

const {
  buildAudienceClientQuery,
  matchesSegmentFilters,
  resolveLastVisitRange,
  hasPurchaseFilters,
  normalizeObjectIds,
} = require('../../lib/whatsapp-campaign-audience');
const mongoose = require('mongoose');

describe('whatsapp-campaign-audience', () => {
  test('buildAudienceClientQuery applies spend and gender filters', () => {
    const { filter } = buildAudienceClientQuery({
      audienceFilters: {
        totalSpentMin: 1000,
        totalSpentMax: 5000,
        genders: ['female', 'male'],
      },
    });
    expect(filter.totalSpent).toEqual({ $gte: 1000, $lte: 5000 });
    expect(filter.gender).toEqual({ $in: ['female', 'male'] });
  });

  test('resolveLastVisitRange maps presets', () => {
    const now = Date.now();
    const under30 = resolveLastVisitRange({ lastVisit: 'under_30' });
    expect(under30.$gte.getTime()).toBeGreaterThan(now - 31 * 86_400_000);
    expect(resolveLastVisitRange({ lastVisit: 'never' })).toBe('never');
  });

  test('hasPurchaseFilters detects service/product ids', () => {
    expect(hasPurchaseFilters({})).toBe(false);
    expect(hasPurchaseFilters({ serviceIds: ['abc'] })).toBe(true);
    expect(hasPurchaseFilters({ productIds: [] })).toBe(false);
  });

  test('normalizeObjectIds filters invalid ids', () => {
    const valid = new mongoose.Types.ObjectId().toString();
    const out = normalizeObjectIds([valid, 'not-an-id', '']);
    expect(out).toHaveLength(1);
  });

  test('matchesSegmentFilters respects VIP threshold', () => {
    const rules = {
      newMaxVisits: 2,
      vipSpendThreshold: 50_000,
      atRiskAfterDays: 45,
      winBackAfterDays: 90,
    };
    expect(
      matchesSegmentFilters({ totalVisits: 10, totalSpent: 60_000, lastVisit: new Date() }, ['vip'], rules)
    ).toBe(true);
    expect(
      matchesSegmentFilters({ totalVisits: 1, totalSpent: 100, lastVisit: new Date() }, ['vip'], rules)
    ).toBe(false);
  });
});
