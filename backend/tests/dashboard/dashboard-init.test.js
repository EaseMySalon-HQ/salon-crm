/**
 * Smoke test for dashboard init payload shape (mocked business models, no DB).
 */

const mongoose = require('mongoose');
const { buildDashboardInitPayload } = require('../../lib/dashboard-init');
const { getTodayIST, parseDateIST, toDateStringIST } = require('../../utils/date-utils');

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
        countDocuments: jest.fn().mockResolvedValue(8),
        aggregate: jest
          .fn()
          .mockResolvedValueOnce([{ _id: null, total: 500 }])
          .mockResolvedValueOnce([{ _id: 4, revenue: 300 }])
          .mockResolvedValue([]),
      },
      MembershipSubscription: {
        countDocuments: jest.fn().mockResolvedValue(2),
        aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 248 }]),
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

  it('includes future appointments in recentUpcoming for next7days', async () => {
    const tomorrowProbe = parseDateIST(getTodayIST());
    tomorrowProbe.setDate(tomorrowProbe.getDate() + 1);
    const tomorrowYmd = toDateStringIST(tomorrowProbe);
    const tomorrowAppointment = {
      _id: new mongoose.Types.ObjectId(),
      date: tomorrowYmd,
      time: '9:15 AM',
      status: 'scheduled',
      leadSource: 'Phone',
      price: 500,
      duration: 60,
      clientId: { _id: new mongoose.Types.ObjectId(), name: 'Jane', phone: '9999999999', email: '' },
      serviceId: { _id: new mongoose.Types.ObjectId(), name: 'Haircut', price: 500, duration: 60 },
      staffId: { _id: new mongoose.Types.ObjectId(), name: 'Alex' },
      staffAssignments: [],
    };

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
        find: jest.fn().mockImplementation((query) => {
          const isUpcoming =
            query &&
            query.date &&
            typeof query.date.$gte === 'string' &&
            !query.date.$lte;
          return chainable(isUpcoming ? [tomorrowAppointment] : []);
        }),
      },
      Receipt: {
        countDocuments: jest.fn().mockResolvedValue(8),
        aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 1200 }]),
      },
      Sale: {
        countDocuments: jest.fn().mockResolvedValue(8),
        aggregate: jest.fn().mockResolvedValueOnce([{ _id: null, total: 500 }]).mockResolvedValue([]),
      },
      MembershipSubscription: {
        countDocuments: jest.fn().mockResolvedValue(2),
        aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 248 }]),
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
      appointmentsRange: 'next7days',
    });

    expect(res.data.appointments.recentUpcoming).toHaveLength(1);
    expect(res.data.appointments.recentUpcoming[0]).toMatchObject({
      date: tomorrowYmd,
      time: '9:15 AM',
      clientId: { name: 'Jane' },
      serviceId: { name: 'Haircut' },
    });
  });
});
