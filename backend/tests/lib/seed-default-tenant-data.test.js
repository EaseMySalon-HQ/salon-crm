'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const modelFactory = require('../../models/model-factory');
const { seedDefaultTenantData, DEMO_SERVICE_NAMES } = require('../../lib/seed-default-tenant-data');

let mongo;
let models;
let branchId;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  models = modelFactory.createBusinessModels(mongoose.connection);
  branchId = new mongoose.Types.ObjectId();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('seedDefaultTenantData creates services, staff, and clients', async () => {
  const result = await seedDefaultTenantData(models, branchId, { businessCode: 'DEMO01' });
  expect(result.skipped).toBe(false);
  expect(result.services).toBe(4);
  expect(result.staff).toBe(2);
  expect(result.clients).toBe(2);

  const services = await models.Service.find({ branchId }).sort({ name: 1 }).lean();
  expect(services.map((s) => s.name)).toEqual([...DEMO_SERVICE_NAMES].sort());

  const staff = await models.Staff.find({ branchId }).sort({ name: 1 }).lean();
  expect(staff).toHaveLength(2);
  expect(staff.every((s) => s.allowAppointmentScheduling)).toBe(true);

  const clients = await models.Client.find({ branchId }).sort({ name: 1 }).lean();
  expect(clients).toHaveLength(2);
});

test('seedDefaultTenantData is idempotent', async () => {
  const again = await seedDefaultTenantData(models, branchId, { businessCode: 'DEMO01' });
  expect(again.skipped).toBe(true);

  expect(await models.Service.countDocuments({ branchId })).toBe(4);
  expect(await models.Staff.countDocuments({ branchId })).toBe(2);
  expect(await models.Client.countDocuments({ branchId })).toBe(2);
});
