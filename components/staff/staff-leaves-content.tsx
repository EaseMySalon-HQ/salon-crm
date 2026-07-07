"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CalendarPlus,
  Download,
  Loader2,
  MoreHorizontal,
  PiggyBank,
  RefreshCw,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
  StaffDirectoryAPI,
  StaffLeaveAPI,
  StaffLeaveCreditAPI,
  type StaffLeaveRow,
  type StaffLeaveSummaryRow,
  type StaffLeaveCreditBalanceRow,
  type StaffLeaveCreditLedgerRow,
} from "@/lib/api"
import {
  computeTimesheetPeriodRange,
  type TimesheetPeriod,
} from "@/lib/staff-timesheet-period"
import { exportLeaveSummaryXlsx } from "@/lib/staff-leave-export"

type LeavePeriod = "payroll_month" | Exclude<TimesheetPeriod, "today" | "this_week">
type ActivityFilter = "all" | "leave" | "credit"
type LeaveView = "overview" | "activity"

const LEAVE_PERIOD_LABELS: Record<LeavePeriod, string> = {
  payroll_month: "Payroll month",
  current_month: "Current month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  custom: "Custom range",
}

const CREDIT_KIND_LABELS: Record<string, string> = {
  worked_weekoff: "Worked on weekoff",
  skipped_weekoff: "Skipped weekoff",
  manual_earn: "Manual credit",
  manual_use: "Manual use",
  paid_leave: "Paid leave",
  reversal: "Reversal",
}

function computeLeaveRange(
  period: LeavePeriod,
  payrollMonth: string,
  customFrom?: string,
  customTo?: string
): { from: string; to: string; label: string } {
  if (period === "payroll_month") {
    const [y, m] = payrollMonth.split("-")
    const lastDay = new Date(Number(y), Number(m), 0).getDate()
    const from = `${payrollMonth}-01`
    const to = `${payrollMonth}-${String(lastDay).padStart(2, "0")}`
    const label = new Date(`${payrollMonth}-01T12:00:00+05:30`).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    })
    return { from, to, label }
  }
  const { startYmd, endYmd, label } = computeTimesheetPeriodRange(period, customFrom, customTo)
  return { from: startYmd, to: endYmd, label }
}

function formatLeaveDays(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(1)
}

type ActivityItem =
  | {
      key: string
      kind: "leave"
      date: string
      staffId: string
      staffName: string
      leave: StaffLeaveRow
    }
  | {
      key: string
      kind: "credit"
      date: string
      staffId: string
      staffName: string
      credit: StaffLeaveCreditLedgerRow
    }

function leaveTypeLabel(type: StaffLeaveRow["type"]): string {
  if (type === "unpaid") return "Unpaid (LWP)"
  if (type === "half_day") return "Half day (LWP)"
  return "Paid leave"
}

type StaffLeavesContentProps = {
  month: string
  canManage: boolean
  onLeaveChange?: () => void | Promise<void>
}

