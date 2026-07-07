/**
 * Frontend types + merge for Attendance & Payroll settings.
 * Mirrors backend/lib/attendance-payroll-settings.js. Keep both in sync.
 */

export type SalaryCycle = "monthly" | "weekly" | "biweekly"
export type PayoutDate = "last_day" | "1" | "5" | "custom"
export type CommissionCalculateOn = "before_discount" | "after_discount"
export type CommissionPayableWhen = "on_sale" | "on_payment" | "on_service_completion"
export type OvertimeRateType = "fixed_per_hour" | "multiplier"
export type RoundingMode = "1" | "5" | "10" | "none"
export type WeeklyOffDay = number | "custom"

export interface PayrollComponents {
  fixedSalary: boolean
  commission: boolean
  bonus: boolean
  incentives: boolean
  overtime: boolean
  deductions: boolean
  reimbursements: boolean
}

export interface CommissionSettings {
  onServiceSales: boolean
  onProductSales: boolean
  onMembershipSales: boolean
  onPackageSales: boolean
  calculateOn: CommissionCalculateOn
  payableWhen: CommissionPayableWhen
}

export interface BonusDeductionSettings {
  allowManualBonus: boolean
  allowManualDeduction: boolean
  requireDeductionReason: boolean
}

export interface PayrollSettings {
  salaryCycle: SalaryCycle
  payoutDate: PayoutDate
  customDay: number
  components: PayrollComponents
  commission: CommissionSettings
  bonusDeductions: BonusDeductionSettings
  rounding: RoundingMode
  latePenaltyPerDay: number
}

export interface OfficeHours {
  open: string
  close: string
}

export interface HalfDayRules {
  lateBeyondMinutes: number
  workedLessThanHours: number
}

export interface AbsentRules {
  workedLessThanHours: number
}

export interface OvertimeSettings {
  enabled: boolean
  minimumMinutes: number
  rateType: OvertimeRateType
  fixedAmount: number
  multiplier: number
}

export interface LeaveSettings {
  paidLeavePerMonth: number
  casualLeavePerMonth: number
  sickLeavePerMonth: number
  unpaidLeaveAllowed: boolean
  weeklyOffDay: WeeklyOffDay
}

export interface ShiftTemplate {
  id: string
  name: string
  startTime: string
  endTime: string
}

export interface AttendanceSettings {
  workingDays: boolean[]
  officeHours: OfficeHours
  gracePeriodMinutes: number
  halfDayRules: HalfDayRules
  absentRules: AbsentRules
  overtime: OvertimeSettings
  leave: LeaveSettings
  shifts: ShiftTemplate[]
}

export interface SalaryFormula {
  fixedSalary: boolean
  commission: boolean
  incentives: boolean
  bonus: boolean
  overtime: boolean
  leaveDeductions: boolean
  latePenalties: boolean
  advanceRecovery: boolean
  manualDeductions: boolean
}

export interface AttendancePayrollSettings {
  payroll: PayrollSettings
  attendance: AttendanceSettings
  salaryFormula: SalaryFormula
}

export const DEFAULT_SHIFTS: ShiftTemplate[] = [
  { id: "morning", name: "Morning", startTime: "10:00", endTime: "18:00" },
  { id: "general", name: "General", startTime: "11:00", endTime: "20:00" },
  { id: "evening", name: "Evening", startTime: "13:00", endTime: "21:00" },
]

