const { detectStaffConflict } = require('./conflict-detector');
const { isSlotWithinAvailability } = require('./availability-engine');
const { createBooking } = require('./booking-service');
const { parseSchedulingInstant, toIsoStringIST } = require('../../utils/date-utils');

/**
 * Create one PackageSession per sitting if none exist.
 * @returns {Promise<number>} number of sessions created (0 if already existed)
 */
async function ensureSessionsForClientPackage(models, clientPackageId) {
  const { PackageSession, ClientPackage } = models;
  if (!PackageSession || !ClientPackage) {
    const err = new Error('PackageSession / ClientPackage models required');
    err.code = 'CONFIG';
    throw err;
  }
  const cp = await ClientPackage.findById(clientPackageId);
  if (!cp) {
    const err = new Error('Client package not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const existing = await PackageSession.countDocuments({ clientPackageId: cp._id });
  if (existing > 0) return 0;

  const docs = [];
  for (let i = 1; i <= cp.total_sittings; i++) {
    docs.push({
      branchId: cp.branchId,
      clientPackageId: cp._id,
      clientId: cp.client_id,
      sessionNumber: i,
      status: 'unscheduled',
      expiresAt: cp.expiry_date || null
    });
  }
  await PackageSession.insertMany(docs);
  return docs.length;
}

/**
 * List sessions for a purchase with remaining / used summary.
 */
async function listSessions(models, clientPackageId) {
  const { PackageSession, ClientPackage } = models;
  await ensureSessionsForClientPackage(models, clientPackageId);
  const cp = await ClientPackage.findById(clientPackageId).lean();
  const sessions = await PackageSession.find({ clientPackageId })
    .sort({ sessionNumber: 1 })
    .lean();
  const remaining = sessions.filter((s) =>
    ['unscheduled', 'scheduled'].includes(s.status)
  ).length;
  const iso = (d) => (d == null ? null : toIsoStringIST(d));
  const sessionsOut = sessions.map((s) => ({
    ...s,
    scheduledStartAt: iso(s.scheduledStartAt),
    scheduledEndAt: iso(s.scheduledEndAt),
    expiresAt: iso(s.expiresAt),
    createdAt: s.createdAt != null ? iso(s.createdAt) : undefined,
    updatedAt: s.updatedAt != null ? iso(s.updatedAt) : undefined
  }));
  const cpOut = {
    ...cp,
    expiry_date: cp.expiry_date != null ? iso(cp.expiry_date) : null,
    purchase_date: cp.purchase_date != null ? iso(cp.purchase_date) : undefined,
    createdAt: cp.createdAt != null ? iso(cp.createdAt) : undefined,
    updatedAt: cp.updatedAt != null ? iso(cp.updatedAt) : undefined
  };
  return {
    clientPackage: cpOut,
    sessions: sessionsOut,
    remainingCount: remaining,
    totalSessions: sessions.length,
    timezone: 'Asia/Kolkata'
  };
}

/**
 * Schedule one package session (creates appointment + parent booking link or attaches to existing booking).
 */
async function schedulePackageSession(models, businessDoc, payload, opts = {}) {
  const {
    PackageSession,
    ClientPackage
  } = models;
  const {
    clientPackageId,
    sessionNumber,
    sessionId,
    serviceId,
    startAt,
    endAt,
    staffId,
    staffAssignments,
    createdBy = '',
    blockIfPendingPayment = false
  } = payload;

  await ensureSessionsForClientPackage(models, clientPackageId);

  const cp = await ClientPackage.findById(clientPackageId);
  if (!cp) {
    const err = new Error('Client package not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (cp.status !== 'ACTIVE') {
    const err = new Error('Client package is not active');
    err.code = 'PACKAGE_INACTIVE';
    throw err;
  }
  if (blockIfPendingPayment && cp.payment_status === 'PENDING') {
    const err = new Error('Payment required before scheduling');
    err.code = 'PAYMENT_PENDING';
    throw err;
  }
  const now = new Date();
  if (cp.expiry_date && new Date(cp.expiry_date) < now) {
    const err = new Error('Package has expired');
    err.code = 'PACKAGE_EXPIRED';
    throw err;
  }

  let session;
  if (sessionId) {
    session = await PackageSession.findOne({ _id: sessionId, clientPackageId: cp._id });
  } else if (sessionNumber != null) {
    session = await PackageSession.findOne({ clientPackageId: cp._id, sessionNumber });
  }
  if (!session) {
    const err = new Error('Package session not found');
    err.code = 'SESSION_NOT_FOUND';
    throw err;
  }
  if (session.status === 'completed') {
    const err = new Error('Session already completed');
    err.code = 'SESSION_DONE';
    throw err;
  }
  if (session.status === 'scheduled' && session.appointmentId) {
    const err = new Error('Session already scheduled; reschedule the linked appointment instead');
    err.code = 'ALREADY_SCHEDULED';
    throw err;
  }
  if (session.expiresAt && new Date(session.expiresAt) < now) {
    const err = new Error('Session line expired');
    err.code = 'SESSION_EXPIRED';
    throw err;
  }

  if (!serviceId) {
    const err = new Error('serviceId is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const start = parseSchedulingInstant(startAt);
  const end = parseSchedulingInstant(endAt);
  if (!start || !end || !(start < end)) {
    const err = new Error(
      'Invalid startAt or endAt (IST: use ...+05:30, or naive YYYY-MM-DDTHH:mm:ss for IST wall time)'
    );
    err.code = 'VALIDATION';
    throw err;
  }

  const unit = {
    serviceId,
    startAt,
    endAt,
    staffId,
    staffAssignments,
    createdBy,
    packageSessionId: session._id,
    price: 0,
    priceLockedAtBooking: 0
  };
  const n = unit.staffAssignments?.length
    ? unit.staffAssignments[0].staffId
    : unit.staffId;
  const within = await isSlotWithinAvailability(models, {
    branchId: cp.branchId,
    staffId: n,
    businessDoc,
    start,
    end
  });
  if (!opts.skipAvailability && !within.ok) {
    const err = new Error(within.reason || 'Outside availability');
    err.code = 'OUTSIDE_AVAILABILITY';
    err.details = within;
    throw err;
  }
  const c = await detectStaffConflict(models, {
    branchId: cp.branchId,
    staffId: n,
    start,
    end
  });
  if (c.conflict) {
    const err = new Error('Staff conflict');
    err.code = 'CONFLICT';
    err.details = c;
    throw err;
  }

  return createBooking(
    models,
    businessDoc,
    {
      branchId: cp.branchId,
      clientId: cp.client_id,
      type: 'package',
      paymentMode: 'per_appointment',
      paymentState: cp.payment_status === 'PAID' ? 'paid' : 'pending',
      packagePurchaseId: cp._id,
      units: [{ ...unit, packageSessionId: session._id }],
      metadata: { packageBooking: true }
    },
    { skipAvailability: true, ...opts }
  );
}

/**
 * Mark session missed (e.g. no-show). Does not cancel sibling sessions.
 * @param {boolean} resetToUnscheduled — if true, clear slot so client can reschedule this session only
 */
async function markSessionMissed(models, packageSessionId, { resetToUnscheduled = false } = {}) {
  const { PackageSession, Appointment } = models;
  const session = await PackageSession.findById(packageSessionId);
  if (!session) {
    const err = new Error('Session not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (session.appointmentId && Appointment) {
    const apt = await Appointment.findById(session.appointmentId);
    if (apt) {
      apt.status = 'missed';
      await apt.save();
    }
  }
  if (resetToUnscheduled) {
    session.status = 'unscheduled';
    session.appointmentId = null;
    session.scheduledStartAt = null;
    session.scheduledEndAt = null;
  } else {
    session.status = 'missed';
  }
  await session.save();
  return session;
}

module.exports = {
  ensureSessionsForClientPackage,
  listSessions,
  schedulePackageSession,
  markSessionMissed
};
