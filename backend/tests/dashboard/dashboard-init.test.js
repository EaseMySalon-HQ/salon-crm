/**
 * Smoke test for dashboard init payload shape (mocked business models, no DB).
 */

const mongoose = require('mongoose');
const { buildDashboardInitPayload } = require('../../lib/dashboard-init');

function chainable(result) {
  const q = {
    select() {
      return q;
    },
    populate() {
      return q;
    },
    sort() {
      return q;
    },
    limit() {
      return q;
    },
    lean: jest.fn().mockResolvedValue(result),
  };
  return q;
}

describe('buildDashboardInitPayload', () => {
  const branchId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success and expected top-level data keys', async () => {
    const businessModels = {
      BusinessSettings: {
        findOne: jest.fn().mockReturnValue(chainable({ name: 'Test Salon', currency: 'INR' })),
      },
      Client: { countDocuments: jest.fn().mockResolvedValue(10) },
      Service: {
        countDocuments: jest.fn().mockResolvedValue(5),
        aggregate: jest.fn().mockResolvedValue([
          { _id: null, totalServices: 5, averagePrice: 100, averageDuration: 45 },
        ]),
      },
      Product: {
        countDocuments: jest.fn().mockResolvedValue(3),
        aggregate: jest.fn().mockResolvedValue([
          {
            _id: null,
            totalProducts: 3,
            lowStockCount: 1,
            totalValue: 900,
            categoriesArr: ['A', 'B'],
          },
        ]),
      },
      Staff: { countDocuments: jest.fn().mockResolvedValue(4) },
      Appointment: {
        countDocuments: jest.fn().mockResolvedValue(20),
        aggregate: jest.fn().mockResolvedValue([{ _id: 4, count: 2 }]),
        find: jest.fn().mockReturnValue(chainable([])),
      },
      Receipt: {
        countDocuments: jest.fn().mockResolvedValue(8),
        aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 1200 }]),
      },
      Sale: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce([{ _id: null, total: 500 }])
          .mockResolvedValueOnce([{ _id: 4, revenue: 300 }]),
      },
      MembershipSubscription: {
        countDocuments: jest.fn().mockResolvedValue(2),
        find: jest.fn().mockReturnValue(
          chainable([{ planId: { price: 99 } }, { planId: { price: 149 } }])
        ),
      },
    };

    const user = { _id: new mongoose.Types.ObjectId(), email: 'a@b.com', role: 'admin', branchId };

    const res = await buildDashboardInitPayload({
      branchId,
      businessModels,
      user,
    });

    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({
      business: { name: 'Test Salon', currency: 'INR' },
      todayStats: expect.any(Object),
      membership: expect.any(Object),
      appointments: expect.objectContaining({
        today: expect.any(Array),
        recentUpcoming: expect.any(Array),
      }),
      chart: expect.any(Array),
      serviceAggregates: expect.any(Object),
      productAggregates: expect.any(Object),
      alerts: [],
      quickMetrics: {},
    });
    expect(res.data.chart.length).toBe(12);
    expect(res.data.user).toMatchObject({ email: 'a@b.com', role: 'admin' });
  });
});