export const DEFAULT_ATTENDANCE_PAYROLL_SETTINGS: AttendancePayrollSettings = {
  payroll: {
    salaryCycle: "monthly",
    payoutDate: "last_day",
    customDay: 1,
    components: {
      fixedSalary: true,
      commission: true,
      bonus: true,
      incentives: true,
      overtime: false,
      deductions: true,
      reimbursements: false,
    },
    commission: {
      onServiceSales: true,
      onProductSales: true,
      onMembershipSales: false,
      onPackageSales: false,
      calculateOn: "before_discount",
      payableWhen: "on_sale",
    },
    bonusDeductions: {
      allowManualBonus: true,
      allowManualDeduction: true,
      requireDeductionReason: true,
    },
    rounding: "none",
    latePenaltyPerDay: 0,
  },
  attendance: {
    workingDays: [true, true, true, true, true, true, true],
    officeHours: { open: "10:00", close: "20:00" },
    gracePeriodMinutes: 10,
    halfDayRules: { lateBeyondMinutes: 60, workedLessThanHours: 4 },
    absentRules: { workedLessThanHours: 2 },
    overtime: {
      enabled: false,
      minimumMinutes: 30,
      rateType: "multiplier",
      fixedAmount: 0,
      multiplier: 1.5,
    },
    leave: {
      paidLeavePerMonth: 1,
      casualLeavePerMonth: 1,
      sickLeavePerMonth: 1,
      unpaidLeaveAllowed: true,
      weeklyOffDay: 0,
    },
    shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })),
  },
  salaryFormula: {
    fixedSalary: true,
    commission: true,
    incentives: true,
    bonus: true,
    overtime: false,
    leaveDeductions: true,
    latePenalties: false,
    advanceRecovery: true,
    manualDeductions: true,
  },
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback
}

function num(v: unknown, fallback: number, min?: number, max?: number): number {
  let n = Number(v)
  if (!Number.isFinite(n)) return fallback
  if (typeof min === "number") n = Math.max(min, n)
  if (typeof max === "number") n = Math.min(max, n)
  return n
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)) return value
  return fallback
}

function slugifyShiftId(name: string): string {
  const base = String(name || "shift")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return base || "shift"
}

export function normalizeShifts(value: unknown, fallback: ShiftTemplate[] = DEFAULT_SHIFTS): ShiftTemplate[] {
  if (!Array.isArray(value)) return fallback.map((s) => ({ ...s }))
  const out: ShiftTemplate[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Partial<ShiftTemplate>
    const name = String(row.name || "").trim().slice(0, 80)
    if (!name) continue
    const startTime = normalizeTime(row.startTime, "09:00")
    const endTime = normalizeTime(row.endTime, "18:00")
    if (startTime >= endTime) continue
    let id = String(row.id || "").trim().slice(0, 64)
    if (!id) id = slugifyShiftId(name)
    let uniqueId = id
    let n = 2
    while (seen.has(uniqueId)) {
      uniqueId = `${id}-${n++}`
    }
    seen.add(uniqueId)
    out.push({ id: uniqueId, name, startTime, endTime })
  }
  return out.length ? out : fallback.map((s) => ({ ...s }))
}

export function findShiftById(shifts: ShiftTemplate[] | undefined, shiftId?: string | null): ShiftTemplate | null {
  const id = String(shiftId || "").trim()
  if (!id) return null
  return (shifts || []).find((s) => s.id === id) || null
}

export function applyShiftToWorkSchedule<T extends { day: number; enabled?: boolean; startTime?: string; endTime?: string }>(
  workSchedule: T[] | undefined,
  shift: ShiftTemplate | null
): T[] {
  if (!shift) return workSchedule || []
  const defaultRow = (day: number) =>
    ({
      day,
      enabled: true,
      startTime: shift.startTime,
      endTime: shift.endTime,
    }) as T
  const base = workSchedule?.length
    ? workSchedule
    : Array.from({ length: 7 }, (_, day) => defaultRow(day))
  return base.map((row) => {
    if (row.enabled === false) return row
    return {
      ...row,
      enabled: row.enabled !== false,
      startTime: shift.startTime,
      endTime: shift.endTime,
    }
  })
}

export function formatShiftTimeRange(startTime: string, endTime: string): string {
  const fmt = (t: string) => {
    const [hStr, mStr] = t.split(":")
    const h = parseInt(hStr || "0", 10)
    const m = parseInt(mStr || "0", 10)
    const ampm = h >= 12 ? "PM" : "AM"
    const hour12 = h % 12 || 12
    return m ? `${hour12}:${String(m).padStart(2, "0")} ${ampm}` : `${hour12} ${ampm}`
  }
  return `${fmt(startTime)} – ${fmt(endTime)}`
}

export function syncStaffScheduleWithShift<
  T extends { day: number; enabled?: boolean; startTime?: string; endTime?: string },
