'use strict';

const {
  round2,
  countUnpaidLeaveDays,
  computeLeaveDeduction,
  computeAdvanceRecovery,
  buildDeductionNote,
  computeNet,
} = require('./payroll-calculator');

const PAYMENT_METHODS = ['cash', 'upi', 'bank', 'wallet'];

async function logPayrollAudit(businessModels, payload) {
  const { PayrollAuditLog } = businessModels;
  try {
    await PayrollAuditLog.create(payload);
  } catch (err) {
    // Non-blocking
    console.warn('[payroll-audit] failed:', err?.message || err);
  }
}

function diffFields(before, after, fields) {
  const changes = [];
  for (const field of fields) {
    const oldVal = before?.[field];
    const newVal = after?.[field];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field, oldValue: oldVal ?? null, newValue: newVal ?? null });
    }
  }
  return changes;
}

function serializeRecord(rec, extra = {}) {
  return {
    recordId: rec._id ? String(rec._id) : null,
    staffId: String(rec.staffId),
    staffName: rec.staffName || '',
    month: rec.month,
    baseSalary: rec.baseSalary || 0,
    incentive: rec.incentive || 0,
    bonus: rec.bonus || 0,
    overtimePay: rec.overtimePay || 0,
    latePenalty: rec.latePenalty || 0,
    deductions: rec.deductions || 0,
    leaveDeduction: rec.leaveDeduction || 0,
    unpaidLeaveDays: rec.unpaidLeaveDays || 0,
    advanceRecovery: rec.advanceRecovery || 0,
    manualDeductions: rec.manualDeductions ?? Math.max(
      0,
      round2((rec.deductions || 0) - (rec.leaveDeduction || 0) - (rec.advanceRecovery || 0))
    ),
    deductionNote: rec.deductionNote || '',
    netPay: rec.netPay || 0,
    status: rec.status || 'draft',
    paidAt: rec.paidAt || null,
    paymentMethod: rec.paymentMethod || '',
    notes: rec.notes || '',
    saved: true,
    ...extra,
  };
}

function buildVirtualRow({
  staff,
  month,
  computedIncentive,
  leaveDeduction,
  unpaidLeaveDays,
  advanceRecovery,
  manualDeductions,
  manualNote,
  resolvedRules,
  overtimePay = 0,
  latePenalty = 0,
}) {
  const rules = resolvedRules || null;
  const baseSalary = round2(rules ? rules.salary || 0 : staff.salary || 0);
  const incentive = computedIncentive;
  const formula = rules ? rules.salaryFormula : null;
  const rounding = rules ? rules.rounding : 'none';
  const otPay = round2(overtimePay);
  const latePen = round2(latePenalty);
  const deductions = round2(leaveDeduction + advanceRecovery + manualDeductions + latePen);
  const deductionNote = buildDeductionNote({
    leaveDeduction,
    unpaidLeaveDays,
    advanceRecovery,
    manualNote: manualNote || '',
  });

  return {
    recordId: null,
    staffId: String(staff._id),
    staffName: staff.name || '',
    role: staff.role || '',
    phone: staff.phone || '',
    month,
    baseSalary,
    incentive,
    bonus: 0,
    overtimePay: otPay,
    latePenalty: latePen,
    deductions,
    leaveDeduction,
    unpaidLeaveDays,
    advanceRecovery,
    manualDeductions,
    deductionNote,
    netPay: computeNet({
      baseSalary,
      incentive,
      bonus: 0,
      overtimePay: otPay,
      leaveDeduction,
      advanceRecovery,
      manualDeductions,
      latePenalty: latePen,
      formula,
      rounding,
    }),
    status: 'draft',
    paidAt: null,
    paymentMethod: '',
    notes: '',
    computedIncentive,
    saved: false,
  };
}

