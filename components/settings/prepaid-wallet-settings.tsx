"use client"

import { useEffect, useState } from "react"
import { Loader2, Wallet } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
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
import { cn } from "@/lib/utils"
import { ClientWalletAPI, type ClientWalletSettings } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { WalletLiabilityReport } from "@/components/reports/wallet-liability-report"

const defaultSettings: ClientWalletSettings = {
  allowCouponStacking: false,
  gracePeriodDays: 0,
  allowMultiBranch: false,
  refundPolicy: "service_credit_only",
  minRechargeAmount: 500,
  expiryAlertsEnabled: true,
  combineMultipleWallets: false,
}

function statusBadgeClass(status: string) {
  if (status === "active") return "bg-emerald-600 text-white border-0 shadow-sm"
  if (status === "paused") return "bg-amber-500/90 text-white border-0"
  return "bg-slate-500/90 text-white border-0"
}

export function PrepaidWalletSettings() {
  const { toast } = useToast()
  const [plans, setPlans] = useState<any[]>([])
  const [settings, setSettings] = useState<ClientWalletSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [savingRules, setSavingRules] = useState(false)

  const [form, setForm] = useState({
    name: "",
    payAmount: "",
    creditAmount: "",
    validityDays: "365",
    maxPerClient: "",
    allowCouponStacking: false,
  })

  const load = async () => {
    setLoading(true)
    try {
      const [p, s] = await Promise.all([ClientWalletAPI.listPlans(), ClientWalletAPI.getSettings()])
      if (p.success && p.data?.plans) setPlans(p.data.plans)
      if (s.success && s.data) setSettings({ ...defaultSettings, ...s.data })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const saveRules = async () => {
    setSavingRules(true)
    try {
      const res = await ClientWalletAPI.updateSettings(settings)
      if (res.success) {
        toast({ title: "Business rules saved" })
        if (res.data) setSettings({ ...defaultSettings, ...res.data })
      } else {
        toast({ title: res.message || "Failed", variant: "destructive" })
      }
    } finally {
      setSavingRules(false)
    }
  }

  const createPlan = async () => {
    const res = await ClientWalletAPI.createPlan({
      name: form.name.trim(),
      payAmount: Number(form.payAmount),
      creditAmount: Number(form.creditAmount),
      validityDays: Number(form.validityDays) || 365,
      maxPerClient: form.maxPerClient.trim() ? Number(form.maxPerClient) : null,
      allowCouponStacking: form.allowCouponStacking,
    })
    if (res.success) {
      toast({ title: "Plan created" })
      setForm({
        name: "",
        payAmount: "",
        creditAmount: "",
        validityDays: "365",
        maxPerClient: "",
        allowCouponStacking: false,
      })
      void load()
    } else {
      toast({ title: res.message || "Failed", variant: "destructive" })
    }
  }

  const setPlanStatus = async (id: string, status: "active" | "paused" | "archived") => {
    const res = await ClientWalletAPI.updatePlanStatus(id, status)
    if (res.success) {
      toast({ title: "Plan updated" })
      void load()
    } else {
      toast({ title: res.message || "Failed", variant: "destructive" })
    }
  }

  const deleteArchivedPlan = async (id: string) => {
    if (!confirm("Permanently delete this archived plan? This cannot be undone.")) return
    const res = await ClientWalletAPI.deletePlan(id)
    if (res.success) {
      toast({ title: "Plan removed" })
      void load()
    } else {
      toast({ title: res.message || "Could not delete", variant: "destructive" })
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" aria-hidden />
        <span>Loading prepaid wallet…</span>
      </div>
    )
  }

  const tabTriggerClass =
    "rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-indigo-900 data-[state=active]:shadow-sm data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:text-slate-900"

  return (
    <div className="w-full min-w-0 max-w-none space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/95 via-white to-violet-50/40 p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/20 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
            <Wallet className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Prepaid wallet</h2>
            <p className="max-w-none text-sm leading-relaxed text-slate-600 sm:text-[15px]">
              Sell prepaid credit to clients, set validity and business rules, and monitor outstanding liability.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="plans" className="w-full">
        <TabsList className="grid h-auto w-full max-w-none grid-cols-3 gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1.5 shadow-inner">
          <TabsTrigger value="plans" className={tabTriggerClass}>
            Plans
          </TabsTrigger>
          <TabsTrigger value="rules" className={tabTriggerClass}>
            Business rules
          </TabsTrigger>
          <TabsTrigger value="liability" className={tabTriggerClass}>
            Liability
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-8 space-y-8 focus-visible:outline-none">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
            <Card className="border-slate-200/90 shadow-sm lg:col-span-4 xl:col-span-3">
              <CardHeader className="space-y-1 border-b border-slate-100 bg-slate-50/40 pb-4">
                <CardTitle className="text-lg text-slate-900">New plan</CardTitle>
                <CardDescription>Clients pay the pay amount and receive the credit balance for the validity period.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="pw-plan-name" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Plan name
                  </Label>
                  <Input
                    id="pw-plan-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="h-10 border-slate-200 bg-white"
                    placeholder="e.g. Gold annual pack"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pw-pay" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Pay amount (₹)
                    </Label>
                    <Input
                      id="pw-pay"
                      type="number"
                      value={form.payAmount}
                      onChange={(e) => setForm((f) => ({ ...f, payAmount: e.target.value }))}
                      className="h-10 border-slate-200 bg-white tabular-nums"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw-credit" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Credit amount (₹)
                    </Label>
                    <Input
                      id="pw-credit"
                      type="number"
                      value={form.creditAmount}
                      onChange={(e) => setForm((f) => ({ ...f, creditAmount: e.target.value }))}
                      className="h-10 border-slate-200 bg-white tabular-nums"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw-validity" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Validity (days)
                    </Label>
                    <Input
                      id="pw-validity"
                      type="number"
                      value={form.validityDays}
                      onChange={(e) => setForm((f) => ({ ...f, validityDays: e.target.value }))}
                      className="h-10 border-slate-200 bg-white tabular-nums"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw-max" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Max purchases / client
                    </Label>
                    <Input
                      id="pw-max"
                      type="number"
                      value={form.maxPerClient}
                      onChange={(e) => setForm((f) => ({ ...f, maxPerClient: e.target.value }))}
                      className="h-10 border-slate-200 bg-white tabular-nums"
                      placeholder="Unlimited if empty"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3">
                  <Label htmlFor="pw-plan-stack" className="cursor-pointer text-sm font-medium leading-snug text-slate-800">
                    Allow discount stacking on this plan
                  </Label>
                  <Switch
                    id="pw-plan-stack"
                    checked={form.allowCouponStacking}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, allowCouponStacking: v }))}
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void createPlan()}
                  className="h-10 w-full bg-gradient-to-r from-indigo-600 to-violet-600 font-medium shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-violet-700 sm:w-auto sm:min-w-[140px]"
                >
                  Create plan
                </Button>
              </CardContent>
            </Card>

            <Card className="min-w-0 overflow-hidden border-slate-200/90 shadow-sm lg:col-span-8 xl:col-span-9">
              <CardHeader className="space-y-1 border-b border-slate-100 bg-slate-50/50 pb-4">
                <CardTitle className="text-lg text-slate-900">Plans</CardTitle>
                <CardDescription>Pause or archive plans to stop selling them. Delete only appears for archived plans.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-200/80 hover:bg-transparent">
                        <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Name
                        </TableHead>
                        <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Pay
                        </TableHead>
                        <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Credit
                        </TableHead>
                        <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Validity
                        </TableHead>
                        <TableHead className="h-11 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Status
                        </TableHead>
                        <TableHead className="h-11 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plans.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-14 text-center text-sm text-muted-foreground">
                            No plans yet — create one using the form on the left.
                          </TableCell>
                        </TableRow>
                      ) : (
                        plans.map((pl) => (
                          <TableRow
                            key={pl._id}
                            className="border-slate-100 transition-colors hover:bg-slate-50/60"
                          >
                            <TableCell className="font-medium text-slate-900">{pl.name}</TableCell>
                            <TableCell className="tabular-nums text-slate-700">
                              ₹{Number(pl.payAmount).toLocaleString("en-IN")}
                            </TableCell>
                            <TableCell className="tabular-nums text-slate-700">
                              ₹{Number(pl.creditAmount).toLocaleString("en-IN")}
                            </TableCell>
                            <TableCell className="text-slate-600">{pl.validityDays}d</TableCell>
                            <TableCell>
                              <Badge
                                className={cn(
                                  "px-2.5 py-0.5 text-xs font-medium capitalize",
                                  statusBadgeClass(pl.status)
                                )}
                              >
                                {pl.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {pl.status === "active" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-slate-200 text-xs"
                                    onClick={() => void setPlanStatus(pl._id, "paused")}
                                  >
                                    Pause
                                  </Button>
                                ) : pl.status === "paused" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-slate-200 text-xs"
                                    onClick={() => void setPlanStatus(pl._id, "active")}
                                  >
                                    Resume
                                  </Button>
                                ) : null}
                                {pl.status !== "archived" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                    onClick={() => void setPlanStatus(pl._id, "archived")}
                                  >
                                    Archive
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-8 text-xs font-medium"
                                    onClick={() => void deleteArchivedPlan(String(pl._id))}
                                  >
                                    Delete
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="rules" className="mt-8 w-full max-w-none space-y-4 focus-visible:outline-none">
          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Business rules</CardTitle>
              <CardDescription>These apply to all prepaid wallets at this branch. Save when you are done.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              {[
                {
                  title: "Multi-branch redemption",
                  desc: "Allow using balance at any branch",
                  checked: settings.allowMultiBranch,
                  onChange: (v: boolean) => setSettings((s) => ({ ...s, allowMultiBranch: v })),
                },
                {
                  title: "Coupon / discount stacking",
                  desc: "Allow wallet + bill discounts together",
                  checked: settings.allowCouponStacking,
                  onChange: (v: boolean) => setSettings((s) => ({ ...s, allowCouponStacking: v })),
                },
                {
                  title: "Expiry SMS / WhatsApp alerts",
                  desc: "Reminders at 30, 15, and 7 days before expiry",
                  checked: settings.expiryAlertsEnabled,
                  onChange: (v: boolean) => setSettings((s) => ({ ...s, expiryAlertsEnabled: v })),
                },
                {
                  title: "Combine multiple wallets",
                  desc: "When on, prepaid balance is shared across wallets at checkout (soonest-expiring debited first). When off, each wallet stays separate.",
                  checked: settings.combineMultipleWallets,
                  onChange: (v: boolean) => setSettings((s) => ({ ...s, combineMultipleWallets: v })),
                },
              ].map((row) => (
                <div
                  key={row.title}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{row.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{row.desc}</p>
                  </div>
                  <Switch checked={row.checked} onCheckedChange={row.onChange} />
                </div>
              ))}

              <div className="grid gap-5 pt-2 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pw-grace" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Grace period after expiry (days)
                  </Label>
                  <Input
                    id="pw-grace"
                    type="number"
                    min={0}
                    max={90}
                    value={settings.gracePeriodDays}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, gracePeriodDays: Number(e.target.value) || 0 }))
                    }
                    className="h-10 border-slate-200 bg-white tabular-nums"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw-min" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Minimum issue amount (₹)
                  </Label>
                  <Input
                    id="pw-min"
                    type="number"
                    min={0}
                    value={settings.minRechargeAmount}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, minRechargeAmount: Number(e.target.value) || 0 }))
                    }
                    className="h-10 border-slate-200 bg-white tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pw-refund" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Refund policy
                </Label>
                <select
                  id="pw-refund"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:ring-offset-2"
                  value={settings.refundPolicy}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      refundPolicy: e.target.value as ClientWalletSettings["refundPolicy"],
                    }))
                  }
                >
                  <option value="service_credit_only">Service credit only (no cash refunds)</option>
                  <option value="no_refunds">No refunds</option>
                </select>
              </div>

              <div className="pt-2">
                <Button
                  type="button"
                  onClick={() => void saveRules()}
                  disabled={savingRules}
                  className="h-10 min-w-[160px] bg-gradient-to-r from-indigo-600 to-violet-600 font-medium shadow-md shadow-indigo-500/20 hover:from-indigo-700 hover:to-violet-700"
                >
                  {savingRules ? "Saving…" : "Save business rules"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="liability" className="mt-8 focus-visible:outline-none">
          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Liability</CardTitle>
              <CardDescription>Outstanding prepaid credit across clients.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <WalletLiabilityReport />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