>(
  payload: { shiftId?: string; workSchedule?: T[] },
  mergedSettings: AttendancePayrollSettings
): { shiftId: string; workSchedule: T[] } {
  const shiftId = String(payload?.shiftId || "").trim()
  const shift = findShiftById(mergedSettings.attendance.shifts, shiftId)
  let workSchedule = Array.isArray(payload?.workSchedule) ? payload.workSchedule : []
  if (shift) {
    if (workSchedule.length === 0) {
      workSchedule = Array.from({ length: 7 }, (_, day) => ({
        day,
        enabled: true,
        startTime: shift.startTime,
        endTime: shift.endTime,
      })) as T[]
    } else {
      workSchedule = applyShiftToWorkSchedule(workSchedule, shift)
    }
    return { shiftId: shift.id, workSchedule }
  }
  return { shiftId: "", workSchedule }
}

/** Merge partial/raw settings onto defaults so the UI always has a full object. */
export function mergeAttendancePayrollSettings(
  raw?: Partial<AttendancePayrollSettings> | null
): AttendancePayrollSettings {
  const d = DEFAULT_ATTENDANCE_PAYROLL_SETTINGS
  const r = (raw || {}) as Partial<AttendancePayrollSettings>
  const rp = (r.payroll || {}) as Partial<PayrollSettings>
  const ra = (r.attendance || {}) as Partial<AttendanceSettings>
  const rf = (r.salaryFormula || {}) as Partial<SalaryFormula>

  const workingDays =
    Array.isArray(ra.workingDays) && ra.workingDays.length === 7
      ? ra.workingDays.map((v, i) => bool(v, d.attendance.workingDays[i]))
      : [...d.attendance.workingDays]

  return {
    payroll: {
      salaryCycle: pickEnum(rp.salaryCycle, ["monthly", "weekly", "biweekly"], d.payroll.salaryCycle),
      payoutDate: pickEnum(rp.payoutDate, ["last_day", "1", "5", "custom"], d.payroll.payoutDate),
      customDay: num(rp.customDay, d.payroll.customDay, 1, 28),
      components: { ...d.payroll.components, ...(rp.components || {}) },
      commission: { ...d.payroll.commission, ...(rp.commission || {}) },
      bonusDeductions: { ...d.payroll.bonusDeductions, ...(rp.bonusDeductions || {}) },
      rounding: pickEnum(rp.rounding, ["1", "5", "10", "none"], d.payroll.rounding),
      latePenaltyPerDay: num(rp.latePenaltyPerDay, d.payroll.latePenaltyPerDay, 0),
    },
    attendance: {
      workingDays,
      officeHours: { ...d.attendance.officeHours, ...(ra.officeHours || {}) },
      gracePeriodMinutes: num(ra.gracePeriodMinutes, d.attendance.gracePeriodMinutes, 0, 120),
      halfDayRules: { ...d.attendance.halfDayRules, ...(ra.halfDayRules || {}) },
      absentRules: { ...d.attendance.absentRules, ...(ra.absentRules || {}) },
      overtime: { ...d.attendance.overtime, ...(ra.overtime || {}) },
      leave: { ...d.attendance.leave, ...(ra.leave || {}) },
      shifts: normalizeShifts(ra.shifts, d.attendance.shifts),
    },
    salaryFormula: {
      fixedSalary: bool(rf.fixedSalary, d.salaryFormula.fixedSalary),
      commission: bool(rf.commission, d.salaryFormula.commission),
      incentives: bool(rf.incentives, d.salaryFormula.incentives),
      bonus: bool(rf.bonus, d.salaryFormula.bonus),
      overtime: bool(rf.overtime, d.salaryFormula.overtime),
      leaveDeductions: bool(rf.leaveDeductions, d.salaryFormula.leaveDeductions),
      latePenalties: bool(rf.latePenalties, d.salaryFormula.latePenalties),
      advanceRecovery: bool(rf.advanceRecovery, d.salaryFormula.advanceRecovery),
      manualDeductions: bool(rf.manualDeductions, d.salaryFormula.manualDeductions),
    },
  }
}

export interface StaffPayrollOverrides {
  useBusinessRules: boolean
  salary?: number | null
  lateDeductionEnabled?: boolean | null
  overtimeEnabled?: boolean | null
  commissionPercent?: number | null
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
