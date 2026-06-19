'use strict';

const mongoose = require('mongoose');
const {
  getBranchOperatingWindow,
  isSlotWithinAvailability,
} = require('./availability-engine');
const { detectStaffConflict } = require('./conflict-detector');
const bookingService = require('./booking-service');
const {
  parseDateIST,
  toDateStringIST,
  getTodayIST,
  parseTimeToMinutes,
  toIsoStringIST,
  parseSchedulingInstant,
} = require('../../utils/date-utils');
const { ensureWalkInClient, WALK_IN_PHONE } = require('../../lib/ensure-walk-in-client');
const { normalizePhone } = require('../../lib/branch-management-helpers');

const SLOT_LEAD_MINUTES = 15;
const HOLD_TTL_MINUTES = 5;

function getAppointmentSettings(businessDoc) {
  const s = businessDoc?.settings?.appointmentSettings || {};
  let slotDuration = Number(s.slotDuration);
  if (slotDuration !== 15 && slotDuration !== 30) slotDuration = 30;
  const advanceBookingDays = Number(s.advanceBookingDays) > 0 ? Number(s.advanceBookingDays) : 30;
  const timezone = businessDoc?.settings?.timezone || 'Asia/Kolkata';
  return { slotDuration, advanceBookingDays, timezone };
}

function normalizeIndianPhone(raw) {
  const last10 = normalizePhone(raw);
  return last10.length === 10 ? last10 : null;
}

async function findExistingClientByPhone(models, branchId, phone) {
  const last10 = normalizeIndianPhone(phone);
  if (!last10) return null;

  const { Client } = models;
  const phonePattern = new RegExp(`${last10}$`);
  return Client.findOne({
    branchId,
    phone: phonePattern,
    isWalkIn: { $ne: true },
  });
}

/**
 * Resolve the client for a public booking by mobile number.
 * Existing clients are reused as stored — form name/email are not applied.
 * New clients are created from submitted name + mobile; email is optional.
 */
async function findOrCreatePublicClient(models, branchId, { name, phone, email }) {
  const normalized = normalizeIndianPhone(phone);
  if (!normalized) {
    const err = new Error('Enter a valid 10-digit mobile number.');
    err.code = 'VALIDATION';
    throw err;
  }

  const existing = await findExistingClientByPhone(models, branchId, phone);
  if (existing) {
    return existing;
  }

  const trimmedName = String(name || '').trim();
  if (trimmedName.length < 2) {
    const err = new Error('Enter a valid customer name.');
    err.code = 'VALIDATION';
    throw err;
  }

  const trimmedEmail = email ? String(email).trim().toLowerCase() : '';
  const { Client } = models;
  const client = new Client({
    name: trimmedName,
    phone: normalized,
    email: trimmedEmail || undefined,
    status: 'active',
    branchId,
    totalVisits: 0,
    totalSpent: 0,
    promotionalWhatsappEnabled: true,
    transactionalWhatsappEnabled: true,
    transactionalSmsEnabled: true,
  });
  await client.save();
  return client;
}

function sanitizePublicSlotReason(reason) {
  if (reason === 'past') return 'past';
  if (reason === 'closed') return 'closed';
  if (reason === 'outside_hours' || reason === 'outside_working_hours') {
    return 'outside_working_hours';
  }
  return null;
}

function formatPublicStaffAssignments(assignments, { redactStaff = false } = {}) {
  if (redactStaff) return [];
  return (assignments || []).map((a) => ({
    serviceId: a.serviceId,
    staffId: a.staffId,
    staffName: a.staffName,
  }));
}

function formatPublicSlot(slot, { redactStaff = false } = {}) {
  const safeReason = sanitizePublicSlotReason(slot.reason);
  const formatted = {
    time: slot.time,
    startAt: slot.startAt,
    endAt: slot.endAt,
    status: slot.status,
    staffAssignments: formatPublicStaffAssignments(slot.staffAssignments, { redactStaff }),
  };
  if (safeReason) {
    formatted.reason = safeReason;
  }
  return formatted;
}

