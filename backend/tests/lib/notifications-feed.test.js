/**
 * Coverage for aggregated staff notification feed helpers.
 */

const mongoose = require('mongoose');
const { buildNotificationsFeed } = require('../../lib/notifications-feed');

function mockProductFind(docs) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn(async () => docs),
  };
  return jest.fn(() => chain);
}

function mockModels(lowStockDocs, membershipCount) {
  return {
    Product: { find: mockProductFind(lowStockDocs) },
    MembershipSubscription: { countDocuments: jest.fn(async () => membershipCount) },
  };
}

describe('notifications-feed', () => {
  const branchId = new mongoose.Types.ObjectId();

  it('returns no items when all counts are zero', async () => {
    const r = await buildNotificationsFeed({
      branchId,
      businessModels: mockModels([], 0),
    });
    expect(r.success).toBe(true);
    expect(r.data.items).toEqual([]);
  });

  it('adds one row per low-stock product plus membership aggregate', async () => {
    const pid1 = new mongoose.Types.ObjectId();
    const pid2 = new mongoose.Types.ObjectId();
    const lowDocs = [
      { _id: pid1, name: 'Alpha Cream', stock: 1, minimumStock: 5 },
      { _id: pid2, name: 'Beta Spray', stock: 0, minimumStock: 3 },
    ];
    const r = await buildNotificationsFeed({
      branchId,
      businessModels: mockModels(lowDocs, 1),
    });
    expect(r.data.items).toHaveLength(3);
    expect(r.data.items.map((x) => x.type)).toEqual([
      'low_stock',
      'low_stock',
      'membership_expiry',
    ]);
    expect(r.data.items[0].title).toBe('Alpha Cream');
    expect(r.data.items[0].body).toBe('1 in stock · minimum 5');
    expect(r.data.items[0].href).toBe('/settings?section=products');
    expect(r.data.items[0].id).toBe(`low-stock-product:${pid1}`);
    expect(r.data.items[0].fingerprint).toBe('stock:1:min:5');
    expect(r.data.items[1].title).toBe('Beta Spray');
    expect(r.data.items[1].fingerprint).toBe('stock:0:min:3');
    expect(r.data.items[2].href).toBe('/membership');
  });
});
