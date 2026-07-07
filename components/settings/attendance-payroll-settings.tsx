"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, Banknote, Plus, Trash2, Clock } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { AttendancePayrollSettingsAPI, type HolidayRow } from "@/lib/api"
import {
  DEFAULT_ATTENDANCE_PAYROLL_SETTINGS,
  mergeAttendancePayrollSettings,
  DAY_NAMES,
  formatShiftTimeRange,
  type AttendancePayrollSettings as APSettings,
  type ShiftTemplate,
} from "@/lib/attendance-payroll-settings"
import { useToast } from "@/hooks/use-toast"
import { useFeature } from "@/hooks/use-entitlements"
import { PlanUpgradePanel } from "@/components/plan/plan-upgrade-panel"
import { useAuth } from "@/lib/auth-context"

const AP_TABS = ["payroll", "attendance", "shifts", "formula", "holidays"] as const
type APTab = (typeof AP_TABS)[number]

function isAPTab(value: string | null): value is APTab {
  return value != null && (AP_TABS as readonly string[]).includes(value)
}

function ToggleRow({
  label,
  desc,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string
  desc?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {desc ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{desc}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

const inputClass = "h-10 border-slate-200 bg-white tabular-nums"
const labelClass = "text-xs font-medium uppercase tracking-wide text-slate-500"

export function AttendancePayrollSettings() {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission("payroll_settings", "edit")
  const { hasAccess: canPayroll, isLoading: payrollEntitlementsLoading } = useFeature("payroll")
  const { hasAccess: canAttendance, isLoading: attendanceEntitlementsLoading } = useFeature("attendance")
  const tabParam = searchParams.get("apTab")

  const activeTab: APTab = (() => {
    if (!isAPTab(tabParam)) return canPayroll ? "payroll" : "attendance"
    if ((tabParam === "payroll" || tabParam === "formula") && !canPayroll) return "attendance"
    return tabParam
  })()

  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("section", "attendance-payroll")
    params.set("apTab", tab)
    router.replace(`/settings?${params.toString()}`)
  }

  const [settings, setSettings] = useState<APSettings>(DEFAULT_ATTENDANCE_PAYROLL_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [holidayYear, setHolidayYear] = useState<number>(new Date().getFullYear())
  const [holidays, setHolidays] = useState<HolidayRow[]>([])
  const [holidaysLoading, setHolidaysLoading] = useState(false)
  const [newHoliday, setNewHoliday] = useState({ date: "", name: "" })

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await AttendancePayrollSettingsAPI.get()
        if (active && res.success && res.data) {
          setSettings(mergeAttendancePayrollSettings(res.data))
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const loadHolidays = async (year: number) => {
    setHolidaysLoading(true)
    try {
      const res = await AttendancePayrollSettingsAPI.listHolidays(year)
      if (res.success && res.data) setHolidays(res.data)
    } finally {
      setHolidaysLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === "holidays") void loadHolidays(holidayYear)
  }, [activeTab, holidayYear])

  useEffect(() => {
    if (payrollEntitlementsLoading || canPayroll) return
    if (tabParam === "payroll" || tabParam === "formula") {
      const params = new URLSearchParams(searchParams.toString())
      params.set("section", "attendance-payroll")
      params.set("apTab", "attendance")
      router.replace(`/settings?${params.toString()}`)
    }
  }, [canPayroll, payrollEntitlementsLoading, tabParam, searchParams, router])

  const save = async () => {
    setSaving(true)
    try {
      const res = await AttendancePayrollSettingsAPI.update(settings)
      if (res.success && res.data) {
        setSettings(mergeAttendancePayrollSettings(res.data))
        toast({ title: "Settings saved" })
      } else {
        toast({ title: res.message || res.error || "Failed to save", variant: "destructive" })
      }
    } catch (e: any) {
      toast({
        title: e?.response?.data?.error || "Failed to save settings",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const addHoliday = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newHoliday.date)) {
      toast({ title: "Pick a valid date", variant: "destructive" })
      return
    }
    const res = await AttendancePayrollSettingsAPI.saveHoliday({
      date: newHoliday.date,
      name: newHoliday.name.trim(),
    })
    if (res.success) {
      toast({ title: "Holiday saved" })
      setNewHoliday({ date: "", name: "" })
      void loadHolidays(holidayYear)
    } else {
      toast({ title: res.message || "Failed", variant: "destructive" })
    }
  }

  const deleteHoliday = async (id: string) => {
    const res = await AttendancePayrollSettingsAPI.deleteHoliday(id)
    if (res.success) {
      setHolidays((h) => h.filter((x) => x.id !== id))
    } else {
      toast({ title: res.message || "Could not delete", variant: "destructive" })
    }
  }

  // Convenience updaters
  const p = settings.payroll
  const a = settings.attendance
  const f = settings.salaryFormula

  const setPayroll = (patch: Partial<APSettings["payroll"]>) =>
    setSettings((s) => ({ ...s, payroll: { ...s.payroll, ...patch } }))
  const setAttendance = (patch: Partial<APSettings["attendance"]>) =>
    setSettings((s) => ({ ...s, attendance: { ...s.attendance, ...patch } }))
  const setFormula = (patch: Partial<APSettings["salaryFormula"]>) =>
    setSettings((s) => ({ ...s, salaryFormula: { ...s.salaryFormula, ...patch } }))

  const payoutHint = useMemo(() => {
    if (p.payoutDate === "last_day") return "Paid on the last day of each month."
    if (p.payoutDate === "custom") return `Paid on day ${p.customDay} of each month.`
    return `Paid on the ${p.payoutDate === "1" ? "1st" : "5th"} of each month.`
  }, [p.payoutDate, p.customDay])

  if (loading || payrollEntitlementsLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" aria-hidden />
        <span>Loading attendance & payroll settings…</span>
      </div>
    )
  }

  const tabTriggerClass =
    "rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-900 data-[state=active]:shadow-sm data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:text-slate-900"

  const SaveBar = () =>
    canEdit ? (
    <div className="flex justify-end pt-2">
      <Button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="h-10 min-w-[160px] bg-gradient-to-r from-indigo-600 to-violet-600 font-medium shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-violet-700"
      >
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </div>
    ) : null

  if (payrollEntitlementsLoading || attendanceEntitlementsLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" aria-hidden />
      </div>
    )
  }

  if (!canAttendance) {
    return (
      <PlanUpgradePanel
        title="Attendance & Payroll"
        description="Track attendance, manage shifts, export timesheets, and set your holiday calendar. Available on the Growth plan and above."
      />
    )
  }

  return (
    <div className="w-full min-w-0 max-w-none space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/95 via-white to-violet-50/40 p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/20 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
            <Banknote className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              Attendance & Payroll
            </h2>
            <p className="max-w-none text-sm leading-relaxed text-slate-600 sm:text-[15px]">
              Attendance rules, staff shifts, and your holiday calendar.
              {canPayroll ? " Plus payroll cycle and the salary calculation formula." : ""} Individual
              staff can override these on their profile.
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList
          className={`grid h-auto w-full max-w-none gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1.5 shadow-inner ${canPayroll ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-3"}`}
        >
          {canPayroll && (
            <TabsTrigger value="payroll" className={tabTriggerClass}>
              Payroll
            </TabsTrigger>
          )}
          <TabsTrigger value="attendance" className={tabTriggerClass}>
            Attendance
          </TabsTrigger>
          <TabsTrigger value="shifts" className={tabTriggerClass}>
            Shifts
          </TabsTrigger>
          {canPayroll && (
            <TabsTrigger value="formula" className={tabTriggerClass}>
              Salary formula
            </TabsTrigger>
          )}
          <TabsTrigger value="holidays" className={tabTriggerClass}>
            Holidays
          </TabsTrigger>
        </TabsList>

        {canPayroll && (
        <>
        {/* ── Tab A: Payroll ─────────────────────────────────────────────── */}
        <TabsContent value="payroll" className="mt-8 space-y-6 focus-visible:outline-none">
          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Salary cycle & payout</CardTitle>
              <CardDescription>
                Payroll runs monthly today. Weekly / bi-weekly is stored for reporting and payout labels.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className={labelClass}>Salary cycle</Label>
                  <Select
                    value={p.salaryCycle}
                    onValueChange={(v) => setPayroll({ salaryCycle: v as APSettings["payroll"]["salaryCycle"] })}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Payout date</Label>
                  <Select
                    value={p.payoutDate}
                    onValueChange={(v) => setPayroll({ payoutDate: v as APSettings["payroll"]["payoutDate"] })}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last_day">Last day of month</SelectItem>
                      <SelectItem value="1">1st of month</SelectItem>
                      <SelectItem value="5">5th of month</SelectItem>
                      <SelectItem value="custom">Custom day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {p.payoutDate === "custom" && (
                  <div className="space-y-2">
                    <Label className={labelClass}>Custom day (1–28)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      value={p.customDay}
                      onChange={(e) => setPayroll({ customDay: Number(e.target.value) || 1 })}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{payoutHint}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Payroll components</CardTitle>
              <CardDescription>Turn payroll building blocks on or off for the whole business.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
              {([
                ["fixedSalary", "Fixed salary"],
                ["commission", "Commission"],
                ["bonus", "Bonus"],
                ["incentives", "Incentives"],
                ["overtime", "Overtime"],
                ["deductions", "Deductions"],
                ["reimbursements", "Reimbursements"],
              ] as const).map(([key, label]) => (
                <ToggleRow
                  key={key}
                  label={label}
                  checked={p.components[key]}
                  onCheckedChange={(v) => setPayroll({ components: { ...p.components, [key]: v } })}
                />
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Commission</CardTitle>
              <CardDescription>Which sales earn commission, and how it is calculated.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-800">Earn commission on</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ["onServiceSales", "Service sales"],
                    ["onProductSales", "Product sales"],
                    ["onMembershipSales", "Membership sales"],
                    ["onPackageSales", "Package sales"],
                  ] as const).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"
                    >
                      <Checkbox
                        checked={p.commission[key]}
                        onCheckedChange={(v) =>
                          setPayroll({ commission: { ...p.commission, [key]: v === true } })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-slate-800">Calculate on</Label>
                  <RadioGroup
                    value={p.commission.calculateOn}
                    onValueChange={(v) =>
                      setPayroll({
                        commission: { ...p.commission, calculateOn: v as APSettings["payroll"]["commission"]["calculateOn"] },
                      })
                    }
                    className="space-y-2"
                  >
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <RadioGroupItem value="before_discount" /> Amount before discount
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <RadioGroupItem value="after_discount" /> Amount after discount
                    </label>
                  </RadioGroup>
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-slate-800">Payable when</Label>
                  <RadioGroup
                    value={p.commission.payableWhen}
                    onValueChange={(v) =>
                      setPayroll({
                        commission: { ...p.commission, payableWhen: v as APSettings["payroll"]["commission"]["payableWhen"] },
                      })
                    }
                    className="space-y-2"
                  >
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <RadioGroupItem value="on_sale" /> Immediately after sale
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <RadioGroupItem value="on_payment" /> After payment received
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <RadioGroupItem value="on_service_completion" /> After service completion
                    </label>
                  </RadioGroup>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Bonus, deductions & rounding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              <ToggleRow
                label="Allow manual bonus"
                checked={p.bonusDeductions.allowManualBonus}
                onCheckedChange={(v) =>
                  setPayroll({ bonusDeductions: { ...p.bonusDeductions, allowManualBonus: v } })
                }
              />
              <ToggleRow
                label="Allow manual deduction"
                checked={p.bonusDeductions.allowManualDeduction}
                onCheckedChange={(v) =>
                  setPayroll({ bonusDeductions: { ...p.bonusDeductions, allowManualDeduction: v } })
                }
              />
              <ToggleRow
                label="Require reason for deduction"
                checked={p.bonusDeductions.requireDeductionReason}
                onCheckedChange={(v) =>
                  setPayroll({ bonusDeductions: { ...p.bonusDeductions, requireDeductionReason: v } })
                }
              />
              <div className="grid gap-5 pt-2 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className={labelClass}>Salary rounding</Label>
                  <Select
                    value={p.rounding}
                    onValueChange={(v) => setPayroll({ rounding: v as APSettings["payroll"]["rounding"] })}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No rounding</SelectItem>
                      <SelectItem value="1">Nearest ₹1</SelectItem>
                      <SelectItem value="5">Nearest ₹5</SelectItem>
                      <SelectItem value="10">Nearest ₹10</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Late penalty per day (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={p.latePenaltyPerDay}
                    onChange={(e) => setPayroll({ latePenaltyPerDay: Number(e.target.value) || 0 })}
                    className={inputClass}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>
        </>
        )}

        {/* ── Tab B: Attendance ──────────────────────────────────────────── */}
        <TabsContent value="attendance" className="mt-8 space-y-6 focus-visible:outline-none">
          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Working days & timing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-800">Working days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAY_NAMES.map((day, idx) => {
                    const on = a.workingDays[idx]
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const next = [...a.workingDays]
                          next[idx] = !next[idx]
                          setAttendance({ workingDays: next })
                        }}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          on
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className={labelClass}>Opening time</Label>
                  <Input
                    type="time"
                    value={a.officeHours.open}
                    onChange={(e) => setAttendance({ officeHours: { ...a.officeHours, open: e.target.value } })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Closing time</Label>
                  <Input
                    type="time"
                    value={a.officeHours.close}
                    onChange={(e) => setAttendance({ officeHours: { ...a.officeHours, close: e.target.value } })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Grace period (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={a.gracePeriodMinutes}
                    onChange={(e) => setAttendance({ gracePeriodMinutes: Number(e.target.value) || 0 })}
                    className={inputClass}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Half-day & absent rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className={labelClass}>Half day if late beyond (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={a.halfDayRules.lateBeyondMinutes}
                    onChange={(e) =>
                      setAttendance({ halfDayRules: { ...a.halfDayRules, lateBeyondMinutes: Number(e.target.value) || 0 } })
                    }
                    className={inputClass}
                  />
                  <p className="text-xs text-muted-foreground">
                    e.g. arriving more than {a.halfDayRules.lateBeyondMinutes} min late counts as half day.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Half day if worked less than (hours)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={a.halfDayRules.workedLessThanHours}
                    onChange={(e) =>
                      setAttendance({ halfDayRules: { ...a.halfDayRules, workedLessThanHours: Number(e.target.value) || 0 } })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Absent if worked less than (hours)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={a.absentRules.workedLessThanHours}
                    onChange={(e) =>
                      setAttendance({ absentRules: { workedLessThanHours: Number(e.target.value) || 0 } })
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Overtime</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <ToggleRow
                label="Enable overtime"
                desc="Track time worked past closing and pay it as overtime."
                checked={a.overtime.enabled}
                onCheckedChange={(v) => setAttendance({ overtime: { ...a.overtime, enabled: v } })}
              />
              <div
                className={
                  a.overtime.enabled ? "grid gap-5 sm:grid-cols-3" : "grid gap-5 sm:grid-cols-3 opacity-50 pointer-events-none"
                }
              >
                <div className="space-y-2">
                  <Label className={labelClass}>Minimum overtime (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={a.overtime.minimumMinutes}
                    onChange={(e) => setAttendance({ overtime: { ...a.overtime, minimumMinutes: Number(e.target.value) || 0 } })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Rate type</Label>
                  <Select
                    value={a.overtime.rateType}
                    onValueChange={(v) =>
                      setAttendance({ overtime: { ...a.overtime, rateType: v as APSettings["attendance"]["overtime"]["rateType"] } })
                    }
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiplier">Multiplier of hourly rate</SelectItem>
                      <SelectItem value="fixed_per_hour">Fixed amount / hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {a.overtime.rateType === "multiplier" ? (
                  <div className="space-y-2">
                    <Label className={labelClass}>Multiplier (×)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      value={a.overtime.multiplier}
                      onChange={(e) => setAttendance({ overtime: { ...a.overtime, multiplier: Number(e.target.value) || 0 } })}
                      className={inputClass}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className={labelClass}>Fixed amount / hour (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={a.overtime.fixedAmount}
                      onChange={(e) => setAttendance({ overtime: { ...a.overtime, fixedAmount: Number(e.target.value) || 0 } })}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Leave & weekly off</CardTitle>
              <CardDescription>Monthly leave allowances shown on the payroll leaves tab.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className={labelClass}>Paid leave / month</Label>
                  <Input
                    type="number"
                    min={0}
                    value={a.leave.paidLeavePerMonth}
                    onChange={(e) => setAttendance({ leave: { ...a.leave, paidLeavePerMonth: Number(e.target.value) || 0 } })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Casual leave / month</Label>
                  <Input
                    type="number"
                    min={0}
                    value={a.leave.casualLeavePerMonth}
                    onChange={(e) => setAttendance({ leave: { ...a.leave, casualLeavePerMonth: Number(e.target.value) || 0 } })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Sick leave / month</Label>
                  <Input
                    type="number"
                    min={0}
                    value={a.leave.sickLeavePerMonth}
                    onChange={(e) => setAttendance({ leave: { ...a.leave, sickLeavePerMonth: Number(e.target.value) || 0 } })}
                    className={inputClass}
                  />
                </div>
              </div>
              <ToggleRow
                label="Allow unpaid leave (LWP)"
                checked={a.leave.unpaidLeaveAllowed}
                onCheckedChange={(v) => setAttendance({ leave: { ...a.leave, unpaidLeaveAllowed: v } })}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className={labelClass}>Weekly off</Label>
                  <Select
                    value={a.leave.weeklyOffDay === "custom" ? "custom" : String(a.leave.weeklyOffDay)}
                    onValueChange={(v) =>
                      setAttendance({ leave: { ...a.leave, weeklyOffDay: v === "custom" ? "custom" : Number(v) } })
                    }
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_NAMES.map((day, idx) => (
                        <SelectItem key={day} value={String(idx)}>
                          {day}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom / per staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>

        {/* ── Tab: Shifts ────────────────────────────────────────────────── */}
        <TabsContent value="shifts" className="mt-8 space-y-6 focus-visible:outline-none">
          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                    <Clock className="h-5 w-5 text-indigo-600" aria-hidden />
                    Shift management
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    Define shifts for your team (e.g. Morning 10 AM – 6 PM). Assign a shift when adding or
                    editing staff — their work schedule times update automatically.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    const id = `shift-${Date.now()}`
                    setAttendance({
                      shifts: [
                        ...a.shifts,
                        { id, name: "New shift", startTime: "09:00", endTime: "18:00" },
                      ],
                    })
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add shift
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {a.shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No shifts yet. Add your first shift to assign to staff members.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="font-semibold text-slate-700">Shift name</TableHead>
                        <TableHead className="font-semibold text-slate-700">Start</TableHead>
                        <TableHead className="font-semibold text-slate-700">End</TableHead>
                        <TableHead className="font-semibold text-slate-700">Preview</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {a.shifts.map((shift: ShiftTemplate, idx: number) => (
                        <TableRow key={shift.id || idx}>
                          <TableCell>
                            <Input
                              value={shift.name}
                              onChange={(e) => {
                                const next = [...a.shifts]
                                next[idx] = { ...shift, name: e.target.value }
                                setAttendance({ shifts: next })
                              }}
                              className={inputClass}
                              placeholder="e.g. Morning"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              value={shift.startTime}
                              onChange={(e) => {
                                const next = [...a.shifts]
                                next[idx] = { ...shift, startTime: e.target.value }
                                setAttendance({ shifts: next })
                              }}
                              className={inputClass}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="time"
                              value={shift.endTime}
                              onChange={(e) => {
                                const next = [...a.shifts]
                                next[idx] = { ...shift, endTime: e.target.value }
                                setAttendance({ shifts: next })
                              }}
                              className={inputClass}
                            />
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {formatShiftTimeRange(shift.startTime, shift.endTime)}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-slate-400 hover:text-red-600"
                              disabled={a.shifts.length <= 1}
                              onClick={() => {
                                setAttendance({ shifts: a.shifts.filter((_, i) => i !== idx) })
                              }}
                              aria-label={`Remove ${shift.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Default shifts: Morning (10 AM – 6 PM), General (11 AM – 8 PM), Evening (1 PM – 9 PM).
                At least one shift is required.
              </p>
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>

        {/* ── Tab C: Salary formula ──────────────────────────────────────── */}
        {canPayroll && (
        <TabsContent value="formula" className="mt-8 space-y-6 focus-visible:outline-none">
          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Net salary formula</CardTitle>
              <CardDescription>
                Toggle each line item. Disabled items are excluded from the net pay calculation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 text-sm leading-relaxed text-slate-700">
                <span className="font-medium text-slate-900">Net pay</span> ={" "}
                <span className={f.fixedSalary ? "text-emerald-700" : "text-slate-400 line-through"}>Fixed salary</span> +{" "}
                <span className={f.commission ? "text-emerald-700" : "text-slate-400 line-through"}>Commission</span> +{" "}
                <span className={f.incentives ? "text-emerald-700" : "text-slate-400 line-through"}>Incentives</span> +{" "}
                <span className={f.bonus ? "text-emerald-700" : "text-slate-400 line-through"}>Bonus</span> +{" "}
                <span className={f.overtime ? "text-emerald-700" : "text-slate-400 line-through"}>Overtime</span> −{" "}
                <span className={f.leaveDeductions ? "text-rose-700" : "text-slate-400 line-through"}>Leave deductions</span> −{" "}
                <span className={f.latePenalties ? "text-rose-700" : "text-slate-400 line-through"}>Late penalties</span> −{" "}
                <span className={f.advanceRecovery ? "text-rose-700" : "text-slate-400 line-through"}>Advance recovery</span> −{" "}
                <span className={f.manualDeductions ? "text-rose-700" : "text-slate-400 line-through"}>Manual deductions</span>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-emerald-700">Earnings</Label>
                  {([
                    ["fixedSalary", "Fixed salary"],
                    ["commission", "Commission"],
                    ["incentives", "Incentives"],
                    ["bonus", "Bonus"],
                    ["overtime", "Overtime"],
                  ] as const).map(([key, label]) => (
                    <ToggleRow
                      key={key}
                      label={label}
                      checked={f[key]}
                      onCheckedChange={(v) => setFormula({ [key]: v } as Partial<APSettings["salaryFormula"]>)}
                    />
                  ))}
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-rose-700">Deductions</Label>
                  {([
                    ["leaveDeductions", "Leave deductions (LWP)"],
                    ["latePenalties", "Late penalties"],
                    ["advanceRecovery", "Advance recovery"],
                    ["manualDeductions", "Manual deductions"],
                  ] as const).map(([key, label]) => (
                    <ToggleRow
                      key={key}
                      label={label}
                      checked={f[key]}
                      onCheckedChange={(v) => setFormula({ [key]: v } as Partial<APSettings["salaryFormula"]>)}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <SaveBar />
        </TabsContent>
        )}

        {/* ── Tab D: Holidays ────────────────────────────────────────────── */}
        <TabsContent value="holidays" className="mt-8 space-y-6 focus-visible:outline-none">
          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Holiday calendar</CardTitle>
              <CardDescription>Branch-wide holidays used by scheduling and payroll.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label className={labelClass}>Year</Label>
                  <Input
                    type="number"
                    value={holidayYear}
                    onChange={(e) => setHolidayYear(Number(e.target.value) || new Date().getFullYear())}
                    className={`${inputClass} w-32`}
                  />
                </div>
                <div className="space-y-2">
                  <Label className={labelClass}>Date</Label>
                  <Input
                    type="date"
                    value={newHoliday.date}
                    onChange={(e) => setNewHoliday((h) => ({ ...h, date: e.target.value }))}
                    className={`${inputClass} w-44`}
                  />
                </div>
                <div className="flex-1 space-y-2 min-w-[180px]">
                  <Label className={labelClass}>Name</Label>
                  <Input
                    value={newHoliday.name}
                    onChange={(e) => setNewHoliday((h) => ({ ...h, name: e.target.value }))}
                    placeholder="e.g. Diwali"
                    className="h-10 border-slate-200 bg-white"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void addHoliday()}
                  className="h-10 gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 font-medium shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-violet-700"
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200/80 hover:bg-transparent">
                      <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-slate-500">Date</TableHead>
                      <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-slate-500">Name</TableHead>
                      <TableHead className="h-11 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holidaysLoading ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : holidays.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                          No holidays for {holidayYear} yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      holidays.map((h) => (
                        <TableRow key={h.id} className="border-slate-100 hover:bg-slate-50/60">
                          <TableCell className="font-medium text-slate-900">{h.date}</TableCell>
                          <TableCell className="text-slate-700">{h.name || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => void deleteHoliday(h.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