function formatPublicSlotsResponse(payload, { redactStaff = false } = {}) {
  return {
    date: payload.date,
    timezone: payload.timezone,
    slotIntervalMinutes: payload.slotIntervalMinutes,
    totalDurationMinutes: payload.totalDurationMinutes,
    closed: payload.closed === true,
    slots: (payload.slots || []).map((slot) => formatPublicSlot(slot, { redactStaff })),
  };
}

function formatPublicBookResponse(timezone) {
  return { timezone: timezone || 'Asia/Kolkata' };
}

function formatPublicHoldsResponse(payload, { redactStaff = false } = {}) {
  return {
    holdIds: (payload.holdIds || []).map(String),
    expiresAt: payload.expiresAt || null,
    staffAssignments: formatPublicStaffAssignments(payload.staffAssignments, { redactStaff }),
  };
}

function specialtyMatchesService(staff, serviceDoc) {
  const specs = Array.isArray(staff.specialties) ? staff.specialties : [];
  if (specs.length === 0) return false;
  const cat = String(serviceDoc.category || '').toLowerCase();
  const name = String(serviceDoc.name || '').toLowerCase();
  return specs.some((sp) => {
    const s = String(sp || '').toLowerCase();
    if (!s) return false;
    return cat.includes(s) || s.includes(cat) || name.includes(s) || s.includes(name);
  });
}

async function getSchedulableStaff(models, branchId) {
  const { Staff } = models;
  return Staff.find({
    branchId,
    isActive: { $ne: false },
    allowAppointmentScheduling: { $ne: false },
  })
    .select('_id name specialties avatar')
    .sort({ name: 1 })
    .lean();
}

async function getEligibleStaffForService(models, branchId, serviceDoc) {
  const all = await getSchedulableStaff(models, branchId);
  const matched = all.filter((s) => specialtyMatchesService(s, serviceDoc));
  const list = matched.length > 0 ? matched : all;
  return list.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    avatar: s.avatar || null,
  }));
}

/** All schedulable staff for the public booking picker (no specialty filter). */
async function listPublicBookingStaffForPicker(models, branchId) {
  const all = await getSchedulableStaff(models, branchId);
  return all.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    avatar: s.avatar || null,
  }));
}

async function isBranchClosedOnDate(models, branchId, ymd, businessDoc) {
  const { BranchHoliday } = models;
  if (BranchHoliday) {
    const hol = await BranchHoliday.findOne({ branchId, date: ymd }).lean();
    if (hol) return true;
  }
  const win = getBranchOperatingWindow(businessDoc, ymd);
  return win.closed === true;
}

function listBranchCandidateStarts(businessDoc, ymd, durationMinutes, stepMinutes) {
  const win = getBranchOperatingWindow(businessDoc, ymd);
  if (win.closed) return [];

  const dayStart = parseDateIST(ymd);
  const openM = parseTimeToMinutes(win.open || '0:00');
  const closeM = parseTimeToMinutes(win.close || '23:59');
  const out = [];
  for (let m = openM; m + durationMinutes <= closeM; m += stepMinutes) {
    const start = new Date(dayStart.getTime() + m * 60 * 1000);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    out.push({ start, end });
  }
  return out;
}

