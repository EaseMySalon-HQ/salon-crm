const mongoose = require('mongoose');
const { detectStaffConflict } = require('./conflict-detector');
const { syncLegacyDatetimeFromUtc } = require('./scheduling-utils');
const { isSlotWithinAvailability } = require('./availability-engine');
const { ACTIVE_APPOINTMENT_STATUSES } = require('./scheduling-utils');
const { toDateStringIST, parseSchedulingInstant, toIsoStringIST } = require('../../utils/date-utils');

function txnUnsupported(err) {
  return (
    (err?.message && String(err.message).includes('replica set')) ||
    err?.code === 20 ||
    err?.codeName === 'IllegalOperation'
  );
}

/**
 * @param {import('mongoose').Model} rootModel — any model on same connection
 * @param {Function} fn — async (session | null) => any
 */
async function withOptionalTransaction(rootModel, fn) {
  const session = await rootModel.db.startSession();
  try {
    await session.withTransaction(async () => {
      await fn(session);
    });
  } catch (e) {
    if (txnUnsupported(e)) {
      await fn(null);
      return;
    }
    throw e;
  } finally {
    await session.endSession();
  }
}

/** Normalize staff payload to staffAssignments + legacy staffId */
function normalizeStaff(unit) {
  if (unit.staffAssignments?.length) {
    const total = unit.staffAssignments.reduce((s, a) => s + (a.percentage || 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      const err = new Error('Staff assignment percentages must add up to 100%');
      err.code = 'BAD_STAFF_SPLIT';
      throw err;
    }
    return {
      staffAssignments: unit.staffAssignments,
      staffId: unit.staffId || unit.staffAssignments[0]?.staffId
    };
  }
  if (unit.staffId) {
    return {
      staffId: unit.staffId,
      staffAssignments: [{ staffId: unit.staffId, percentage: 100, role: 'primary' }]
    };
  }
  const err = new Error('Either staffId or staffAssignments is required');
  err.code = 'STAFF_REQUIRED';
  throw err;
}

/**
 * @param {object} models
 * @param {object} businessDoc — Business lean (main DB) for hours
 * @param {object} payload
 * @param {object} [opts] — { skipAvailability?: boolean, session?: ClientSession, useTransaction?: boolean, skipHoldConflict?: boolean }
 *        skipHoldConflict: true — do not treat BookingHold soft locks as conflicts (staff scheduling; online booking can omit this later).
 */
async function createBooking(models, businessDoc, payload, opts = {}) {
  const {
    Booking,
    Appointment,
    Service,
    PackageSession,
    BookingHold
  } = models;
  const {
    branchId,
    clientId,
    type,
    paymentMode = 'per_appointment',
    paymentState = 'pending',
    packagePaymentCollected = false,
    packagePurchaseId,
    holdIdsToConsume = [],
    metadata = {}
  } = payload;
  let { units } = payload;

  const shouldPrepayAtBooking =
    !!packagePaymentCollected && paymentMode === 'full_upfront';
  const effectivePaymentState = shouldPrepayAtBooking ? 'paid' : paymentState;

  if (!branchId || !clientId || !type || !Array.isArray(units) || units.length === 0) {
    const err = new Error('branchId, clientId, type, and units[] are required');
    err.code = 'VALIDATION';
    throw err;
  }

  const primaryStaffFromUnit = (u) => {
    const n = normalizeStaff(u);
    const primary = n.staffAssignments.find((a) => a.role === 'primary') || n.staffAssignments[0];
    return primary.staffId;
  };

  if (holdIdsToConsume.length && !BookingHold) {
    const err = new Error('BookingHold model not available');
    err.code = 'CONFIG';
    throw err;
  }
  for (const hId of holdIdsToConsume) {
    const hold = await BookingHold.findById(hId);
    if (!hold || hold.expiresAt <= new Date()) {
      const err = new Error('Invalid or expired hold');
      err.code = 'HOLD_INVALID';
      throw err;
    }
  }

  const isRecurring = units.length > 1;
  const skippedDates = [];
  const validUnits = [];

  for (const unit of units) {
    const staffId = primaryStaffFromUnit(unit);
    const start = parseSchedulingInstant(unit.startAt);
    const end = parseSchedulingInstant(unit.endAt);
    if (!start || !end || !(start < end)) {
      const err = new Error(
        'Each unit needs valid startAt and endAt (IST: use ...+05:30, or naive YYYY-MM-DDTHH:mm:ss for IST wall time)'
      );
      err.code = 'VALIDATION';
      throw err;
    }
    if (!opts.skipAvailability) {
      const within = await isSlotWithinAvailability(models, {
        branchId,
        staffId,
        businessDoc,
        start,
        end
      });
      if (!within.ok) {
        if (isRecurring && within.reason === 'closed') {
          skippedDates.push(toDateStringIST(start));
          continue;
        }
        const dateStr = toDateStringIST(start);
        const reason = within.reason === 'closed'
          ? `The business or staff is closed on ${dateStr}`
          : within.reason || 'Slot outside availability';
        const err = new Error(reason);
        err.code = 'OUTSIDE_AVAILABILITY';
        err.details = { ...within, date: dateStr };
        throw err;
      }
    }
    const c = await detectStaffConflict(models, {
      branchId,
      staffId,
      start,
      end,
      skipHoldCheck: opts.skipHoldConflict === true
    });
    if (c.conflict) {
      const err = new Error('Staff conflict');
      err.code = 'CONFLICT';
      err.details = c;
      throw err;
    }
    validUnits.push(unit);
  }

  if (validUnits.length === 0) {
    const err = new Error(
      `All dates fall on closed days (skipped: ${skippedDates.join(', ')})`
    );
    err.code = 'OUTSIDE_AVAILABILITY';
    err.details = { skippedDates };
    throw err;
  }

  units = validUnits;

  /** Single insert avoids a second save inside transactions (some drivers report matchedCount 0 on the follow-up update → DocumentNotFoundError). */
  const bookingId = new mongoose.Types.ObjectId();
  const booking = new Booking({
    _id: bookingId,
    branchId,
    clientId,
    type,
    status: 'confirmed',
    paymentMode,
    paymentState: effectivePaymentState,
    packagePurchaseId: packagePurchaseId || null,
    metadata,
    bookingGroupId: bookingId.toString()
  });

  const saveOps = async (session) => {
    const sOpt = session ? { session } : {};
    await booking.save(sOpt);

    const appointmentIds = [];
    const packageSessionSnapshots = [];

    try {
      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        const staff = normalizeStaff(unit);
        let serviceQ = Service.findById(unit.serviceId);
        if (session) serviceQ = serviceQ.session(session);
        const service = await serviceQ;
        const price = unit.price != null ? unit.price : service?.price ?? 0;
        const startAt = parseSchedulingInstant(unit.startAt);
        const endAt = parseSchedulingInstant(unit.endAt);

        const doc = {
          clientId,
          serviceId: unit.serviceId,
          additionalServiceIds: unit.additionalServiceIds || [],
          ...staff,
          branchId,
          status: unit.status || 'scheduled',
          notes: unit.notes || '',
          leadSource: unit.leadSource || '',
          createdBy: unit.createdBy || '',
          price,
          priceLockedAtBooking: unit.priceLockedAtBooking != null ? unit.priceLockedAtBooking : price,
          bookingGroupId: booking.bookingGroupId,
          parentBookingId: booking._id,
          startAt,
          endAt,
          packageSessionId: unit.packageSessionId || null,
          addOnLineItems: unit.addOnLineItems || [],
          prepaidAtBooking: shouldPrepayAtBooking
        };
        syncLegacyDatetimeFromUtc(doc);
        const apt = new Appointment(doc);
        try {
          await apt.save(sOpt);
        } catch (e) {
          if (e && (e.code === 11000 || e.codeName === 'DuplicateKey' || /duplicate key/i.test(String(e.message || '')))) {
            const err = new Error('Staff conflict');
            err.code = 'CONFLICT';
            throw err;
          }
          throw e;
        }
        appointmentIds.push(apt._id);

        if (unit.packageSessionId && PackageSession) {
          const psBefore = await PackageSession.findById(unit.packageSessionId).lean();
          packageSessionSnapshots.push({ id: unit.packageSessionId, before: psBefore });
          await PackageSession.findByIdAndUpdate(
            unit.packageSessionId,
            {
              status: 'scheduled',
              appointmentId: apt._id,
              scheduledStartAt: startAt,
              scheduledEndAt: endAt
            },
            sOpt
          );
        }
      }

      if (BookingHold) {
        for (const hId of holdIdsToConsume) {
          await BookingHold.deleteOne({ _id: hId }, sOpt);
        }
      }

      return { booking, appointmentIds, skippedDates };
    } catch (rollbackErr) {
      if (appointmentIds.length) {
        await Appointment.deleteMany({ _id: { $in: appointmentIds } }, sOpt);
      }
      await Booking.deleteOne({ _id: booking._id }, sOpt);
      if (PackageSession && packageSessionSnapshots.length) {
        for (const snap of packageSessionSnapshots) {
          if (!snap.before) continue;
          await PackageSession.updateOne(
            { _id: snap.id },
            {
              $set: {
                status: snap.before.status,
                appointmentId: snap.before.appointmentId,
                scheduledStartAt: snap.before.scheduledStartAt,
                scheduledEndAt: snap.before.scheduledEndAt
              }
            },
            sOpt
          );
        }
      }
      throw rollbackErr;
    }
  };

  if (opts.session) {
    return saveOps(opts.session);
  }
  // Default: no multi-doc transaction. Mongoose save() inside withTransaction can
  // spuriously report matchedCount 0 (DocumentNotFoundError on Booking/Appointment).
  // Concurrency is enforced via Appointment.slotKey unique index + conflict checks.
  if (opts.useTransaction) {
    let result;
    await withOptionalTransaction(Booking, async (session) => {
      result = await saveOps(session);
    });
    return result;
  }
  return saveOps(null);
}

