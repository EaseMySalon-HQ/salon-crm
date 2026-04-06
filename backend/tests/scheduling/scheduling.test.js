/**
 * Integration tests: scheduling services (MongoMemoryServer replica set for transactions).
 */
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const modelFactory = require('../../models/model-factory');
const bookingService = require('../../services/scheduling/booking-service');
const packageSessionSvc = require('../../services/scheduling/package-session-service');

let replSet;
let models;
let branchId;
let businessDoc;

function oid() {
  return new mongoose.Types.ObjectId();
}

async function seedBranchFixtures() {
  branchId = oid();
  const client = await models.Client.create({
    name: 'Test Client',
    phone: `+1555${Date.now().toString().slice(-7)}`,
    branchId
  });
  const staff = await models.Staff.create({
    name: 'Stylist',
    email: `stylist${Date.now()}@test.com`,
    phone: '+15550000001',
    role: 'staff',
    branchId,
    allowAppointmentScheduling: true
  });
  const service = await models.Service.create({
    name: 'Cut',
    category: 'hair',
    duration: 60,
    price: 500,
    branchId
  });
  const pkg = await models.Package.create({
    branchId,
    name: 'Course',
    type: 'FIXED',
    total_price: 1000,
    total_sittings: 3
  });
  return { client, staff, service, pkg };
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  models = modelFactory.createBusinessModels(mongoose.connection);
  businessDoc = {
    settings: {
      operatingHours: {
        monday: { open: '07:00', close: '22:00', closed: false },
        tuesday: { open: '07:00', close: '22:00', closed: false },
        wednesday: { open: '07:00', close: '22:00', closed: false },
        thursday: { open: '07:00', close: '22:00', closed: false },
        friday: { open: '07:00', close: '22:00', closed: false },
        saturday: { open: '07:00', close: '22:00', closed: false },
        sunday: { open: '07:00', close: '22:00', closed: false }
      }
    }
  };
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  const cols = await mongoose.connection.db.listCollections().toArray();
  for (const c of cols) {
    await mongoose.connection.db.collection(c.name).deleteMany({});
  }
});