function formatSlotTime24(start, timezone = 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(start);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const min = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${min}`;
}

function isDateWithinAdvanceWindow(ymd, advanceBookingDays) {
  const today = getTodayIST();
  const start = parseDateIST(today);
  const end = parseDateIST(today);
  end.setDate(end.getDate() + advanceBookingDays);
  const target = parseDateIST(ymd);
  return target >= start && target <= end;
}

async function loadCartServices(models, branchId, items) {
  const { Service } = models;
  const ids = items.map((i) => i.serviceId);
  const services = await Service.find({
    _id: { $in: ids },
    branchId,
    isActive: { $ne: false },
    $or: [{ serviceKind: { $exists: false } }, { serviceKind: 'simple' }, { serviceKind: null }],
  }).lean();

  const byId = new Map(services.map((s) => [s._id.toString(), s]));
  const resolved = [];
  for (const item of items) {
    const svc = byId.get(String(item.serviceId));
    if (!svc) {
      const err = new Error('One or more services are unavailable.');
      err.code = 'VALIDATION';
      throw err;
    }
    resolved.push({
      serviceId: svc._id.toString(),
      staffId: item.staffId ? String(item.staffId) : null,
      service: svc,
    });
  }
  return resolved;
}

function buildSegments(resolvedCart, slotStart) {
  let cursor = new Date(slotStart.getTime());
  return resolvedCart.map((row) => {
    const durationMinutes = Number(row.service.duration) || 60;
    const start = new Date(cursor.getTime());
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    cursor = end;
    return {
      serviceId: row.serviceId,
      staffId: row.staffId,
      service: row.service,
      start,
      end,
      durationMinutes,
    };
  });
}

async function segmentStaffAvailable(models, businessDoc, branchId, segment, staffId, excludeHoldIds = []) {
  const within = await isSlotWithinAvailability(models, {
    branchId,
    staffId,
    businessDoc,
    start: segment.start,
    end: segment.end,
  });
  if (!within.ok) {
    return { ok: false, reason: within.reason || 'outside_hours' };
  }
  const conflict = await detectStaffConflict(models, {
    branchId,
    staffId,
    start: segment.start,
    end: segment.end,
    skipHoldCheck: false,
    excludeHoldIds: excludeHoldIds || [],
  });
  if (conflict.conflict) {
    return { ok: false, reason: conflict.reason || 'fully_booked' };
  }
  return { ok: true };
}

async function staffCoversAllSegments(
  models,
  businessDoc,
  branchId,
  segments,
  staffId,
  excludeHoldIds = []
) {
  for (const segment of segments) {
    const check = await segmentStaffAvailable(
      models,
      businessDoc,
      branchId,
      segment,
      staffId,
      excludeHoldIds
    );
    if (!check.ok) {
      return { ok: false, reason: check.reason || 'fully_booked' };
    }
  }
  return { ok: true };
}

function preferredStaffIdFromCart(resolvedCart) {
  const ids = resolvedCart.map((r) => r.staffId).filter(Boolean);
  if (ids.length === 0) return null;
  const unique = new Set(ids);
  return unique.size === 1 ? ids[0] : null;
}

function assignmentUnavailableError(reason, segmentServiceId) {
  const err = new Error('Slot is no longer available.');
  err.code =
    reason === 'unavailable' || reason === 'fully_booked' || reason === 'appointment_overlap'
      ? 'CONFLICT'
      : 'OUTSIDE_AVAILABILITY';
  err.details = { reason: reason || 'fully_booked', segment: segmentServiceId };
  return err;
}

async function resolveStaffAssignments(models, businessDoc, branchId, resolvedCart, slotStart, excludeHoldIds = []) {
  const segments = buildSegments(resolvedCart, slotStart);
  const preferredStaffId = preferredStaffIdFromCart(resolvedCart);

  if (preferredStaffId) {
    const check = await staffCoversAllSegments(
      models,
      businessDoc,
      branchId,
      segments,
      preferredStaffId,
      excludeHoldIds
    );
    if (!check.ok) {
      throw assignmentUnavailableError(check.reason, segments[0]?.serviceId);
    }
    const staffName =
      (await models.Staff.findById(preferredStaffId).select('name').lean())?.name || '';
    return segments.map((segment) => ({
      serviceId: segment.serviceId,
      staffId: preferredStaffId,
      staffName,
      start: segment.start,
      end: segment.end,
      durationMinutes: segment.durationMinutes,
      service: segment.service,
    }));
  }

  /** No preference: one schedulable staff must cover every service segment back-to-back. */
  const allStaff = await getSchedulableStaff(models, branchId);
  const sorted = [...allStaff].sort((a, b) => a._id.toString().localeCompare(b._id.toString()));

  for (const staff of sorted) {
    const staffId = staff._id.toString();
    const check = await staffCoversAllSegments(
      models,
      businessDoc,
      branchId,
      segments,
      staffId,
      excludeHoldIds
    );
    if (check.ok) {
      return segments.map((segment) => ({
        serviceId: segment.serviceId,
        staffId,
        staffName: staff.name,
        start: segment.start,
        end: segment.end,
        durationMinutes: segment.durationMinutes,
        service: segment.service,
      }));
    }
  }

  throw assignmentUnavailableError('fully_booked', segments[0]?.serviceId);
}

function slotPastLeadTime(start, timezone) {
  const now = new Date();
  const ymdToday = toDateStringIST(now);
  const ymdSlot = toDateStringIST(start);
  if (ymdSlot !== ymdToday) return false;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const nowM = h * 60 + m;

  const slotParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(start);
  const sh = Number(slotParts.find((p) => p.type === 'hour')?.value ?? 0);
  const sm = Number(slotParts.find((p) => p.type === 'minute')?.value ?? 0);
  const slotM = sh * 60 + sm;

  return slotM < nowM + SLOT_LEAD_MINUTES;
}

async function computePublicSlots(models, businessDoc, branchId, { date, items, holdIds = [] }) {
  const { slotDuration, advanceBookingDays, timezone } = getAppointmentSettings(businessDoc);
  const excludeHoldIds = (holdIds || []).map(String).filter(Boolean);
  const ymd = String(date).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const err = new Error('Invalid date.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!isDateWithinAdvanceWindow(ymd, advanceBookingDays)) {
    const err = new Error('Date is outside the booking window.');
    err.code = 'VALIDATION';
    throw err;
  }

  const resolvedCart = await loadCartServices(models, branchId, items);
  if (resolvedCart.length === 0) {
    const err = new Error('At least one service is required.');
    err.code = 'VALIDATION';
    throw err;
  }

  const totalDurationMinutes = resolvedCart.reduce(
    (sum, r) => sum + (Number(r.service.duration) || 60),
    0
  );
  const redactStaff = preferredStaffIdFromCart(resolvedCart) === null;

  if (await isBranchClosedOnDate(models, branchId, ymd, businessDoc)) {
    return formatPublicSlotsResponse(
      {
        date: ymd,
        timezone,
        slotIntervalMinutes: slotDuration,
        totalDurationMinutes,
        slots: [],
        closed: true,
      },
      { redactStaff }
    );
  }

  const candidates = listBranchCandidateStarts(businessDoc, ymd, totalDurationMinutes, slotDuration);
  const slots = [];

  for (const { start, end } of candidates) {
    const time = formatSlotTime24(start, timezone);
    const base = {
      time,
      startAt: toIsoStringIST(start),
      endAt: toIsoStringIST(end),
    };

    if (slotPastLeadTime(start, timezone)) {
      slots.push({
        ...base,
        status: 'unavailable',
        reason: 'past',
        staffAssignments: [],
      });
      continue;
    }

    try {
      const assignments = await resolveStaffAssignments(
        models,
        businessDoc,
        branchId,
        resolvedCart,
        start,
        excludeHoldIds
      );
      slots.push({
        ...base,
        status: 'available',
        reason: null,
        staffAssignments: assignments.map((a) => ({
          serviceId: a.serviceId,
          staffId: a.staffId,
          staffName: a.staffName,
        })),
      });
    } catch (e) {
      const hasPreferred = resolvedCart.some((r) => r.staffId);
      const reason = e.details?.reason || e.code;
      let status = 'fully_booked';
      if (hasPreferred && (reason === 'unavailable' || e.code === 'CONFLICT')) {
        status = 'unavailable';
      }
      slots.push({
        ...base,
        status,
        reason: reason === 'closed' ? 'closed' : reason === 'outside_hours' ? 'outside_working_hours' : reason || 'fully_booked',
        staffAssignments: [],
      });
    }
  }

  return formatPublicSlotsResponse(
    {
      date: ymd,
      timezone,
      slotIntervalMinutes: slotDuration,
      totalDurationMinutes,
      slots,
      closed: false,
    },
    { redactStaff }
  );
}

async function createPublicHolds(models, businessDoc, branchId, { date, startAt, items }) {
  const resolvedCart = await loadCartServices(models, branchId, items);
  const redactStaff = preferredStaffIdFromCart(resolvedCart) === null;
  const slotStart = parseSchedulingInstant(startAt);
  if (!slotStart) {
    const err = new Error('Invalid startAt.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (toDateStringIST(slotStart) !== String(date).trim()) {
    const err = new Error('startAt does not match date.');
    err.code = 'VALIDATION';
    throw err;
  }

  const assignments = await resolveStaffAssignments(models, businessDoc, branchId, resolvedCart, slotStart);
  await ensureWalkInClient(models, branchId);
  const walkInDoc = await models.Client.findOne({
    $or: [{ isWalkIn: true }, { phone: WALK_IN_PHONE }],
  })
    .select('_id')
    .lean();
  const clientId = walkInDoc?._id;
  if (!clientId) {
    const err = new Error('Could not prepare slot hold.');
    err.code = 'CONFIG';
    throw err;
  }

  const holds = [];
  for (const a of assignments) {
    const hold = await bookingService.createSlotHold(models, {
      branchId,
      clientId,
      staffId: a.staffId,
      startAt: toIsoStringIST(a.start),
      endAt: toIsoStringIST(a.end),
      ttlMinutes: HOLD_TTL_MINUTES,
      createdBy: 'online_booking',
    });
    holds.push(bookingService.formatHoldForApi(hold));
  }

  return formatPublicHoldsResponse(
    {
      holdIds: holds.map((h) => h.holdId || h._id),
      expiresAt: holds[0]?.expiresAt || null,
      staffAssignments: assignments.map((a) => ({
        serviceId: a.serviceId,
        staffId: a.staffId,
        staffName: a.staffName,
      })),
    },
    { redactStaff }
  );
}

async function createPublicBooking(models, businessDoc, branchId, payload) {
  const { date, startAt, items, holdIds = [], customer = {} } = payload;
  const resolvedCart = await loadCartServices(models, branchId, items);
  const slotStart = parseSchedulingInstant(startAt);
  if (!slotStart) {
    const err = new Error('Invalid startAt.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (toDateStringIST(slotStart) !== String(date).trim()) {
    const err = new Error('startAt does not match date.');
    err.code = 'VALIDATION';
    throw err;
  }

  const excludeHoldIds = (holdIds || []).map(String).filter(Boolean);
  const assignments = await resolveStaffAssignments(
    models,
    businessDoc,
    branchId,
    resolvedCart,
    slotStart,
    excludeHoldIds
  );

  const client = await findOrCreatePublicClient(models, branchId, customer);
  const customerNotes = customer.notes ? String(customer.notes).trim() : '';

  const units = assignments.map((a) => ({
    serviceId: a.serviceId,
    staffId: a.staffId,
    startAt: toIsoStringIST(a.start),
    endAt: toIsoStringIST(a.end),
    price: a.service.price,
    status: 'scheduled',
    leadSource: 'online_booking',
    notes: customerNotes,
    createdBy: 'online_booking',
  }));

  try {
    const result = await bookingService.createBooking(models, businessDoc, {
      branchId,
      clientId: client._id,
      type: 'single',
      paymentState: 'pending',
      holdIdsToConsume: excludeHoldIds,
      metadata: { source: 'online_booking' },
      units,
    });

    return {
      bookingId: result.booking._id,
      appointmentIds: result.appointmentIds,
      timezone: businessDoc?.settings?.timezone || 'Asia/Kolkata',
    };
  } catch (e) {
    if (e.code === 'CONFLICT' || e.code === 'OUTSIDE_AVAILABILITY') {
      const err = new Error('This time slot is no longer available. Please pick another.');
      err.code = 'CONFLICT';
      throw err;
    }
    throw e;
  }
}

function sanitizeShowcaseImageUrl(url) {
  const t = String(url || '').trim();
  if (!t) return null;
  if (t.startsWith('https://')) return t;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(t) && t.length <= 1_500_000) {
    return t;
  }
  return null;
}

const { sanitizeBookingHeroTheme } = require('../../lib/booking-hero-themes');

function sanitizeShowcaseImages(images) {
  if (!Array.isArray(images)) return [];
  const out = [];
  for (const raw of images) {
    const safe = sanitizeShowcaseImageUrl(raw);
    if (safe) out.push(safe);
    if (out.length >= 8) break;
  }
  return out;
}

function formatBusinessProfile(businessDoc, extras = {}) {
  const { slotDuration, advanceBookingDays, timezone } = getAppointmentSettings(businessDoc);
  const hours = businessDoc.settings?.operatingHours || {};
  const appt = businessDoc.settings?.appointmentSettings || {};
  return {
    code: businessDoc.code,
    name: businessDoc.name,
    businessType: businessDoc.businessType || 'salon',
    address: businessDoc.address || {},
    contact: businessDoc.contact || {},
    timezone,
    slotIntervalMinutes: slotDuration,
    advanceBookingDays,
    operatingHours: hours,
    bookingTagline: String(appt.bookingTagline || '').trim(),
    showcaseImages: sanitizeShowcaseImages(appt.showcaseImages),
    bookingHeroTheme: sanitizeBookingHeroTheme(appt.bookingHeroTheme),
    logoUrl: extras.logoUrl || null,
  };
}

async function formatPublicBusinessProfile(businessDoc, models) {
  let logoUrl = null;
  if (models?.BusinessSettings) {
    const settings = await models.BusinessSettings.findOne().select('logo').lean();
    if (settings?.logo && typeof settings.logo === 'string' && settings.logo.trim()) {
      logoUrl = settings.logo.trim();
    }
  }
  return formatBusinessProfile(businessDoc, { logoUrl });
}

async function listPublicServices(models, branchId, search = '') {
  const { Service } = models;
  const q = {
    branchId,
    isActive: { $ne: false },
    $or: [{ serviceKind: { $exists: false } }, { serviceKind: 'simple' }, { serviceKind: null }],
  };
  if (search && String(search).trim()) {
    const term = String(search).trim();
    q.$and = [
      {
        $or: [
          { name: { $regex: term, $options: 'i' } },
          { category: { $regex: term, $options: 'i' } },
        ],
      },
    ];
  }
  const rows = await Service.find(q).sort({ category: 1, name: 1 }).lean();
  return rows.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    category: s.category,
    duration: s.duration,
    price: s.price,
    description: s.description || '',
  }));
}

module.exports = {
  getAppointmentSettings,
  getEligibleStaffForService,
  listPublicBookingStaffForPicker,
  computePublicSlots,
  resolveStaffAssignments,
  createPublicHolds,
  findOrCreatePublicClient,
  findExistingClientByPhone,
  createPublicBooking,
  formatBusinessProfile,
  formatPublicBusinessProfile,
  sanitizeShowcaseImages,
  formatPublicSlotsResponse,
  formatPublicBookResponse,
  listPublicServices,
  normalizeIndianPhone,
  SLOT_LEAD_MINUTES,
  HOLD_TTL_MINUTES,
};