function formatBookingDetailsForApi(raw) {
  if (!raw) return null;
  const { booking, appointments, packageSessions } = raw;
  const iso = (d) => (d == null ? null : toIsoStringIST(d));
  const b = { ...booking };
  if (b.createdAt) b.createdAt = iso(b.createdAt);
  if (b.updatedAt) b.updatedAt = iso(b.updatedAt);
  const apts = (appointments || []).map((a) => ({
    ...a,
    startAt: iso(a.startAt),
    endAt: iso(a.endAt),
    createdAt: a.createdAt != null ? iso(a.createdAt) : undefined,
    updatedAt: a.updatedAt != null ? iso(a.updatedAt) : undefined
  }));
  const pss = (packageSessions || []).map((ps) => ({
    ...ps,
    scheduledStartAt: iso(ps.scheduledStartAt),
    scheduledEndAt: iso(ps.scheduledEndAt),
    expiresAt: iso(ps.expiresAt),
    createdAt: ps.createdAt != null ? iso(ps.createdAt) : undefined,
    updatedAt: ps.updatedAt != null ? iso(ps.updatedAt) : undefined
  }));
  return { booking: b, appointments: apts, packageSessions: pss, timezone: 'Asia/Kolkata' };
}

async function getBookingDetails(models, bookingId) {
  const { Booking, Appointment, PackageSession } = models;
  const b = await Booking.findById(bookingId).lean();
  if (!b) return null;
  const appointments = await Appointment.find({ parentBookingId: bookingId })
    .sort({ startAt: 1, date: 1, time: 1 })
    .lean();
  let packageSessions = [];
  if (b.packagePurchaseId && PackageSession) {
    packageSessions = await PackageSession.find({ clientPackageId: b.packagePurchaseId }).sort({ sessionNumber: 1 }).lean();
  }
  return formatBookingDetailsForApi({ booking: b, appointments, packageSessions });
}

