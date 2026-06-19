/**
 * Public online booking service tests.
 */
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const modelFactory = require('../../models/model-factory');
const bookingService = require('../../services/scheduling/booking-service');
const publicBookingService = require('../../services/scheduling/public-booking-service');
const { getTodayIST, toDateStringIST, parseDateIST } = require('../../utils/date-utils');

let replSet;
let models;
let branchId;
let businessDoc;

function oid() {
  return new mongoose.Types.ObjectId();
}

function futureYmd(daysFromToday = 2) {
  const d = parseDateIST(getTodayIST());
  d.setDate(d.getDate() + daysFromToday);
  return toDateStringIST(d);
}

async function seedFixtures() {
  branchId = oid();
  const client = await models.Client.create({
    name: 'Test Client',
    phone: `98765${Date.now().toString().slice(-5)}`,
    branchId,
  });
  const staffA = await models.Staff.create({
    name: 'Stylist A',
    email: `a${Date.now()}@test.com`,
    phone: '+15550000001',
    role: 'staff',
    branchId,
    allowAppointmentScheduling: true,
    specialties: ['Haircut'],
  });
  const staffB = await models.Staff.create({
    name: 'Stylist B',
    email: `b${Date.now()}@test.com`,
    phone: '+15550000002',
    role: 'staff',
    branchId,
    allowAppointmentScheduling: true,
    specialties: ['Facial'],
  });
  const serviceHair = await models.Service.create({
    name: 'Haircut',
    category: 'Haircut',
    duration: 30,
    price: 500,
    branchId,
  });
  const serviceFacial = await models.Service.create({
    name: 'Facial',
    category: 'Facial',
    duration: 30,
    price: 800,
    branchId,
  });
  return { client, staffA, staffB, serviceHair, serviceFacial };
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  models = modelFactory.createBusinessModels(mongoose.connection);
  businessDoc = {
    code: 'BIZTEST1',
    settings: {
      timezone: 'Asia/Kolkata',
      appointmentSettings: {
        slotDuration: 30,
        advanceBookingDays: 30,
        allowOnlineBooking: true,
      },
      operatingHours: {
        monday: { open: '09:00', close: '18:00', closed: false },
        tuesday: { open: '09:00', close: '18:00', closed: false },
        wednesday: { open: '09:00', close: '18:00', closed: false },
        thursday: { open: '09:00', close: '18:00', closed: false },
        friday: { open: '09:00', close: '18:00', closed: false },
        saturday: { open: '09:00', close: '18:00', closed: false },
        sunday: { open: '09:00', close: '18:00', closed: false },
      },
    },
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

describe('public booking service', () => {
  test('eligible staff filters by specialty with fallback', async () => {
    const { staffA, staffB, serviceHair } = await seedFixtures();
    const eligible = await publicBookingService.getEligibleStaffForService(
      models,
      branchId,
      serviceHair
    );
    expect(eligible.some((s) => s.id === staffA._id.toString())).toBe(true);
    expect(eligible.some((s) => s.id === staffB._id.toString())).toBe(false);

    await models.Staff.create({
      name: 'General Stylist',
      email: `g${Date.now()}@test.com`,
      phone: '+15550000099',
      role: 'staff',
      branchId,
      allowAppointmentScheduling: true,
      specialties: [],
    });

    const fallback = await publicBookingService.getEligibleStaffForService(
      models,
      branchId,
      { ...serviceHair.toObject(), category: 'UnknownCategory', name: 'Unknown' }
    );
    expect(fallback.length).toBeGreaterThanOrEqual(3);
  });

  test('public staff picker lists all schedulable staff', async () => {
    const { staffA, staffB } = await seedFixtures();
    const picker = await publicBookingService.listPublicBookingStaffForPicker(models, branchId);
    expect(picker.some((s) => s.id === staffA._id.toString())).toBe(true);
    expect(picker.some((s) => s.id === staffB._id.toString())).toBe(true);
    expect(picker.length).toBe(2);
  });

  test('no preference slot available when any eligible staff is free', async () => {
    const { serviceHair } = await seedFixtures();
    const date = futureYmd(2);
    const result = await publicBookingService.computePublicSlots(models, businessDoc, branchId, {
      date,
      items: [{ serviceId: serviceHair._id.toString(), staffId: null }],
    });
    const available = result.slots.filter((s) => s.status === 'available');
    expect(available.length).toBeGreaterThan(0);
    expect(available[0].staffAssignments).toEqual([]);
  });

  test('preferred staff booked marks slot unavailable even if others free', async () => {
    const { client, staffA, staffB, serviceHair } = await seedFixtures();
    const date = futureYmd(3);
    const start = parseDateIST(`${date}T10:00:00+05:30`);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    await bookingService.createBooking(models, businessDoc, {
      branchId,
      clientId: client._id,
      type: 'single',
      units: [
        {
          serviceId: serviceHair._id,
          staffId: staffA._id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          price: 500,
        },
      ],
    });

    const result = await publicBookingService.computePublicSlots(models, businessDoc, branchId, {
      date,
      items: [{ serviceId: serviceHair._id.toString(), staffId: staffA._id.toString() }],
    });
    const tenAm = result.slots.find((s) => s.time === '10:00');
    expect(tenAm).toBeDefined();
    expect(tenAm.status).toBe('unavailable');

    const noPref = await publicBookingService.computePublicSlots(models, businessDoc, branchId, {
      date,
      items: [{ serviceId: serviceHair._id.toString(), staffId: null }],
    });
    const tenAmOpen = noPref.slots.find((s) => s.time === '10:00');
    expect(tenAmOpen?.status).toBe('available');
    expect(tenAmOpen?.staffAssignments).toEqual([]);
  });

  test('no preference assigns one staff for entire multi-service block', async () => {
    const { client, staffA, staffB, serviceHair, serviceFacial } = await seedFixtures();
    const date = futureYmd(7);
    const start = parseDateIST(`${date}T10:30:00+05:30`);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    await bookingService.createBooking(models, businessDoc, {
      branchId,
      clientId: client._id,
      type: 'single',
      units: [
        {
          serviceId: serviceHair._id,
          staffId: staffA._id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          price: 500,
        },
      ],
    });

    const result = await publicBookingService.computePublicSlots(models, businessDoc, branchId, {
      date,
      items: [
        { serviceId: serviceHair._id.toString(), staffId: null },
        { serviceId: serviceFacial._id.toString(), staffId: null },
      ],
    });
    const tenThirty = result.slots.find((s) => s.time === '10:30');
    expect(tenThirty?.status).toBe('available');
    expect(tenThirty?.staffAssignments).toEqual([]);
  });

  test('multi-service sequential slot respects combined duration', async () => {
    const { serviceHair, serviceFacial } = await seedFixtures();
    const date = futureYmd(4);
    const result = await publicBookingService.computePublicSlots(models, businessDoc, branchId, {
      date,
      items: [
        { serviceId: serviceHair._id.toString(), staffId: null },
        { serviceId: serviceFacial._id.toString(), staffId: null },
      ],
    });
    expect(result.totalDurationMinutes).toBe(60);
    const lastSlot = result.slots[result.slots.length - 1];
    expect(lastSlot.time).toBe('17:00');
    expect(lastSlot.endAt).toContain('T18:00:00');
  });

  test('branch holiday returns no slots', async () => {
    const { serviceHair } = await seedFixtures();
    const date = futureYmd(5);
    if (models.BranchHoliday) {
      await models.BranchHoliday.create({
        branchId,
        date,
        name: 'Holiday',
      });
    }
    const result = await publicBookingService.computePublicSlots(models, businessDoc, branchId, {
      date,
      items: [{ serviceId: serviceHair._id.toString(), staffId: null }],
    });
    expect(result.closed).toBe(true);
    expect(result.slots).toHaveLength(0);
  });

  test('no preference booking assigns staff on the server for calendar', async () => {
    const { staffA, serviceHair } = await seedFixtures();
    const date = futureYmd(9);
    const startAt = `${date}T11:00:00+05:30`;

    const result = await publicBookingService.createPublicBooking(models, businessDoc, branchId, {
      date,
      startAt,
      items: [{ serviceId: serviceHair._id.toString(), staffId: null }],
      customer: { name: 'Walk-in Guest', phone: '9876543299' },
    });

    expect(result.appointmentIds?.length).toBe(1);
    const appt = await models.Appointment.findById(result.appointmentIds[0]).lean();
    expect(appt).toBeTruthy();
    expect(appt.staffId.toString()).toBe(staffA._id.toString());
  });

  test('preferred staff slot responses include staff assignments', async () => {
    const { staffA, serviceHair } = await seedFixtures();
    const date = futureYmd(10);
    const result = await publicBookingService.computePublicSlots(models, businessDoc, branchId, {
      date,
      items: [{ serviceId: serviceHair._id.toString(), staffId: staffA._id.toString() }],
    });
    const available = result.slots.filter((s) => s.status === 'available');
    expect(available.length).toBeGreaterThan(0);
    expect(available[0].staffAssignments[0]?.staffId).toBe(staffA._id.toString());
  });

  test('double book returns conflict on createPublicBooking', async () => {
    const { staffA, serviceHair } = await seedFixtures();
    const date = futureYmd(6);
    const startAt = `${date}T11:00:00+05:30`;
    const items = [{ serviceId: serviceHair._id.toString(), staffId: staffA._id.toString() }];

    await publicBookingService.createPublicBooking(models, businessDoc, branchId, {
      date,
      startAt,
      items,
      customer: { name: 'First', phone: '9876543210' },
    });

    await expect(
      publicBookingService.createPublicBooking(models, businessDoc, branchId, {
        date,
        startAt,
        items,
        customer: { name: 'Second', phone: '9876543211' },
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  test('findOrCreatePublicClient matches existing client by phone without overwriting', async () => {
    await seedFixtures();
    const existing = await models.Client.create({
      name: 'Registered Client',
      phone: '9876543210',
      email: 'registered@test.com',
      branchId,
      status: 'active',
    });

    const resolved = await publicBookingService.findOrCreatePublicClient(models, branchId, {
      name: 'Different Name From Form',
      phone: '+91 98765 43210',
      email: 'other@test.com',
    });

    expect(resolved._id.toString()).toBe(existing._id.toString());
    expect(resolved.name).toBe('Registered Client');
    expect(resolved.email).toBe('registered@test.com');

    const unchanged = await models.Client.findById(existing._id).lean();
    expect(unchanged.name).toBe('Registered Client');
    expect(unchanged.email).toBe('registered@test.com');
  });

  test('public slot responses omit internal conflict reasons', async () => {
    const { client, staffA, serviceHair } = await seedFixtures();
    const date = futureYmd(8);
    const start = parseDateIST(`${date}T10:00:00+05:30`);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    await bookingService.createBooking(models, businessDoc, {
      branchId,
      clientId: client._id,
      type: 'single',
      units: [
        {
          serviceId: serviceHair._id,
          staffId: staffA._id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          price: 500,
        },
      ],
    });

    const result = await publicBookingService.computePublicSlots(models, businessDoc, branchId, {
      date,
      items: [{ serviceId: serviceHair._id.toString(), staffId: staffA._id.toString() }],
    });
    const tenAm = result.slots.find((s) => s.time === '10:00');
    expect(tenAm?.status).toBe('unavailable');
    expect(tenAm?.reason).toBeUndefined();
  });

  test('formatPublicBookResponse returns only timezone', () => {
    expect(publicBookingService.formatPublicBookResponse('Asia/Kolkata')).toEqual({
      timezone: 'Asia/Kolkata',
    });
  });

  test('findOrCreatePublicClient creates new client with optional email', async () => {
    await seedFixtures();
    const created = await publicBookingService.findOrCreatePublicClient(models, branchId, {
      name: 'New Guest',
      phone: '9123456789',
      email: 'guest@test.com',
    });
    expect(created.name).toBe('New Guest');
    expect(created.phone).toBe('9123456789');
    expect(created.email).toBe('guest@test.com');

    const withoutEmail = await publicBookingService.findOrCreatePublicClient(models, branchId, {
      name: 'No Email Guest',
      phone: '9123456788',
    });
    expect(withoutEmail.email).toBeFalsy();
  });
});