describe('scheduling', () => {
  test('partial reschedule: scope this leaves sibling unchanged', async () => {
    const { client, staff, service } = await seedBranchFixtures();
    const t0 = new Date('2026-06-01T10:00:00.000Z');
    const t1 = new Date('2026-06-02T10:00:00.000Z');
    const { booking, appointmentIds } = await bookingService.createBooking(
      models,
      businessDoc,
      {
        branchId,
        clientId: client._id,
        type: 'multi_day',
        units: [
          {
            serviceId: service._id,
            staffId: staff._id,
            startAt: t0.toISOString(),
            endAt: new Date(t0.getTime() + 60 * 60 * 1000).toISOString(),
            price: 500
          },
          {
            serviceId: service._id,
            staffId: staff._id,
            startAt: t1.toISOString(),
            endAt: new Date(t1.getTime() + 60 * 60 * 1000).toISOString(),
            price: 500
          }
        ]
      },
      { skipAvailability: true }
    );
    expect(appointmentIds.length).toBe(2);
    const a0 = await models.Appointment.findById(appointmentIds[0]);
    const a1 = await models.Appointment.findById(appointmentIds[1]);
    const old1Start = new Date(a1.startAt).getTime();

    const newStart = new Date('2026-06-01T12:00:00.000Z');
    const newEnd = new Date('2026-06-01T13:00:00.000Z');
    await bookingService.rescheduleAppointment(
      models,
      businessDoc,
      a0._id,
      {
        scope: 'this',
        startAt: newStart.toISOString(),
        endAt: newEnd.toISOString(),
        skipAvailability: true
      }
    );

    const a0b = await models.Appointment.findById(appointmentIds[0]);
    const a1b = await models.Appointment.findById(appointmentIds[1]);
    expect(new Date(a0b.startAt).getTime()).toBe(newStart.getTime());
    expect(new Date(a1b.startAt).getTime()).toBe(old1Start);
    expect(String(a0b.parentBookingId)).toBe(String(booking._id));
  });

  test('staff conflict: second overlapping booking fails', async () => {
    const { client, staff, service } = await seedBranchFixtures();
    const start = new Date('2026-07-01T09:00:00.000Z');
    const end = new Date('2026-07-01T10:00:00.000Z');
    await bookingService.createBooking(
      models,
      businessDoc,
      {
        branchId,
        clientId: client._id,
        type: 'single',
        units: [
          {
            serviceId: service._id,
            staffId: staff._id,
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            price: 500
          }
        ]
      },
      { skipAvailability: true }
    );
    await expect(
      bookingService.createBooking(
        models,
        businessDoc,
        {
          branchId,
          clientId: client._id,
          type: 'single',
          units: [
            {
              serviceId: service._id,
              staffId: staff._id,
              startAt: start.toISOString(),
              endAt: end.toISOString(),
              price: 500
            }
          ]
        },
        { skipAvailability: true }
      )
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  test('expired package: schedule rejected', async () => {
    const { client, staff, service, pkg } = await seedBranchFixtures();
    const cp = await models.ClientPackage.create({
      branchId,
      client_id: client._id,
      package_id: pkg._id,
      total_sittings: 3,
      remaining_sittings: 3,
      used_sittings: 0,
      expiry_date: new Date('2020-01-01'),
      status: 'ACTIVE',
      payment_status: 'PAID'
    });
    await expect(
      packageSessionSvc.schedulePackageSession(models, businessDoc, {
        clientPackageId: cp._id,
        sessionNumber: 1,
        serviceId: service._id,
        staffId: staff._id,
        startAt: new Date('2026-08-01T10:00:00.000Z').toISOString(),
        endAt: new Date('2026-08-01T11:00:00.000Z').toISOString()
      }, { skipAvailability: true })
    ).rejects.toMatchObject({ code: 'PACKAGE_EXPIRED' });
  });

  test('missed session: mark missed and optional reset to unscheduled', async () => {
    const { client, staff, service, pkg } = await seedBranchFixtures();
    const cp = await models.ClientPackage.create({
      branchId,
      client_id: client._id,
      package_id: pkg._id,
      total_sittings: 2,
      remaining_sittings: 2,
      used_sittings: 0,
      expiry_date: new Date('2030-01-01'),
      status: 'ACTIVE',
      payment_status: 'PAID'
    });
    await packageSessionSvc.schedulePackageSession(
      models,
      businessDoc,
      {
        clientPackageId: cp._id,
        sessionNumber: 1,
        serviceId: service._id,
        staffId: staff._id,
        startAt: new Date('2026-09-01T10:00:00.000Z').toISOString(),
        endAt: new Date('2026-09-01T11:00:00.000Z').toISOString()
      },
      { skipAvailability: true }
    );
    const session = await models.PackageSession.findOne({ clientPackageId: cp._id, sessionNumber: 1 });
    await packageSessionSvc.markSessionMissed(models, session._id, { resetToUnscheduled: true });
    const s2 = await models.PackageSession.findById(session._id);
    expect(s2.status).toBe('unscheduled');
    expect(s2.appointmentId).toBeNull();
  });

  test('parallel booking attempts: at most one succeeds for identical slot', async () => {
    const { client, staff, service } = await seedBranchFixtures();
    const start = new Date('2026-10-01T11:00:00.000Z');
    const end = new Date('2026-10-01T12:00:00.000Z');
    const payload = {
      branchId,
      clientId: client._id,
      type: 'single',
      units: [
        {
          serviceId: service._id,
          staffId: staff._id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          price: 500
        }
      ]
    };
    const results = await Promise.allSettled([
      bookingService.createBooking(models, businessDoc, payload, { skipAvailability: true }),
      bookingService.createBooking(models, businessDoc, payload, { skipAvailability: true })
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    const saved = await models.Appointment.countDocuments({ status: 'scheduled' });
    expect(saved).toBe(1);
  });
});