/**
 * @param {'this'|'all_future'} scope
 */
async function rescheduleAppointment(models, businessDoc, appointmentId, { scope, startAt, endAt, skipAvailability }, opts = {}) {
  const { Appointment } = models;
  const start = parseSchedulingInstant(startAt);
  const end = parseSchedulingInstant(endAt);
  if (!start || !end || !(start < end)) {
    const err = new Error(
      'Invalid startAt or endAt (IST: use ...+05:30, or naive YYYY-MM-DDTHH:mm:ss for IST wall time)'
    );
    err.code = 'VALIDATION';
    throw err;
  }

  const pre = await Appointment.findById(appointmentId).select('parentBookingId').lean();
  if (!pre || !pre.parentBookingId) {
    const err = new Error('Appointment not found or not linked to a parent booking');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const saveOps = async (session) => {
    let q = Appointment.findById(appointmentId);
    if (session) q = q.session(session);
    const aptInTxn = await q;
    if (!aptInTxn || !aptInTxn.parentBookingId) {
      const err = new Error('Appointment not found or not linked to a parent booking');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const primaryStaff = (a) =>
      (typeof a.getPrimaryStaff === 'function' ? a.getPrimaryStaff() : null) ||
      a.staffId ||
      a.staffAssignments?.[0]?.staffId;

    const runOne = async (a, windowStart, windowEnd, sess) => {
      const sOpt = sess ? { session: sess } : {};
      const sid = primaryStaff(a);
      const c = await detectStaffConflict(models, {
        branchId: a.branchId,
        staffId: sid,
        start: windowStart,
        end: windowEnd,
        excludeAppointmentId: a._id
      });
      if (c.conflict) {
        const err = new Error('Staff conflict');
        err.code = 'CONFLICT';
        err.details = c;
        throw err;
      }
      if (!skipAvailability) {
        const within = await isSlotWithinAvailability(models, {
          branchId: a.branchId,
          staffId: sid,
          businessDoc,
          start: windowStart,
          end: windowEnd
        });
        if (!within.ok) {
          const err = new Error(within.reason || 'Outside availability');
          err.code = 'OUTSIDE_AVAILABILITY';
          throw err;
        }
      }
      a.startAt = windowStart;
      a.endAt = windowEnd;
      syncLegacyDatetimeFromUtc(a);
      await a.save(sOpt);
      const { PackageSession } = models;
      if (a.packageSessionId && PackageSession) {
        await PackageSession.findByIdAndUpdate(
          a.packageSessionId,
          { scheduledStartAt: windowStart, scheduledEndAt: windowEnd },
          sOpt
        );
      }
    };

    if (scope === 'this') {
      await runOne(aptInTxn, start, end, session);
      return { updated: 1 };
    }

    const now = new Date();
    let sibQ = Appointment.find({
      parentBookingId: aptInTxn.parentBookingId,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      $or: [
        { startAt: { $gte: now } },
        { startAt: null, date: { $gte: toDateStringIST(now) } }
      ]
    });
    if (session) sibQ = sibQ.session(session);
    const siblings = await sibQ;

    const toMove = siblings.filter((s) => {
      const t = s.startAt ? new Date(s.startAt) : null;
      if (t) return t >= now;
      return s._id.equals(aptInTxn._id);
    });

    const delta = start.getTime() - (aptInTxn.startAt ? new Date(aptInTxn.startAt).getTime() : 0);
    for (const a of toMove) {
      const baseStart = a.startAt ? new Date(a.startAt) : start;
      const baseEnd = a.endAt ? new Date(a.endAt) : end;
      let ns;
      let ne;
      if (a._id.equals(aptInTxn._id)) {
        ns = start;
        ne = end;
      } else {
        ns = new Date(baseStart.getTime() + delta);
        ne = new Date(baseEnd.getTime() + delta);
      }
      const sid = primaryStaff(a);
      const c = await detectStaffConflict(models, {
        branchId: a.branchId,
        staffId: sid,
        start: ns,
        end: ne,
        excludeAppointmentId: a._id
      });
      if (c.conflict) {
        const err = new Error('Staff conflict');
        err.code = 'CONFLICT';
        throw err;
      }
      a.startAt = ns;
      a.endAt = ne;
      syncLegacyDatetimeFromUtc(a);
      await a.save(session ? { session } : {});
      if (a.packageSessionId && models.PackageSession) {
        await models.PackageSession.findByIdAndUpdate(a.packageSessionId, {
          scheduledStartAt: ns,
          scheduledEndAt: ne
        }, session ? { session } : {});
      }
    }
    return { updated: toMove.length };
  };

  if (opts.session) {
    return saveOps(opts.session);
  }
  if (opts.useTransaction) {
    let out;
    await withOptionalTransaction(Appointment, async (session) => {
      out = await saveOps(session);
    });
    return out;
  }
  return saveOps(null);
}

/**
 * @param {'this'|'all_future'} scope
 */
async function cancelAppointment(models, appointmentId, { scope, reason }) {
  const { Appointment, Booking, PackageSession } = models;
  const apt = await Appointment.findById(appointmentId);
  if (!apt) {
    const err = new Error('Appointment not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const markCancelled = async (a) => {
    a.status = 'cancelled';
    if (reason) a.notes = (a.notes ? `${a.notes}\n` : '') + `[cancel] ${reason}`;
    await a.save();
    if (a.packageSessionId && PackageSession) {
      await PackageSession.findByIdAndUpdate(a.packageSessionId, {
        status: 'unscheduled',
        appointmentId: null,
        scheduledStartAt: null,
        scheduledEndAt: null
      });
    }
  };

  if (scope === 'this' || !apt.parentBookingId) {
    await markCancelled(apt);
    return { cancelled: 1 };
  }

  const now = new Date();
  const siblings = await Appointment.find({
    parentBookingId: apt.parentBookingId,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES }
  });

  let n = 0;
  for (const a of siblings) {
    const t = a.startAt ? new Date(a.startAt) : null;
    const future = t ? t >= now : true;
    if (future) {
      await markCancelled(a);
      n++;
    }
  }

  if (Booking && n > 0) {
    const remaining = await Appointment.countDocuments({
      parentBookingId: apt.parentBookingId,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES }
    });
    if (remaining === 0) {
      await Booking.findByIdAndUpdate(apt.parentBookingId, { status: 'cancelled' });
    }
  }

  return { cancelled: n };
}

async function createSlotHold(models, payload) {
  const { BookingHold } = models;
  if (!BookingHold) {
    const err = new Error('BookingHold model not available');
    err.code = 'CONFIG';
    throw err;
  }
  const { branchId, clientId, staffId, startAt, endAt, ttlMinutes = 5, createdBy = '', bookingId = null } = payload;
  const start = parseSchedulingInstant(startAt);
  const end = parseSchedulingInstant(endAt);
  if (!start || !end || !(start < end)) {
    const err = new Error(
      'Invalid startAt or endAt (IST: use ...+05:30, or naive YYYY-MM-DDTHH:mm:ss for IST wall time)'
    );
    err.code = 'VALIDATION';
    throw err;
  }
  const c = await detectStaffConflict(models, { branchId, staffId, start, end });
  if (c.conflict) {
    const err = new Error('Staff conflict');
    err.code = 'CONFLICT';
    err.details = c;
    throw err;
  }
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const hold = await BookingHold.create({
    branchId,
    clientId,
    staffId,
    startAt: start,
    endAt: end,
    expiresAt,
    bookingId,
    createdBy
  });
  return hold;
}

function formatHoldForApi(hold) {
  const h = hold.toObject ? hold.toObject() : { ...hold };
  return {
    holdId: h._id,
    ...h,
    startAt: toIsoStringIST(h.startAt),
    endAt: toIsoStringIST(h.endAt),
    expiresAt: toIsoStringIST(h.expiresAt),
    timezone: 'Asia/Kolkata'
  };
}

module.exports = {
  withOptionalTransaction,
  createBooking,
  getBookingDetails,
  rescheduleAppointment,
  cancelAppointment,
  createSlotHold,
  formatHoldForApi
};
