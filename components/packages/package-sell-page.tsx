"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Boxes, CalendarRange, Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { PackagesAPI, ServicesAPI, StaffDirectoryAPI } from "@/lib/api"
import { clientStore, type Client } from "@/lib/client-store"
import { isoRangeIST, todayYmdIST } from "@/lib/ist-scheduling"
import { cn } from "@/lib/utils"

type ServiceOption = { _id: string; id?: string; name: string; duration?: number; price?: number }
type StaffOption = { _id?: string; id?: string; name?: string; isActive?: boolean; allowAppointmentScheduling?: boolean }

type PackageServiceLine = {
  serviceId: string
  name: string
  duration: number
  isOptional: boolean
}

type SittingRow = {
  id: string
  sessionNumber: number
  schedule: boolean
  date: string
  startTime: string
  serviceId: string
  staffId: string
}

function newSittingRow(sessionNumber: number, defaultServiceId: string): SittingRow {
  return {
    id: `sit-${sessionNumber}-${Date.now()}`,
    sessionNumber,
    schedule: sessionNumber === 1,
    date: todayYmdIST(),
    startTime: "10:00",
    serviceId: defaultServiceId,
    staffId: "",
  }
}

function resolveServiceId(raw: unknown): string {
  if (raw == null) return ""
  if (typeof raw === "object" && raw !== null && "_id" in raw) {
    return String((raw as { _id: unknown })._id)
  }
  return String(raw)
}