export function StaffLeavesContent({ month, canManage, onLeaveChange }: StaffLeavesContentProps) {
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [leavePeriod, setLeavePeriod] = useState<LeavePeriod>("payroll_month")
  const [staffFilter, setStaffFilter] = useState("all")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [view, setView] = useState<LeaveView>("overview")
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all")

  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string }>>([])
  const [leaves, setLeaves] = useState<StaffLeaveRow[]>([])
  const [summary, setSummary] = useState<StaffLeaveSummaryRow[]>([])
  const [balances, setBalances] = useState<StaffLeaveCreditBalanceRow[]>([])
  const [ledger, setLedger] = useState<StaffLeaveCreditLedgerRow[]>([])

  const [recordOpen, setRecordOpen] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)

  const [leaveForm, setLeaveForm] = useState({
    staffId: "",
    date: "",
    type: "unpaid" as StaffLeaveRow["type"],
    reason: "",
    useBalance: true,
  })
  const [adjustForm, setAdjustForm] = useState({
    staffId: "",
    date: "",
    days: "1",
    direction: "earn" as "earn" | "use",
    kind: "skipped_weekoff" as "skipped_weekoff" | "manual_earn",
    reason: "",
  })

  const range = useMemo(
    () => computeLeaveRange(leavePeriod, month, customFrom, customTo),
    [leavePeriod, month, customFrom, customTo]
  )

  const loadStaffOptions = useCallback(async () => {
    try {
      const res = await StaffDirectoryAPI.getAll()
      const list = (res.data || [])
        .filter((s: { isOwner?: boolean }) => !s.isOwner)
        .map((s: { _id: string; name: string }) => ({ id: s._id, name: s.name }))
      setStaffOptions(list)
    } catch {
      setStaffOptions([])
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const staffId = staffFilter !== "all" ? staffFilter : undefined
      const params = { from: range.from, to: range.to, staffId }
      const [listRes, summaryRes, balanceRes, ledgerRes] = await Promise.all([
        StaffLeaveAPI.list(params),
        StaffLeaveAPI.summary(params),
        StaffLeaveCreditAPI.balances(params),
        StaffLeaveCreditAPI.ledger(params),
      ])
      if (listRes?.success) setLeaves(listRes.data || [])
      if (summaryRes?.success) setSummary(summaryRes.data || [])
      if (balanceRes?.success) setBalances(balanceRes.data || [])
      if (ledgerRes?.success) setLedger(ledgerRes.data || [])
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, staffFilter])

  useEffect(() => {
    void loadStaffOptions()
  }, [loadStaffOptions])

  useEffect(() => {
    void load()
  }, [load])

  const balanceByStaff = useMemo(
    () => new Map(balances.map((b) => [b.staffId, b])),
    [balances]
  )

  const overviewRows = useMemo(() => {
    if (staffFilter !== "all") {
      return summary
    }
    return summary.filter(
      (row) =>
        row.entries > 0 ||
        (row.savedLeaveBalance ?? 0) > 0 ||
        (balanceByStaff.get(row.staffId)?.balance ?? 0) > 0
    )
  }, [summary, staffFilter, balanceByStaff])

  const stats = useMemo(() => {
    const totalBalance = balances.reduce((s, b) => s + b.balance, 0)
    const leaveDays = summary.reduce((s, r) => s + r.totalDays, 0)
    const lwpDays = summary.reduce((s, r) => s + r.lwpDays, 0)
    const earned = balances.reduce((s, b) => s + b.earnedInPeriod, 0)
    return { totalBalance, leaveDays, lwpDays, earned, staffCount: overviewRows.length }
  }, [balances, summary, overviewRows.length])

  const selectedStaffBalance = useMemo(() => {
    if (!leaveForm.staffId) return 0
    return balanceByStaff.get(leaveForm.staffId)?.balance ?? 0
  }, [balanceByStaff, leaveForm.staffId])

  const activityItems = useMemo((): ActivityItem[] => {
    const items: ActivityItem[] = []
    for (const lv of leaves) {
      items.push({
        key: `leave-${lv.id}`,
        kind: "leave",
        date: lv.date,
        staffId: lv.staffId,
        staffName: lv.staffName,
        leave: lv,
      })
    }
    for (const cr of ledger) {
      items.push({
        key: `credit-${cr.id}`,
        kind: "credit",
        date: cr.date,
        staffId: cr.staffId,
        staffName: cr.staffName,
        credit: cr,
      })
    }
    items.sort((a, b) => b.date.localeCompare(a.date))
    if (activityFilter === "leave") return items.filter((i) => i.kind === "leave")
    if (activityFilter === "credit") return items.filter((i) => i.kind === "credit")
    return items
  }, [leaves, ledger, activityFilter])

  const refreshAll = async () => {
    await load()
    await onLeaveChange?.()
  }

  const handleRecordLeave = async () => {
    if (!leaveForm.staffId || !leaveForm.date) {
      toast({ title: "Select staff and date", variant: "destructive" })
      return
    }
    try {
      const res = await StaffLeaveAPI.upsert({
        staffId: leaveForm.staffId,
        date: leaveForm.date,
        type: leaveForm.type,
        reason: leaveForm.reason,
        useBalance: leaveForm.type === "paid" && leaveForm.useBalance,
      })
      if (!res?.success) throw new Error(res?.error || "Failed")
      toast({ title: "Leave recorded" })
      setRecordOpen(false)
      setLeaveForm({ staffId: "", date: "", type: "unpaid", reason: "", useBalance: true })
      await refreshAll()
    } catch (err) {
      toast({
        title: "Could not save leave",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    }
  }

  const handleDeleteLeave = async (id: string) => {
    try {
      await StaffLeaveAPI.remove(id)
      toast({ title: "Leave removed" })
      await refreshAll()
    } catch {
      toast({ title: "Failed to remove", variant: "destructive" })
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await StaffLeaveCreditAPI.sync({
        from: range.from,
        to: range.to,
        staffId: staffFilter !== "all" ? staffFilter : undefined,
      })
      if (!res?.success) throw new Error(res?.error || "Sync failed")
      toast({
        title: "Attendance synced",
        description: `${res.data?.created ?? 0} credit(s) added`,
      })
      await refreshAll()
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setSyncing(false)
    }
  }

  const handleAdjust = async () => {
    if (!adjustForm.staffId || !adjustForm.date) {
      toast({ title: "Select staff and date", variant: "destructive" })
      return
    }
    const days = Number(adjustForm.days)
    if (!Number.isFinite(days) || days <= 0) {
      toast({ title: "Enter valid days", variant: "destructive" })
      return
    }
    try {
      const res = await StaffLeaveCreditAPI.adjust({
        staffId: adjustForm.staffId,
        date: adjustForm.date,
        days,
        direction: adjustForm.direction,
        kind: adjustForm.direction === "earn" ? adjustForm.kind : undefined,
        reason: adjustForm.reason,
      })
      if (!res?.success) throw new Error(res?.error || "Failed")
      toast({
        title: adjustForm.direction === "earn" ? "Credit added" : "Credit used",
        description: `Balance: ${formatLeaveDays(res.data?.balance ?? 0)} day(s)`,
      })
      setAdjustOpen(false)
      setAdjustForm({
        staffId: "",
        date: "",
        days: "1",
        direction: "earn",
        kind: "skipped_weekoff",
        reason: "",
      })
      await refreshAll()
    } catch (err) {
      toast({
        title: "Adjustment failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    }
  }

  const openRecordForStaff = (staffId?: string) => {
    if (staffId) setLeaveForm((f) => ({ ...f, staffId }))
    setRecordOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-800">Leave &amp; saved balance</p>
            <p className="text-xs text-muted-foreground">{range.label}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Period</Label>
              <Select value={leavePeriod} onValueChange={(v) => setLeavePeriod(v as LeavePeriod)}>
                <SelectTrigger className="w-[148px] bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LEAVE_PERIOD_LABELS) as LeavePeriod[]).map((p) => (
                    <SelectItem key={p} value={p}>{LEAVE_PERIOD_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Staff</Label>
              <Select value={staffFilter} onValueChange={setStaffFilter}>
                <SelectTrigger className="w-[148px] bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {leavePeriod === "custom" ? (
              <>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[140px] bg-white" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[140px] bg-white" />
              </>
            ) : null}
            {canManage ? (
              <>
                <Button onClick={() => openRecordForStaff(staffFilter !== "all" ? staffFilter : undefined)}>
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Record leave
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" aria-label="More actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void handleSync()} disabled={syncing}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync from attendance
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      if (staffFilter !== "all") {
                        setAdjustForm((f) => ({ ...f, staffId: staffFilter }))
                      }
                      setAdjustOpen(true)
                    }}>
                      <PiggyBank className="h-4 w-4 mr-2" />
                      Adjust saved balance
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={summary.length === 0}
                      onClick={() => exportLeaveSummaryXlsx(summary, range.label)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export summary
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        </div>

        {/* At-a-glance stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill label="Saved balance" value={formatLeaveDays(stats.totalBalance)} accent="emerald" />
          <StatPill label="Leave taken" value={formatLeaveDays(stats.leaveDays)} accent="amber" />
          <StatPill label="LWP days" value={formatLeaveDays(stats.lwpDays)} accent="red" />
          <StatPill label="Credits earned" value={`+${formatLeaveDays(stats.earned)}`} accent="blue" />
        </div>
      </div>

      {/* Main content */}
      <Tabs value={view} onValueChange={(v) => setView(v as LeaveView)}>
        <TabsList>
          <TabsTrigger value="overview">Team overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Who&apos;s off &amp; what&apos;s saved</CardTitle>
              <CardDescription>
                Saved balance rolls over. Leave counts are for the selected period only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
              ) : overviewRows.length === 0 ? (
                <EmptyState
                  canManage={canManage}
                  onRecord={() => openRecordForStaff()}
                  onSync={() => void handleSync()}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead className="text-right">Saved</TableHead>
                        <TableHead className="text-right">Leave</TableHead>
                        <TableHead className="text-right">LWP</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Paid</TableHead>
                        {canManage ? <TableHead className="w-10" /> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overviewRows.map((row) => {
                        const bal = balanceByStaff.get(row.staffId)
                        return (
                          <TableRow key={row.staffId}>
                            <TableCell>
                              <div className="font-medium text-slate-800">{row.staffName}</div>
                              {(bal?.earnedInPeriod ?? 0) > 0 || (bal?.usedInPeriod ?? 0) > 0 ? (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {bal?.earnedInPeriod ? `+${formatLeaveDays(bal.earnedInPeriod)} earned` : null}
                                  {bal?.earnedInPeriod && bal?.usedInPeriod ? " · " : null}
                                  {bal?.usedInPeriod ? `−${formatLeaveDays(bal.usedInPeriod)} used` : null}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold text-emerald-700">
                              {formatLeaveDays(row.savedLeaveBalance ?? bal?.balance ?? 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatLeaveDays(row.totalDays)}</TableCell>
                            <TableCell className="text-right tabular-nums text-red-600">
                              {row.lwpDays > 0 ? formatLeaveDays(row.lwpDays) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums hidden sm:table-cell">
                              {row.paidDays > 0 ? row.paidDays : "—"}
                            </TableCell>
                            {canManage ? (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => openRecordForStaff(row.staffId)}
                                  title="Record leave"
                                >
                                  <CalendarPlus className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["all", "leave", "credit"] as ActivityFilter[]).map((f) => (
              <Button
                key={f}
                variant={activityFilter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setActivityFilter(f)}
              >
                {f === "all" ? "All" : f === "leave" ? "Leave days" : "Saved leave"}
              </Button>
            ))}
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
              ) : activityItems.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No activity in this period.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activityItems.map((item) => (
                    <li key={item.key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-[4.5rem] text-sm tabular-nums text-muted-foreground pt-0.5">
                        {item.date.slice(5).replace("-", "/")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-800">{item.staffName}</span>
                          {item.kind === "leave" ? (
                            <Badge variant="secondary" className="font-normal">
                              {leaveTypeLabel(item.leave.type)}
                            </Badge>
                          ) : (
                            <Badge
                              className={
                                item.credit.direction === "earn"
                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal"
                                  : "font-normal"
                              }
                              variant={item.credit.direction === "earn" ? "default" : "secondary"}
                            >
                              {item.credit.direction === "earn" ? "+" : "−"}
                              {formatLeaveDays(item.credit.days)} · {CREDIT_KIND_LABELS[item.credit.kind] || item.credit.kind}
                            </Badge>
                          )}
                          {item.kind === "leave" && item.leave.fromBalance ? (
                            <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-200">
                              From saved
                            </Badge>
                          ) : null}
                        </div>
                        {(item.kind === "leave" ? item.leave.reason : item.credit.reason) ? (
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {item.kind === "leave" ? item.leave.reason : item.credit.reason}
                          </p>
                        ) : null}
                      </div>
                      {canManage && item.kind === "leave" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-red-500 hover:text-red-600"
                          onClick={() => void handleDeleteLeave(item.leave.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Record leave dialog */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record leave</DialogTitle>
            <DialogDescription>
              Unpaid leave deducts salary. Paid leave can draw from saved balance.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Staff</Label>
              <Select value={leaveForm.staffId} onValueChange={(v) => setLeaveForm((f) => ({ ...f, staffId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={leaveForm.date} onChange={(e) => setLeaveForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={leaveForm.type} onValueChange={(v) => setLeaveForm((f) => ({ ...f, type: v as StaffLeaveRow["type"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Unpaid (LWP)</SelectItem>
                    <SelectItem value="half_day">Half day</SelectItem>
                    <SelectItem value="paid">Paid leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {leaveForm.type === "paid" ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="leave-use-balance"
                    checked={leaveForm.useBalance}
                    onCheckedChange={(v) => setLeaveForm((f) => ({ ...f, useBalance: v === true }))}
                  />
                  <Label htmlFor="leave-use-balance" className="text-sm cursor-pointer">
                    Use saved leave balance
                  </Label>
                </div>
                {leaveForm.staffId ? (
                  <p className="text-xs text-emerald-800">
                    {formatLeaveDays(selectedStaffBalance)} day(s) available
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. family function" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleRecordLeave()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust balance dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust saved balance</DialogTitle>
            <DialogDescription>
              Credit when someone skips a weekoff, or correct the balance manually.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Staff</Label>
              <Select value={adjustForm.staffId} onValueChange={(v) => setAdjustForm((f) => ({ ...f, staffId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={adjustForm.date} onChange={(e) => setAdjustForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Days</Label>
                <Input type="number" min={0.5} step={0.5} value={adjustForm.days} onChange={(e) => setAdjustForm((f) => ({ ...f, days: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={adjustForm.direction} onValueChange={(v) => setAdjustForm((f) => ({ ...f, direction: v as "earn" | "use" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="earn">Add credit</SelectItem>
                    <SelectItem value="use">Deduct credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {adjustForm.direction === "earn" ? (
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Select value={adjustForm.kind} onValueChange={(v) => setAdjustForm((f) => ({ ...f, kind: v as typeof f.kind }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skipped_weekoff">Skipped weekoff</SelectItem>
                      <SelectItem value="manual_earn">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={adjustForm.reason} onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleAdjust()}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatPill({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: "emerald" | "amber" | "red" | "blue"
}) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-900 border-emerald-100",
    amber: "bg-amber-50 text-amber-900 border-amber-100",
    red: "bg-red-50 text-red-900 border-red-100",
    blue: "bg-blue-50 text-blue-900 border-blue-100",
  }
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[accent]}`}>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
      <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

function EmptyState({
  canManage,
  onRecord,
  onSync,
}: {
  canManage: boolean
  onRecord: () => void
  onSync: () => void
}) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        No leave or saved balance in this period. Record leave when someone is off, or sync attendance after they work on a weekoff.
      </p>
      {canManage ? (
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <Button size="sm" onClick={onRecord}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            Record leave
          </Button>
          <Button size="sm" variant="outline" onClick={onSync}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync attendance
          </Button>
        </div>
      ) : null}
    </div>
  )
}
