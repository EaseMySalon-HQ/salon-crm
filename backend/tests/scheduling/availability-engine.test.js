/**
 * Staff availability engine — worked weekoff override on check-in.
 */
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const modelFactory = require('../../models/model-factory');
const { getEffectiveStaffDayWindow } = require('../../services/scheduling/availability-engine');

let replSet;
let models;
let branchId;
let businessDoc;

function oid() {
  return new mongoose.Types.ObjectId();
}

/** 2026-07-05 is a Sunday (day 0). */
const WEEKOFF_YMD = '2026-07-05';

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  models = modelFactory.createBusinessModels(mongoose.connection);
  branchId = oid();
  businessDoc = {
    settings: {
      operatingHours: {
        sunday: { closed: false, open: '10:00', close: '20:00' },
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

describe('availability engine worked weekoff', () => {
  test('weekoff staff is closed without check-in', async () => {
    const staff = await models.Staff.create({
      name: 'Weekoff Stylist',
      email: `weekoff${Date.now()}@test.com`,
      phone: '+15550000111',
      role: 'staff',
      branchId,
      allowAppointmentScheduling: true,
      workSchedule: [
        { day: 0, enabled: false, startTime: '09:00', endTime: '18:00' },
        { day: 1, enabled: true, startTime: '09:00', endTime: '18:00' },
      ],
    });

    const win = await getEffectiveStaffDayWindow(models, branchId, staff._id, WEEKOFF_YMD, businessDoc);
    expect(win.closed).toBe(true);
  });

  test('weekoff staff opens after check-in', async () => {
    const staff = await models.Staff.create({
      name: 'Worked Weekoff',
      email: `worked${Date.now()}@test.com`,
      phone: '+15550000222',
      role: 'staff',
      branchId,
      allowAppointmentScheduling: true,
      workSchedule: [{ day: 0, enabled: false, startTime: '09:30', endTime: '17:30' }],
    });

    await models.StaffAttendance.create({
      branchId,
      staffId: staff._id,
      staffName: staff.name,
      date: WEEKOFF_YMD,
      checkInAt: new Date(),
    });

    const win = await getEffectiveStaffDayWindow(models, branchId, staff._id, WEEKOFF_YMD, businessDoc);
    expect(win.closed).toBe(false);
    expect(win.open).toBe('09:30');
    expect(win.close).toBe('17:30');
  });

  test('branch holiday stays closed even with check-in on weekoff', async () => {
    const staff = await models.Staff.create({
      name: 'Holiday Staff',
      email: `holiday${Date.now()}@test.com`,
      phone: '+15550000333',
      role: 'staff',
      branchId,
      allowAppointmentScheduling: true,
      workSchedule: [{ day: 0, enabled: false, startTime: '09:00', endTime: '18:00' }],
    });

    await models.BranchHoliday.create({ branchId, date: WEEKOFF_YMD, name: 'Branch closed' });
    await models.StaffAttendance.create({
      branchId,
      staffId: staff._id,
      staffName: staff.name,
      date: WEEKOFF_YMD,
      checkInAt: new Date(),
    });

    const win = await getEffectiveStaffDayWindow(models, branchId, staff._id, WEEKOFF_YMD, businessDoc);
    expect(win.closed).toBe(true);
  });
});