export function PackageSellPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefillPackageId = searchParams?.get("packageId") ?? ""
  const { toast } = useToast()

  const [packages, setPackages] = useState<Array<{ _id: string; name: string; total_price: number; total_sittings: number }>>([])
  const [selectedPackageId, setSelectedPackageId] = useState(prefillPackageId)
  const [packageDetail, setPackageDetail] = useState<{
    total_price: number
    total_sittings: number
    name: string
    type: string
  } | null>(null)
  const [packageServices, setPackageServices] = useState<PackageServiceLine[]>([])

  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Client | null>(null)
  const [clients, setClients] = useState<Client[]>([])

  const refreshClients = useCallback(() => {
    setClients(clientStore.getClients())
  }, [])

  const [amountPaid, setAmountPaid] = useState("")
  const [scheduleNow, setScheduleNow] = useState(true)
  const [sittingRows, setSittingRows] = useState<SittingRow[]>([])

  const [services, setServices] = useState<ServiceOption[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadingPackage, setLoadingPackage] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const phoneDigits = customerSearch.replace(/\D/g, "")
  const filteredCustomers = useMemo(() => {
    if (phoneDigits.length < 3) return []
    return clients.filter((c) => c.phone.replace(/\D/g, "").includes(phoneDigits))
  }, [clients, phoneDigits])

  const defaultServiceId = packageServices[0]?.serviceId ?? ""

  useEffect(() => {
    const unsub = clientStore.subscribe(refreshClients)
    return unsub
  }, [refreshClients])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingMeta(true)
      try {
        await clientStore.loadClients()
        if (cancelled) return
        refreshClients()
        const [pkgRes, svcRes, staffRes] = await Promise.all([
          PackagesAPI.list({ status: "ACTIVE", limit: 100 }),
          ServicesAPI.getAll({ limit: 500 }),
          StaffDirectoryAPI.getAll(),
        ])
        if (cancelled) return
        if (pkgRes.success && pkgRes.data?.packages) {
          setPackages(pkgRes.data.packages)
        }
        if (svcRes.success && svcRes.data) {
          setServices(svcRes.data as ServiceOption[])
        }
        if (staffRes.success && staffRes.data) {
          const staffList = (staffRes.data as StaffOption[]).filter(
            (s) =>
              (s._id || s.id) &&
              (s.role === "staff" || s.role === "manager" || s.role === "admin") &&
              s.isActive === true &&
              s.allowAppointmentScheduling === true
          )
          setStaff(staffList)
        }
      } catch {
        if (!cancelled) {
          toast({ title: "Could not load catalog", variant: "destructive" })
        }
      } finally {
        if (!cancelled) setLoadingMeta(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshClients, toast])

  const loadPackageDetail = useCallback(
    async (packageId: string) => {
      if (!packageId) {
        setPackageDetail(null)
        setPackageServices([])
        setSittingRows([])
        return
      }
      setLoadingPackage(true)
      try {
        const res = await PackagesAPI.getById(packageId)
        if (!res.success || !res.data) {
          throw new Error("Package not found")
        }
        const pkg = res.data
        setPackageDetail({
          name: pkg.name,
          type: pkg.type,
          total_price: pkg.total_price,
          total_sittings: pkg.total_sittings,
        })
        setAmountPaid(String(pkg.total_price))

        const lines: PackageServiceLine[] = (pkg.services ?? []).map((row) => {
          const sid = resolveServiceId(row.service_id)
          const populated =
            typeof row.service_id === "object" && row.service_id !== null ? row.service_id : null
          const catalog = services.find((s) => (s._id || s.id) === sid)
          return {
            serviceId: sid,
            name: populated?.name ?? catalog?.name ?? "Service",
            duration: catalog?.duration ?? 60,
            isOptional: !!row.is_optional,
          }
        })
        setPackageServices(lines)
        const firstService = lines[0]?.serviceId ?? ""
        setSittingRows(
          Array.from({ length: pkg.total_sittings }, (_, i) => newSittingRow(i + 1, firstService))
        )
      } catch {
        toast({ title: "Could not load package details", variant: "destructive" })
        setPackageDetail(null)
        setPackageServices([])
        setSittingRows([])
      } finally {
        setLoadingPackage(false)
      }
    },
    [services, toast]
  )

  useEffect(() => {
    if (selectedPackageId) {
      loadPackageDetail(selectedPackageId)
    }
  }, [selectedPackageId, loadPackageDetail])

  useEffect(() => {
    if (prefillPackageId) setSelectedPackageId(prefillPackageId)
  }, [prefillPackageId])

  const serviceById = useMemo(() => {
    const map = new Map<string, ServiceOption>()
    for (const s of services) {
      const id = s._id || s.id
      if (id) map.set(String(id), s)
    }
    for (const ps of packageServices) {
      if (!map.has(ps.serviceId)) {
        map.set(ps.serviceId, { _id: ps.serviceId, name: ps.name, duration: ps.duration })
      }
    }
    return map
  }, [services, packageServices])

  const paidNum = parseFloat(amountPaid) || 0
  const outstanding =
    packageDetail != null ? Math.max(0, packageDetail.total_price - paidNum) : 0
  const paymentStatusLabel =
    outstanding <= 0 ? "Fully paid" : paidNum > 0 ? "Partial payment" : "Payment pending"

  const updateRow = (rowId: string, patch: Partial<SittingRow>) => {
    setSittingRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)))
  }

  const handleSubmit = async () => {
    const clientId = selectedCustomer?._id || selectedCustomer?.id
    if (!clientId) {
      toast({ title: "Select a client", variant: "destructive" })
      return
    }
    if (!selectedPackageId || !packageDetail) {
      toast({ title: "Select a package", variant: "destructive" })
      return
    }

    const rowsToSchedule = scheduleNow
      ? sittingRows.filter((r) => r.schedule && r.date && r.startTime && r.serviceId && r.staffId)
      : []

    if (scheduleNow) {
      for (const r of sittingRows.filter((x) => x.schedule)) {
        if (!r.date || !r.startTime || !r.serviceId || !r.staffId) {
          toast({
            title: "Complete scheduled sittings",
            description: `Sitting ${r.sessionNumber} needs date, time, service, and staff — or uncheck Schedule.`,
            variant: "destructive",
          })
          return
        }
      }
    }

    setSubmitting(true)
    try {
      const sellRes = await PackagesAPI.sell(selectedPackageId, {
        client_id: String(clientId),
        amount_paid: paidNum,
      })
      if (!sellRes.success || !sellRes.data?.clientPackage?._id) {
        toast({
          title: "Could not sell package",
          description: sellRes.message || sellRes.error || "Try again.",
          variant: "destructive",
        })
        return
      }

      if (sellRes.data.warning) {
        toast({ title: "Note", description: sellRes.data.warning })
      }

      const clientPackageId = String(sellRes.data.clientPackage._id)
      let scheduledCount = 0

      if (rowsToSchedule.length > 0) {
        const sessionsRes = await PackagesAPI.listSessions(clientPackageId)
        if (!sessionsRes.success) {
          toast({
            title: "Package sold — scheduling failed",
            description: "Assign sittings later from the client profile.",
            variant: "destructive",
          })
          router.push("/settings?section=packages")
          return
        }

        const blockIfPendingPayment = sellRes.data.clientPackage.payment_status !== "PAID"

        for (const row of rowsToSchedule) {
          const svc = serviceById.get(row.serviceId)
          const duration = svc?.duration ?? 60
          const { startAt, endAt } = isoRangeIST(row.date, row.startTime, duration)
          const schedRes = await PackagesAPI.scheduleSession(clientPackageId, {
            sessionNumber: row.sessionNumber,
            serviceId: row.serviceId,
            staffId: row.staffId,
            startAt,
            endAt,
            blockIfPendingPayment,
          })
          if (!schedRes.success) {
            toast({
              title: `Sitting ${row.sessionNumber} not scheduled`,
              description: schedRes.message || schedRes.error || "Conflict or validation error.",
              variant: "destructive",
            })
          } else {
            scheduledCount++
          }
        }
      }

      toast({
        title: "Package sold",
        description:
          scheduledCount > 0
            ? `${packageDetail.name} sold · ${scheduledCount} sitting${scheduledCount !== 1 ? "s" : ""} scheduled on the calendar.`
            : `${packageDetail.name} sold · schedule sittings anytime from Packages or the client record.`,
      })

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("appointments-refresh"))
      }
      router.push("/settings?section=packages")
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100/80 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href="/settings?section=packages" aria-label="Back to packages">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Boxes className="h-6 w-6 text-violet-600" />
              Sell package
            </h1>
            <p className="text-sm text-slate-500">Collect payment today and optionally book future sittings.</p>
          </div>
        </div>

        {loadingMeta ? (
          <div className="flex justify-center py-20 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Client */}
            <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              <h2 className="font-semibold text-slate-800">1. Client</h2>
              <div className="relative">
                <Input
                  placeholder="Search by phone (min 3 digits) or name…"
                  autoComplete="off"
                  value={customerSearch}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value.length > 0 && /^\d+$/.test(value)) {
                      setCustomerSearch(value.replace(/\D/g, "").slice(0, 10))
                    } else {
                      setCustomerSearch(value)
                    }
                    setShowCustomerDropdown(true)
                    if (selectedCustomer && !value) setSelectedCustomer(null)
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => window.setTimeout(() => setShowCustomerDropdown(false), 180)}
                />
                {showCustomerDropdown && phoneDigits.length >= 3 && filteredCustomers.length > 0 && (
                  <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-white py-1 shadow-lg">
                    {filteredCustomers.slice(0, 40).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSelectedCustomer(c)
                            setCustomerSearch(c.name)
                            setShowCustomerDropdown(false)
                          }}
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-slate-500 ml-2">{c.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {selectedCustomer && (
                <p className="text-sm text-emerald-700">
                  Selected: <span className="font-medium">{selectedCustomer.name}</span>
                </p>
              )}
            </section>

            {/* Package */}
            <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
              <h2 className="font-semibold text-slate-800">2. Package</h2>
              <Select value={selectedPackageId || undefined} onValueChange={setSelectedPackageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a package" />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name} — ₹{p.total_price.toLocaleString("en-IN")} ({p.total_sittings} sittings)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loadingPackage && (
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading package…
                </p>
              )}
              {packageDetail && !loadingPackage && (
                <p className="text-sm text-slate-600">
                  {packageDetail.total_sittings} sitting{packageDetail.total_sittings !== 1 ? "s" : ""}
                  {packageDetail.type === "CUSTOMIZED" ? " · client picks services per visit" : " · fixed service bundle"}
                </p>
              )}
            </section>

            {/* Payment */}
            {packageDetail && (
              <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
                <h2 className="font-semibold text-slate-800">3. Payment</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pkg-total">Package price (₹)</Label>
                    <Input id="pkg-total" value={packageDetail.total_price} disabled className="bg-slate-50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pkg-paid">Amount paid today (₹)</Label>
                    <Input
                      id="pkg-paid"
                      type="number"
                      min={0}
                      step={1}
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-sm text-slate-600">
                  {paymentStatusLabel}
                  {outstanding > 0 ? ` · ₹${outstanding.toLocaleString("en-IN")} outstanding` : ""}
                </p>
                {outstanding > 0 && scheduleNow && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Partial or pending payment may block scheduling until the package is fully paid.
                  </p>
                )}
              </section>
            )}

            {/* Schedule */}
            {packageDetail && sittingRows.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-violet-600" />
                    4. Schedule sittings
                  </h2>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <Checkbox checked={scheduleNow} onCheckedChange={(v) => setScheduleNow(v === true)} />
                    Schedule now
                  </label>
                </div>
                {!scheduleNow ? (
                  <p className="text-sm text-slate-500">
                    Package will be sold without calendar appointments. Book sittings later when the client is ready.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sittingRows.map((row) => (
                      <div
                        key={row.id}
                        className={cn(
                          "rounded-lg border p-3 space-y-3",
                          row.schedule ? "border-slate-200 bg-slate-50/50" : "border-dashed border-slate-200 opacity-60"
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                            <Checkbox
                              checked={row.schedule}
                              onCheckedChange={(v) => updateRow(row.id, { schedule: v === true })}
                            />
                            Sitting {row.sessionNumber}
                          </label>
                          {row.schedule && sittingRows.filter((r) => r.schedule).length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-slate-500"
                              onClick={() => updateRow(row.id, { schedule: false })}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Skip
                            </Button>
                          )}
                        </div>
                        {row.schedule && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-slate-500">Date</Label>
                              <Input
                                type="date"
                                className="h-9 cursor-pointer"
                                min={todayYmdIST()}
                                value={row.date}
                                onClick={(e) => {
                                  const el = e.currentTarget
                                  if (typeof el.showPicker === "function") {
                                    try {
                                      el.showPicker()
                                    } catch {
                                      /* ignore */
                                    }
                                  }
                                }}
                                onChange={(e) => updateRow(row.id, { date: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-slate-500">Time</Label>
                              <Input
                                type="time"
                                className="h-9"
                                value={row.startTime}
                                onChange={(e) => updateRow(row.id, { startTime: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-slate-500">Service</Label>
                              <Select
                                value={row.serviceId || undefined}
                                onValueChange={(v) => updateRow(row.id, { serviceId: v })}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Service" />
                                </SelectTrigger>
                                <SelectContent>
                                  {packageServices.map((ps) => (
                                    <SelectItem key={ps.serviceId} value={ps.serviceId}>
                                      {ps.name}
                                      {ps.isOptional ? " (optional)" : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-slate-500">Staff</Label>
                              <Select
                                value={row.staffId || undefined}
                                onValueChange={(v) => updateRow(row.id, { staffId: v })}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Staff" />
                                </SelectTrigger>
                                <SelectContent>
                                  {staff.map((m) => {
                                    const id = String(m._id || m.id)
                                    return (
                                      <SelectItem key={id} value={id}>
                                        {m.name || "Staff"}
                                      </SelectItem>
                                    )
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <div className="flex flex-wrap gap-3 justify-end pt-2">
              <Button variant="outline" asChild disabled={submitting}>
                <Link href="/settings?section=packages">Cancel</Link>
              </Button>
              <Button
                className="bg-violet-600 hover:bg-violet-700 min-w-[140px]"
                disabled={submitting || !packageDetail || loadingPackage}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Sell package"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
