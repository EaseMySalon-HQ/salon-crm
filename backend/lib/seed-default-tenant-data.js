'use strict';

const { logger: defaultLogger } = require('../utils/logger');
const { roleDefinitions } = require('../models/Permission');

const DEMO_SERVICE_NAMES = [
  'Haircut & Styling',
  'Hair Spa',
  'Classic Facial',
  'Manicure & Pedicure',
];

const DEFAULT_SERVICES = [
  {
    name: 'Haircut & Styling',
    category: 'Hair',
    duration: 45,
    price: 499,
    description: 'Consultation, wash, cut, and blow-dry styling.',
    showInOnlineBooking: true,
  },
  {
    name: 'Hair Spa',
    category: 'Hair',
    duration: 60,
    price: 899,
    description: 'Deep conditioning spa with scalp massage and steam.',
    showInOnlineBooking: true,
  },
  {
    name: 'Classic Facial',
    category: 'Skin',
    duration: 60,
    price: 799,
    description: 'Cleanse, exfoliate, mask, and moisturise for refreshed skin.',
    showInOnlineBooking: true,
  },
  {
    name: 'Manicure & Pedicure',
    category: 'Nails',
    duration: 75,
    price: 699,
    description: 'Nail shaping, cuticle care, and polish for hands and feet.',
    showInOnlineBooking: true,
  },
];

const DEMO_STAFF = [
  {
    key: 'priya',
    name: 'Priya Sharma (Demo)',
    phone: '9000000101',
    role: 'staff',
    specialties: ['Hair', 'Skin'],
    notes: 'Sample stylist — try booking or checkout with this profile.',
  },
  {
    key: 'rahul',
    name: 'Rahul Verma (Demo)',
    phone: '9000000102',
    role: 'staff',
    specialties: ['Hair'],
    notes: 'Sample stylist — try appointments and sales flows.',
  },
];

const DEMO_CLIENTS = [
  {
    name: 'Aisha Khan (Demo)',
    phone: '9000000201',
    email: 'aisha.demo@easemysalon.demo',
    gender: 'female',
    notes: 'Sample client — edit or replace when you add real customers.',
  },
  {
    name: 'Rohan Mehta (Demo)',
    phone: '9000000202',
    email: 'rohan.demo@easemysalon.demo',
    gender: 'male',
    notes: 'Sample client — useful for testing appointments and billing.',
  },
];

function defaultWorkSchedule() {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    enabled: day !== 0,
    startTime: '09:00',
    endTime: '21:00',
  }));
}

function staffEmail(key, businessCode) {
  const code = String(businessCode || 'branch')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return `demo.${key}.${code}@easemysalon.demo`;
}

/**
 * Seed starter services, staff, and clients for a new branch tenant DB.
 * Idempotent — skips when demo services already exist for the branch.
 *
 * @param {object} businessModels - modelFactory business models
 * @param {import('mongoose').Types.ObjectId|string} branchId
 * @param {{ businessCode?: string, logger?: typeof defaultLogger }} [options]
 */
async function seedDefaultTenantData(businessModels, branchId, options = {}) {
  const log = options.logger || defaultLogger;
  const { Service, Staff, Client } = businessModels;
  if (!Service || !Staff || !Client) {
    throw new Error('seedDefaultTenantData: Service, Staff, and Client models are required');
  }

  const alreadySeeded = await Service.exists({
    branchId,
    name: { $in: DEMO_SERVICE_NAMES },
  });
  if (alreadySeeded) {
    log.debug('[seed] Demo tenant data already present for branch %s — skipping', branchId);
    return { skipped: true };
  }

  const staffRole = roleDefinitions.staff?.permissions || [];

  await Service.insertMany(
    DEFAULT_SERVICES.map((service) => ({
      ...service,
      branchId,
      isActive: true,
      taxApplicable: false,
    }))
  );

  for (const member of DEMO_STAFF) {
    await Staff.create({
      name: member.name,
      email: staffEmail(member.key, options.businessCode),
      phone: member.phone,
      role: member.role,
      specialties: member.specialties,
      notes: member.notes,
      permissions: staffRole,
      permissionsTemplate: member.role,
      hasLoginAccess: false,
      allowAppointmentScheduling: true,
      isActive: true,
      workSchedule: defaultWorkSchedule(),
      branchId,
    });
  }

  for (const client of DEMO_CLIENTS) {
    await Client.create({
      ...client,
      status: 'active',
      totalVisits: 0,
      totalSpent: 0,
      branchId,
      promotionalWhatsappEnabled: true,
      transactionalWhatsappEnabled: true,
      transactionalSmsEnabled: true,
    });
  }

  log.info(
    '[seed] Created default demo data for branch %s (%d services, %d staff, %d clients)',
    branchId,
    DEFAULT_SERVICES.length,
    DEMO_STAFF.length,
    DEMO_CLIENTS.length
  );

  return {
    skipped: false,
    services: DEFAULT_SERVICES.length,
    staff: DEMO_STAFF.length,
    clients: DEMO_CLIENTS.length,
  };
}

module.exports = {
  seedDefaultTenantData,
  DEMO_SERVICE_NAMES,
  DEFAULT_SERVICES,
  DEMO_STAFF,
  DEMO_CLIENTS,
};
