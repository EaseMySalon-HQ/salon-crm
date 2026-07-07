"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BadgeCheck,
  Banknote,
  ChevronDown,
  Download,
  FileText,
  History,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Users,
  Wallet,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useCurrency } from "@/hooks/use-currency"
import { useAuth } from "@/lib/auth-context"
import {
  PayrollAPI,
  StaffAdvanceAPI,
  StaffDirectoryAPI,
  type PayrollAuditEntry,
  type PayrollPaymentMethod,
  type PayrollPeriod,
  type PayrollRow,
  type StaffAdvanceRow,
  type StaffAdvanceLogEntry,
  type StaffAdvanceRecoveryFrom,
} from "@/lib/api"
import {
  downloadPayslipPdf,
  exportPayrollPdf,
  exportPayrollXlsx,
  formatPaymentMethod,
} from "@/lib/payroll-export"
import { resolvePayslipBusiness } from "@/lib/payslip-business"
import { sharePayslipViaWhatsApp } from "@/lib/payroll-whatsapp"
import { PayrollCommissionBreakdownDialog } from "@/components/staff/payroll-commission-breakdown-dialog"
import { StaffLeavesContent } from "@/components/staff/staff-leaves-content"

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function num(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

type EditForm = {
  baseSalary: string
  incentive: string
  bonus: string
  manualDeductions: string
  deductionNote: string
  notes: string
}

function toForm(row: PayrollRow): EditForm {
  return {
    baseSalary: String(row.baseSalary ?? 0),
    incentive: String(row.incentive ?? 0),
    bonus: String(row.bonus ?? 0),
    manualDeductions: String(row.manualDeductions ?? 0),
    deductionNote: row.deductionNote || "",
    notes: row.notes || "",
  }
}

export function StaffPayrollContent() {
  const { toast } = useToast()
  const { formatAmount, getSymbol, currencySettings } = useCurrency()
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission("payroll_settings", "edit")

  const [payslipBusinessName, setPayslipBusinessName] = useState<string>("")

  useEffect(() => {
    void resolvePayslipBusiness()
      .then((info) => setPayslipBusinessName(info.name))
      .catch(() => setPayslipBusinessName(""))
  }, [])

  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<PayrollPeriod | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [editRow, setEditRow] = useState<PayrollRow | null>(null)
  const [form, setForm] = useState<EditForm>({
    baseSalary: "0",
    incentive: "0",
    bonus: "0",
    manualDeductions: "0",
    deductionNote: "",
    notes: "",
  })
  const [saving, setSaving] = useState(false)
  const [auditLog, setAuditLog] = useState<PayrollAuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const [payRow, setPayRow] = useState<PayrollRow | null>(null)
  const [payMethod, setPayMethod] = useState<PayrollPaymentMethod>("cash")
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))

  const [breakdownRow, setBreakdownRow] = useState<PayrollRow | null>(null)

  // Advances
  const [advances, setAdvances] = useState<StaffAdvanceRow[]>([])
  const [advancesLoading, setAdvancesLoading] = useState(false)
  const [advanceForm, setAdvanceForm] = useState({
    staffId: "",
    amount: "",
    installmentAmount: "",
    recoveryFrom: "next_cycle" as StaffAdvanceRecoveryFrom,
    notes: "",
  })
  const [payrollTab, setPayrollTab] = useState("payroll")
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string }>>([])

  const [advanceLogsRow, setAdvanceLogsRow] = useState<StaffAdvanceRow | null>(null)
  const [advanceLogs, setAdvanceLogs] = useState<StaffAdvanceLogEntry[]>([])
  const [advanceLogsLoading, setAdvanceLogsLoading] = useState(false)

  const [editAdvance, setEditAdvance] = useState<StaffAdvanceRow | null>(null)
  const [editAdvanceForm, setEditAdvanceForm] = useState({
    amount: "",
    installmentAmount: "",
    recoveryFrom: "next_cycle" as StaffAdvanceRecoveryFrom,
    givenAt: "",
    notes: "",
  })
  const [editAdvanceSaving, setEditAdvanceSaving] = useState(false)

  const [confirmAdvanceOpen, setConfirmAdvanceOpen] = useState(false)
  const [advanceCreating, setAdvanceCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await PayrollAPI.getMonth(month)
      if (res?.success) setData(res.data)
      else throw new Error(res?.error || "Failed to load payroll")
    } catch (err) {
      toast({
        title: "Could not load payroll",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [month, toast])

  const loadAdvances = useCallback(async () => {
    setAdvancesLoading(true)
    try {
      const res = await StaffAdvanceAPI.list({ status: "active" })
      if (res?.success) setAdvances(res.data || [])
    } finally {
      setAdvancesLoading(false)
    }
  }, [])

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

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadStaffOptions()
  }, [loadStaffOptions])

  const rows = data?.rows ?? []
  const totals = data?.totals

  const previewNet = useMemo(() => {
    const base = num(form.baseSalary)
    const inc = num(form.incentive)
    const bon = num(form.bonus)
    const manual = num(form.manualDeductions)
    const auto =
      (editRow?.leaveDeduction ?? 0) + (editRow?.advanceRecovery ?? 0)
    return base + inc + bon - manual - auto
  }, [form, editRow])

  const openEdit = async (row: PayrollRow) => {
    setEditRow(row)
    setForm(toForm(row))
    setAuditLog([])
    if (row.recordId) {
      setAuditLoading(true)
      try {
        const res = await PayrollAPI.getAudit(row.recordId)
        if (res?.success) setAuditLog(res.data || [])
      } finally {
        setAuditLoading(false)
      }
    }
  }

  const handleSave = async () => {
    if (!editRow) return
    setSaving(true)
    try {
      const res = await PayrollAPI.upsert({
        staffId: editRow.staffId,
        month,
        baseSalary: num(form.baseSalary),
        incentive: num(form.incentive),
        bonus: num(form.bonus),
        manualDeductions: num(form.manualDeductions),
        deductionNote: form.deductionNote.trim(),
        notes: form.notes.trim(),
      })
      if (!res?.success) throw new Error(res?.error || "Failed to save")
      toast({ title: "Payroll saved", description: editRow.staffName })
      setEditRow(null)
      await load()
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const openMarkPaid = (row: PayrollRow) => {
    setPayRow(row)
    setPayMethod("cash")
    setPayDate(new Date().toISOString().slice(0, 10))
  }

  const handleConfirmPaid = async () => {
    if (!payRow) return
    setSavingId(payRow.staffId)
    try {
      let recordId = payRow.recordId
      if (!recordId) {
        const saved = await PayrollAPI.upsert({
          staffId: payRow.staffId,
          month,
          baseSalary: payRow.baseSalary,
          incentive: payRow.incentive,
          bonus: payRow.bonus,
          manualDeductions: payRow.manualDeductions ?? 0,
          deductionNote: payRow.deductionNote,
          notes: payRow.notes,
        })
        if (!saved?.success) throw new Error(saved?.error || "Failed to save record")
        recordId = saved.data.recordId
      }
      if (!recordId) throw new Error("Missing record id")

      const paidAt = payDate ? new Date(payDate + "T12:00:00").toISOString() : undefined
      const res = await PayrollAPI.setStatus(recordId, "paid", {
        paymentMethod: payMethod,
        paidAt,
      })
      if (!res?.success) throw new Error(res?.error || "Failed to mark paid")
      toast({ title: "Marked as paid", description: payRow.staffName })
      setPayRow(null)
      await load()
    } catch (err) {
      toast({
        title: "Could not mark paid",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setSavingId(null)
    }
  }

  const handleMarkDraft = async (row: PayrollRow) => {
    if (!row.recordId) return
    setSavingId(row.staffId)
    try {
      const res = await PayrollAPI.setStatus(row.recordId, "draft")
      if (!res?.success) throw new Error(res?.error || "Failed to update")
      toast({ title: "Reverted to pending", description: row.staffName })
      await load()
    } catch (err) {
      toast({
        title: "Could not update",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setSavingId(null)
    }
  }

  const requestAddAdvance = () => {
    if (!advanceForm.staffId || !advanceForm.amount) {
      toast({ title: "Select staff and amount", variant: "destructive" })
      return
    }
    setConfirmAdvanceOpen(true)
  }

  const handleAddAdvance = async () => {
    if (!advanceForm.staffId || !advanceForm.amount) return
    setAdvanceCreating(true)
    try {
      const res = await StaffAdvanceAPI.create({
        staffId: advanceForm.staffId,
        amount: num(advanceForm.amount),
        installmentAmount: num(advanceForm.installmentAmount),
        recoveryFrom: advanceForm.recoveryFrom,
        notes: advanceForm.notes.trim(),
      })
      if (!res?.success) throw new Error(res?.error || "Failed")
      toast({ title: "Advance recorded" })
      setConfirmAdvanceOpen(false)
      setAdvanceForm({
        staffId: "",
        amount: "",
        installmentAmount: "",
        recoveryFrom: "next_cycle",
        notes: "",
      })
      await Promise.all([loadAdvances(), load()])
    } catch (err) {
      toast({
        title: "Failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setAdvanceCreating(false)
    }
  }

  const confirmAdvanceStaffName = useMemo(() => {
    return staffOptions.find((s) => s.id === advanceForm.staffId)?.name || "Staff"
  }, [staffOptions, advanceForm.staffId])

  const handleCloseAdvance = async (id: string) => {
    try {
      await StaffAdvanceAPI.close(id)
      toast({ title: "Advance closed" })
      await Promise.all([loadAdvances(), load()])
    } catch {
      toast({ title: "Failed", variant: "destructive" })
    }
  }

  const openAdvanceLogs = async (adv: StaffAdvanceRow) => {
    setAdvanceLogsRow(adv)
    setAdvanceLogs([])
    setAdvanceLogsLoading(true)
    try {
      const res = await StaffAdvanceAPI.logs(adv.id)
      if (res?.success) setAdvanceLogs(res.data || [])
      else throw new Error(res?.error || "Failed to load logs")
    } catch (err) {
      toast({
        title: "Could not load logs",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
      setAdvanceLogsRow(null)
    } finally {
      setAdvanceLogsLoading(false)
    }
  }

  const advanceLogLabel = (type: StaffAdvanceLogEntry["type"]) => {
    if (type === "given") return "Advance given"
    if (type === "recovery") return "Payroll recovery"
    if (type === "reversal") return "Recovery reversed"
    if (type === "adjustment") return "Record updated"
    return "Closed"
  }

  const advanceGivenDateInput = (givenAt: string) => {
    if (!givenAt) return ""
    const d = new Date(givenAt)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  }

  const openEditAdvance = (adv: StaffAdvanceRow) => {
    setEditAdvance(adv)
    setEditAdvanceForm({
      amount: String(adv.amount),
      installmentAmount: adv.installmentAmount > 0 ? String(adv.installmentAmount) : "",
      recoveryFrom: adv.recoveryFrom || "next_cycle",
      givenAt: advanceGivenDateInput(adv.givenAt),
      notes: adv.notes || "",
    })
  }

  const handleSaveAdvanceEdit = async () => {
    if (!editAdvance) return
    if (!editAdvanceForm.amount) {
      toast({ title: "Amount is required", variant: "destructive" })
      return
    }
    setEditAdvanceSaving(true)
    try {
      const res = await StaffAdvanceAPI.update(editAdvance.id, {
        amount: num(editAdvanceForm.amount),
        installmentAmount: num(editAdvanceForm.installmentAmount),
        recoveryFrom: editAdvanceForm.recoveryFrom,
        givenAt: editAdvanceForm.givenAt || undefined,
        notes: editAdvanceForm.notes.trim(),
      })
      if (!res?.success) throw new Error(res?.error || "Failed to update")
      toast({ title: "Advance updated" })
      setEditAdvance(null)
      await Promise.all([loadAdvances(), load()])
    } catch (err) {
      toast({
        title: "Could not update advance",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setEditAdvanceSaving(false)
    }
  }

  const advanceRecoveryFromLabel = (value: StaffAdvanceRecoveryFrom) =>
    value === "current_cycle" ? "This cycle" : "Next cycle"

  const handleDownloadPayslip = async (row: PayrollRow) => {
    try {
      const business = await resolvePayslipBusiness()
      setPayslipBusinessName(business.name)
      downloadPayslipPdf(row, data?.periodLabel || month, {
        business,
        currency: currencySettings.currency,
      })
    } catch (err) {
      toast({
        title: "Could not load business details",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    }
  }

  const handleShareWhatsApp = (row: PayrollRow) => {
    const ok = sharePayslipViaWhatsApp(
      row,
      data?.periodLabel || month,
      formatAmount,
      payslipBusinessName
    )
    if (!ok) {
      toast({
        title: "No phone number",
        description: "Add a mobile number on the staff profile to share via WhatsApp.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label htmlFor="payroll-month" className="text-sm font-medium text-slate-700">
            Payroll period
          </Label>
          <Input
            id="payroll-month"
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            className="w-[200px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.periodLabel ? (
            <div className="mr-2 text-right">
              <p className="text-sm text-muted-foreground">{data.periodLabel}</p>
              {data?.payoutLabel ? (
                <p className="text-xs text-muted-foreground/80">{data.payoutLabel}</p>
              ) : null}
            </div>
          ) : null}
          {data ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportPayrollXlsx(data, formatAmount)}>
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportPayrollPdf(data, formatAmount)}>
                  PDF report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <Tabs
        value={payrollTab}
        onValueChange={(v) => {
          setPayrollTab(v)
          if (v === "advances") void loadAdvances()
        }}
      >
        <TabsList>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="leaves">Leaves</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll" className="mt-4 space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard icon={<Wallet className="h-5 w-5 text-blue-600" />} label="Total payroll" value={formatAmount(totals?.netPay ?? 0)} tint="bg-blue-50" />
            <SummaryCard icon={<BadgeCheck className="h-5 w-5 text-emerald-600" />} label="Paid" value={formatAmount(totals?.paidNet ?? 0)} hint={totals ? `${totals.paidCount} of ${totals.staffCount}` : undefined} tint="bg-emerald-50" />
            <SummaryCard icon={<Banknote className="h-5 w-5 text-amber-600" />} label="Pending" value={formatAmount(totals?.pendingNet ?? 0)} tint="bg-amber-50" />
            <SummaryCard icon={<Users className="h-5 w-5 text-slate-600" />} label="Staff" value={String(totals?.staffCount ?? 0)} tint="bg-slate-100" />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Staff payroll</CardTitle>
              <CardDescription>
                LWP and advance recovery auto-adjust deductions. Commission is calculated from sales.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : rows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">No active staff found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net pay</TableHead>
                        <TableHead>Status</TableHead>
                        {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const busy = savingId === row.staffId
                        return (
                          <TableRow key={row.staffId}>
                            <TableCell>
                              <div className="font-medium text-slate-800">{row.staffName}</div>
                              {(row.unpaidLeaveDays ?? 0) > 0 ? (
                                <div className="text-xs text-amber-600">
                                  {row.unpaidLeaveDays} unpaid leave day(s)
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatAmount(row.baseSalary)}</TableCell>
                            <TableCell className="text-right">
                              <button
                                type="button"
                                className="tabular-nums text-blue-600 hover:underline"
                                onClick={() => setBreakdownRow(row)}
                              >
                                {formatAmount(row.incentive)}
                              </button>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-red-600">
                              {row.deductions > 0 ? `- ${formatAmount(row.deductions)}` : formatAmount(0)}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{formatAmount(row.netPay)}</TableCell>
                            <TableCell>
                              {row.status === "paid" ? (
                                <div>
                                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Paid</Badge>
                                  {row.paymentMethod ? (
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {formatPaymentMethod(row.paymentMethod)}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <Badge variant="secondary">Pending</Badge>
                              )}
                            </TableCell>
                            {canManage ? (
                              <TableCell>
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)} disabled={busy} title="Edit">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => void handleDownloadPayslip(row)}
                                    title="Download payslip"
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleShareWhatsApp(row)} title="Share on WhatsApp">
                                    <MessageCircle className="h-4 w-4" />
                                  </Button>
                                  {row.status === "paid" ? (
                                    <Button variant="outline" size="sm" onClick={() => void handleMarkDraft(row)} disabled={busy}>
                                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                    </Button>
                                  ) : (
                                    <Button size="sm" onClick={() => openMarkPaid(row)} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                                      Pay
                                    </Button>
                                  )}
                                </div>
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

        <TabsContent value="leaves" className="mt-4">
          <StaffLeavesContent month={month} canManage={canManage} onLeaveChange={load} />
        </TabsContent>

        <TabsContent value="advances" className="mt-4 space-y-4">
          {canManage ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Give advance</CardTitle>
                <CardDescription>Choose when payroll recovery should start for this advance.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-6 gap-2 items-end w-full">
                  <div className="min-w-0">
                    <Select value={advanceForm.staffId} onValueChange={(v) => setAdvanceForm((f) => ({ ...f, staffId: v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Staff" /></SelectTrigger>
                      <SelectContent>
                        {staffOptions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Input type="number" min={0} className="w-full" placeholder={`Amount (${getSymbol()})`} value={advanceForm.amount} onChange={(e) => setAdvanceForm((f) => ({ ...f, amount: e.target.value }))} />
                  </div>
                  <div className="min-w-0">
                    <Input type="number" min={0} className="w-full" placeholder="Monthly (0=full)" value={advanceForm.installmentAmount} onChange={(e) => setAdvanceForm((f) => ({ ...f, installmentAmount: e.target.value }))} />
                  </div>
                  <div className="min-w-0">
                    <Select
                      value={advanceForm.recoveryFrom}
                      onValueChange={(v) => setAdvanceForm((f) => ({ ...f, recoveryFrom: v as StaffAdvanceRecoveryFrom }))}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="Recovery from" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="next_cycle">Next cycle</SelectItem>
                        <SelectItem value="current_cycle">This cycle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Input placeholder="Notes" className="w-full" value={advanceForm.notes} onChange={(e) => setAdvanceForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <Button onClick={requestAddAdvance} className="w-full">
                    <Plus className="h-4 w-4 mr-1" />Record
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <AlertDialog open={confirmAdvanceOpen} onOpenChange={setConfirmAdvanceOpen}>
            <AlertDialogContent className="max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm advance</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-4 text-sm text-muted-foreground">
                    <div className="rounded-lg border bg-slate-50 px-3 py-2 text-slate-900">
                      <p><span className="font-medium">Staff:</span> {confirmAdvanceStaffName}</p>
                      <p><span className="font-medium">Amount:</span> {formatAmount(num(advanceForm.amount))}</p>
                      <p>
                        <span className="font-medium">Monthly recovery:</span>{" "}
                        {num(advanceForm.installmentAmount) > 0
                          ? formatAmount(num(advanceForm.installmentAmount))
                          : "Full outstanding each cycle"}
                      </p>
                      <p>
                        <span className="font-medium">Recovery starts:</span>{" "}
                        {advanceRecoveryFromLabel(advanceForm.recoveryFrom)}
                      </p>
                      {advanceForm.notes.trim() ? (
                        <p><span className="font-medium">Notes:</span> {advanceForm.notes.trim()}</p>
                      ) : null}
                    </div>

                    <div>
                      <p className="mb-2 font-medium text-slate-900">Recovery rules</p>
                      <ul className="list-disc space-y-1.5 pl-5">
                        <li>
                          Deduction is applied when payroll is marked <strong>paid</strong>, not when this advance is recorded.
                        </li>
                        <li>
                          <strong>This cycle</strong> — recovery can start in the same month as the advance.
                        </li>
                        <li>
                          <strong>Next cycle</strong> — recovery starts from the following month.
                        </li>
                        <li>
                          Each payroll cycle deducts the monthly recovery amount, or the full outstanding balance if monthly recovery is 0.
                        </li>
                        <li>
                          Reverting payroll to pending credits back advance deductions for that payout.
                        </li>
                        <li>
                          Active advances can be edited later. Closing an advance waives any remaining balance.
                        </li>
                      </ul>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={advanceCreating}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={advanceCreating}
                  onClick={(e) => {
                    e.preventDefault()
                    void handleAddAdvance()
                  }}
                >
                  {advanceCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Recording…
                    </>
                  ) : (
                    "Confirm & record"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Card>
            <CardContent className="pt-6">
              {advancesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : advances.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No active advances.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead className="text-right">Given</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Monthly recovery</TableHead>
                      <TableHead>Recovery from</TableHead>
                      <TableHead className="text-center">Logs</TableHead>
                      {canManage ? <TableHead /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {advances.map((adv) => (
                      <TableRow key={adv.id}>
                        <TableCell>{adv.staffName}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatAmount(adv.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums text-amber-700">{formatAmount(adv.outstanding)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {adv.installmentAmount > 0 ? formatAmount(adv.installmentAmount) : "Full"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {advanceRecoveryFromLabel(adv.recoveryFrom || "next_cycle")}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void openAdvanceLogs(adv)}
                            title="Transaction history"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEditAdvance(adv)} title="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => void handleCloseAdvance(adv.id)}>
                                Close
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={editRow != null} onOpenChange={(open) => (!open ? setEditRow(null) : null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit payroll — {editRow?.staffName}</DialogTitle>
            <DialogDescription>{data?.periodLabel}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {(editRow?.leaveDeduction ?? 0) > 0 || (editRow?.advanceRecovery ?? 0) > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {(editRow?.leaveDeduction ?? 0) > 0 ? (
                  <p>LWP deduction: {formatAmount(editRow?.leaveDeduction ?? 0)} ({editRow?.unpaidLeaveDays} day(s))</p>
                ) : null}
                {(editRow?.advanceRecovery ?? 0) > 0 ? (
                  <p>Advance recovery: {formatAmount(editRow?.advanceRecovery ?? 0)}</p>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Base salary ({getSymbol()})</Label>
                <Input type="number" min={0} value={form.baseSalary} onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Commission ({getSymbol()})</Label>
                <Input type="number" min={0} value={form.incentive} onChange={(e) => setForm((f) => ({ ...f, incentive: e.target.value }))} />
                {editRow?.computedIncentive != null ? (
                  <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setForm((f) => ({ ...f, incentive: String(editRow.computedIncentive ?? 0) }))}>
                    Use calculated: {formatAmount(editRow.computedIncentive)}
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Bonus ({getSymbol()})</Label>
                <Input type="number" min={0} value={form.bonus} onChange={(e) => setForm((f) => ({ ...f, bonus: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Other deductions ({getSymbol()})</Label>
                <Input type="number" min={0} value={form.manualDeductions} onChange={(e) => setForm((f) => ({ ...f, manualDeductions: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Deduction note</Label>
              <Input value={form.deductionNote} onChange={(e) => setForm((f) => ({ ...f, deductionNote: e.target.value }))} placeholder="Additional deduction reason" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-slate-600">Net pay</span>
              <span className="text-lg font-bold tabular-nums">{formatAmount(previewNet)}</span>
            </div>

            {editRow?.recordId ? (
              <div className="border-t pt-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <History className="h-4 w-4" /> Edit history
                </div>
                {auditLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : auditLog.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
                ) : (
                  <ul className="max-h-40 space-y-2 overflow-y-auto text-xs">
                    {auditLog.map((entry) => (
                      <li key={entry.id} className="rounded border px-2 py-1.5">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium capitalize">{entry.action.replace(/_/g, " ")}</span>
                          <span className="text-muted-foreground">
                            {new Date(entry.performedAt).toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="text-muted-foreground">by {entry.performedByName || "Admin"}</div>
                        {entry.changes.length > 0 ? (
                          <div className="mt-1 text-muted-foreground">
                            {entry.changes.map((c, i) => (
                              <div key={i}>{c.field}: {String(c.oldValue ?? "—")} → {String(c.newValue ?? "—")}</div>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark paid dialog */}
      <Dialog open={payRow != null} onOpenChange={(open) => (!open ? setPayRow(null) : null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as paid — {payRow?.staffName}</DialogTitle>
            <DialogDescription>Net pay: {payRow ? formatAmount(payRow.netPay) : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Payment date</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Payment mode</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PayrollPaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="wallet">Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRow(null)}>Cancel</Button>
            <Button onClick={() => void handleConfirmPaid()} className="bg-emerald-600 hover:bg-emerald-700">
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayrollCommissionBreakdownDialog
        open={breakdownRow != null}
        onOpenChange={(open) => (!open ? setBreakdownRow(null) : null)}
        staffId={breakdownRow?.staffId || ""}
        staffName={breakdownRow?.staffName || ""}
        month={month}
        formatAmount={formatAmount}
      />

      <Dialog open={editAdvance != null} onOpenChange={(open) => (!open ? setEditAdvance(null) : null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit advance — {editAdvance?.staffName}</DialogTitle>
            <DialogDescription>
              Recovered {editAdvance ? formatAmount(editAdvance.recoveredAmount) : ""} · Outstanding{" "}
              {editAdvance ? formatAmount(editAdvance.outstanding) : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount ({getSymbol()})</Label>
                <Input
                  type="number"
                  min={editAdvance?.recoveredAmount ?? 0}
                  value={editAdvanceForm.amount}
                  onChange={(e) => setEditAdvanceForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Monthly recovery ({getSymbol()})</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0 = full"
                  value={editAdvanceForm.installmentAmount}
                  onChange={(e) => setEditAdvanceForm((f) => ({ ...f, installmentAmount: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Recovery from</Label>
                <Select
                  value={editAdvanceForm.recoveryFrom}
                  onValueChange={(v) =>
                    setEditAdvanceForm((f) => ({ ...f, recoveryFrom: v as StaffAdvanceRecoveryFrom }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="next_cycle">Next cycle</SelectItem>
                    <SelectItem value="current_cycle">This cycle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Given date</Label>
                <Input
                  type="date"
                  value={editAdvanceForm.givenAt}
                  disabled={(editAdvance?.recoveredAmount ?? 0) > 0}
                  onChange={(e) => setEditAdvanceForm((f) => ({ ...f, givenAt: e.target.value }))}
                />
              </div>
            </div>

            {(editAdvance?.recoveredAmount ?? 0) > 0 ? (
              <p className="text-xs text-muted-foreground">
                Given date cannot be changed after payroll recovery has started.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={editAdvanceForm.notes}
                onChange={(e) => setEditAdvanceForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAdvance(null)} disabled={editAdvanceSaving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveAdvanceEdit()} disabled={editAdvanceSaving}>
              {editAdvanceSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={advanceLogsRow != null}
        onOpenChange={(open) => {
          if (!open) {
            setAdvanceLogsRow(null)
            setAdvanceLogs([])
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Advance logs — {advanceLogsRow?.staffName}</DialogTitle>
            <DialogDescription>
              Given {advanceLogsRow ? formatAmount(advanceLogsRow.amount) : ""} · Outstanding{" "}
              {advanceLogsRow ? formatAmount(advanceLogsRow.outstanding) : ""}
            </DialogDescription>
          </DialogHeader>

          {advanceLogsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : advanceLogs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No transactions recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {advanceLogs.map((entry) => (
                <li key={entry.id} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{advanceLogLabel(entry.type)}</div>
                      {entry.notes ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">{entry.notes}</div>
                      ) : null}
                      {entry.performedByName ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">by {entry.performedByName}</div>
                      ) : null}
                    </div>
                    <div className="text-right shrink-0">
                      {entry.type === "recovery" ? (
                        <div className="font-semibold tabular-nums text-emerald-700">
                          − {formatAmount(entry.amount)}
                        </div>
                      ) : entry.type === "reversal" ? (
                        <div className="font-semibold tabular-nums text-blue-700">
                          + {formatAmount(entry.amount)}
                        </div>
                      ) : entry.type === "given" ? (
                        <div className="font-semibold tabular-nums text-amber-700">
                          + {formatAmount(entry.amount)}
                        </div>
                      ) : entry.type === "adjustment" ? (
                        <div className="text-xs text-muted-foreground">Updated</div>
                      ) : entry.amount > 0 ? (
                        <div className="font-semibold tabular-nums text-slate-600">
                          Waived {formatAmount(entry.amount)}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Settled</div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                        Bal. {formatAmount(entry.outstandingAfter)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  tint,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  hint?: string
  tint: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        {icon ? <div className={`rounded-lg p-2 ${tint}`}>{icon}</div> : null}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-bold text-slate-900">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}