async function loadPayrollContext(businessModels, branchId, month, range) {
  const { Staff, PayrollRecord, StaffLeaveRecord, StaffAdvance, BusinessSettings, StaffAttendance } = businessModels;
  const { buildStaffIncentiveSummaryForRange } = require('./staff-incentive-monthly-data');
  const {
    mergeAttendancePayrollSettings,
    resolveStaffPayrollRules,
    resolveStaffShiftHoursForDay,
  } = require('./attendance-payroll-settings');
  const { evaluateDay, computeOvertimePay } = require('./attendance-evaluator');
  const { daysInMonth } = require('./payroll-calculator');

  const [staff, savedRecords, incentiveSummary, leaves, advances, settingsDoc, attendance] = await Promise.all([
    Staff.find({ branchId, isActive: true })
      .select('_id name salary role phone workSchedule shiftId payrollOverrides')
      .sort({ name: 1 })
      .lean(),
    PayrollRecord.find({ branchId, month }).lean(),
    buildStaffIncentiveSummaryForRange(businessModels, branchId, range).catch(() => ({ rows: [] })),
    StaffLeaveRecord.find({
      branchId,
      date: { $gte: range.startYmd, $lte: range.endYmd },
    }).lean(),
    StaffAdvance.find({ branchId, status: 'active' }).lean(),
    BusinessSettings ? BusinessSettings.findOne().select('attendancePayroll').lean() : Promise.resolve(null),
    StaffAttendance
      ? StaffAttendance.find({ branchId, date: { $gte: range.startYmd, $lte: range.endYmd } }).lean()
      : Promise.resolve([]),
  ]);

  const mergedSettings = mergeAttendancePayrollSettings(settingsDoc?.attendancePayroll);

  const attendanceByStaff = new Map();
  for (const rec of attendance || []) {
    const sid = String(rec.staffId);
    if (!attendanceByStaff.has(sid)) attendanceByStaff.set(sid, []);
    attendanceByStaff.get(sid).push(rec);
  }

  const incentiveByStaff = new Map(
    (incentiveSummary.rows || []).map((r) => [String(r.staffId), round2(r.totalCommission || 0)])
  );
  const profileBreakdownByStaff = new Map(
    (incentiveSummary.rows || []).map((r) => [String(r.staffId), r.profileBreakdown || []])
  );
  const savedByStaff = new Map(savedRecords.map((r) => [String(r.staffId), r]));

  const leavesByStaff = new Map();
  for (const lv of leaves) {
    const sid = String(lv.staffId);
    if (!leavesByStaff.has(sid)) leavesByStaff.set(sid, []);
    leavesByStaff.get(sid).push(lv);
  }

  const advancesByStaff = new Map();
  for (const adv of advances) {
    const sid = String(adv.staffId);
    if (!advancesByStaff.has(sid)) advancesByStaff.set(sid, []);
    advancesByStaff.get(sid).push(adv);
  }

  const dim = daysInMonth(month) || 30;

  const rows = staff.map((s) => {
    const staffId = String(s._id);
    const computedIncentive = incentiveByStaff.get(staffId) || 0;
    const saved = savedByStaff.get(staffId);
    const staffLeaves = leavesByStaff.get(staffId) || [];
    const unpaidLeaveDays = countUnpaidLeaveDays(staffLeaves);
    const resolvedRules = resolveStaffPayrollRules(mergedSettings, s);
    const salaryForLeave = resolvedRules.salary || s.salary || 0;
    const leaveDeduction = computeLeaveDeduction(salaryForLeave, month, unpaidLeaveDays);
    const advanceRecovery = computeAdvanceRecovery(advancesByStaff.get(staffId) || [], month);

    if (saved) {
      const row = serializeRecord(saved, {
        role: s.role || '',
        phone: s.phone || '',
        computedIncentive,
        profileBreakdown: profileBreakdownByStaff.get(staffId) || [],
      });
      // Pending payroll rows refresh live commission + current-cycle auto deductions
      if (saved.status !== 'paid') {
        const manualDeductions = row.manualDeductions ?? 0;
        const freshAdvanceRecovery = advanceRecovery;
        const manualNote = String(row.deductionNote || '')
          .split(';')
          .map((p) => p.trim())
          .filter((p) => p && !p.startsWith('LWP:') && !p.startsWith('Advance recovery'))
          .join('; ');
        row.incentive = computedIncentive;
        row.leaveDeduction = leaveDeduction;
        row.unpaidLeaveDays = unpaidLeaveDays;
        row.advanceRecovery = freshAdvanceRecovery;
        row.deductions = round2(leaveDeduction + freshAdvanceRecovery + manualDeductions + (row.latePenalty || 0));
        row.deductionNote = buildDeductionNote({
          leaveDeduction,
          unpaidLeaveDays,
          advanceRecovery: freshAdvanceRecovery,
          manualNote,
        });
        row.netPay = computeNet({
          baseSalary: row.baseSalary,
          incentive: computedIncentive,
          bonus: row.bonus,
          overtimePay: row.overtimePay,
          leaveDeduction,
          advanceRecovery: freshAdvanceRecovery,
          manualDeductions,
          latePenalty: row.latePenalty,
          formula: resolvedRules.salaryFormula,
          rounding: resolvedRules.rounding,
        });
      }
      return row;
    }

    // Late penalty + overtime derived from attendance when the rules enable them.
    let overtimePay = 0;
    let latePenalty = 0;
    const staffAttendance = attendanceByStaff.get(staffId) || [];
    if (staffAttendance.length > 0) {
      const hourlyRate = dim > 0 ? salaryForLeave / dim / 8 : 0;
      let lateDays = 0;
      let overtimeMinutes = 0;
      for (const rec of staffAttendance) {
        const dow = new Date(`${rec.date}T12:00:00+05:30`).getDay();
        const staffSchedule = resolveStaffShiftHoursForDay(s, dow, mergedSettings);
        const evalResult = evaluateDay({
          checkInAt: rec.checkInAt,
          checkOutAt: rec.checkOutAt,
          rules: mergedSettings,
          staffSchedule: staffSchedule || undefined,
        });
        if (evalResult.status === 'late') lateDays += 1;
        overtimeMinutes += evalResult.overtimeMinutes || 0;
      }
      if (resolvedRules.lateDeductionEnabled && mergedSettings.payroll.latePenaltyPerDay > 0) {
        latePenalty = round2(lateDays * mergedSettings.payroll.latePenaltyPerDay);
      }
      if (resolvedRules.overtimeEnabled && mergedSettings.payroll.components.overtime) {
        overtimePay = computeOvertimePay(overtimeMinutes, mergedSettings.attendance.overtime, hourlyRate);
      }
    }

    return buildVirtualRow({
      staff: s,
      month,
      computedIncentive,
      leaveDeduction,
      unpaidLeaveDays,
      advanceRecovery,
      manualDeductions: 0,
      manualNote: '',
      resolvedRules,
      overtimePay,
      latePenalty,
    });
  });

  // Attach breakdown to virtual rows too
  for (const row of rows) {
    if (!row.profileBreakdown) {
      row.profileBreakdown = profileBreakdownByStaff.get(row.staffId) || [];
    }
    if (!row.phone) {
      const st = staff.find((x) => String(x._id) === row.staffId);
      row.phone = st?.phone || '';
    }
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.baseSalary += r.baseSalary || 0;
      acc.incentive += r.incentive || 0;
      acc.bonus += r.bonus || 0;
      acc.overtimePay += r.overtimePay || 0;
      acc.deductions += r.deductions || 0;
      acc.leaveDeduction += r.leaveDeduction || 0;
      acc.advanceRecovery += r.advanceRecovery || 0;
      acc.netPay += r.netPay || 0;
      if (r.status === 'paid') {
        acc.paidCount += 1;
        acc.paidNet += r.netPay || 0;
      } else {
        acc.pendingNet += r.netPay || 0;
      }
      return acc;
    },
    {
      staffCount: rows.length,
      baseSalary: 0,
      incentive: 0,
      bonus: 0,
      overtimePay: 0,
      deductions: 0,
      leaveDeduction: 0,
      advanceRecovery: 0,
      netPay: 0,
      paidCount: 0,
      paidNet: 0,
      pendingNet: 0,
    }
  );

  Object.keys(totals).forEach((k) => {
    if (typeof totals[k] === 'number') totals[k] = round2(totals[k]);
  });
  totals.staffCount = rows.length;
  totals.paidCount = rows.filter((r) => r.status === 'paid').length;

  return {
    rows,
    totals,
    staff,
    leavesByStaff,
    advancesByStaff,
    settings: mergedSettings,
    payoutLabel: buildPayoutLabel(mergedSettings.payroll),
  };
}

/** Human-readable payout date label from payroll settings. */
function buildPayoutLabel(payroll) {
  if (!payroll) return '';
  switch (payroll.payoutDate) {
    case 'last_day':
      return 'Paid on the last day of the month';
    case '1':
      return 'Paid on the 1st of the month';
    case '5':
      return 'Paid on the 5th of the month';
    case 'custom':
      return `Paid on day ${payroll.customDay} of the month`;
    default:
      return '';
  }
}

module.exports = {
  PAYMENT_METHODS,
  logPayrollAudit,
  diffFields,
  serializeRecord,
  buildVirtualRow,
  loadPayrollContext,
  round2,
  computeNet,
  buildDeductionNote,
  computeLeaveDeduction,
  computeAdvanceRecovery,
  countUnpaidLeaveDays,
};
