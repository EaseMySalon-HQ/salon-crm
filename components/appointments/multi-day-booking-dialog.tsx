"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import axios from "axios"
import { CalendarRange, Loader2, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { BookingsAPI, ServicesAPI, StaffDirectoryAPI } from "@/lib/api"
import { clientStore, type Client } from "@/lib/client-store"
import { cn } from "@/lib/utils"

function todayYmdIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** Build IST wall-time ISO strings for API (matches backend `+05:30` expectation). */
function isoRangeIST(ymd: string, timeHHmm: string, durationMinutes: number): { startAt: string; endAt: string } {
  const [h, mi] = timeHHmm.split(":").map((x) => parseInt(x, 10))
  const hh = Number.isFinite(h) ? h : 0
  const mm = Number.isFinite(mi) ? mi : 0
  const startAt = `${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`
  const start = new Date(startAt)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const parts = f.formatToParts(end)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const endAt = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+05:30`
  return { startAt, endAt }
}

type ServiceOption = { _id: string; id?: string; name: string; duration?: number; price?: number }
type StaffOption = { _id?: string; id?: string; name?: string; email?: string; role?: string; isActive?: boolean; allowAppointmentScheduling?: boolean }

type UnitRow = {
  id: string
  date: string
  startTime: string
  serviceId: string
  staffId: string
}

function newRow(): UnitRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    date: todayYmdIST(),
    startTime: "10:00",
    serviceId: "",
    staffId: "",
  }
}

export interface MultiDayBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function MultiDayBookingDialog({ open, onOpenChange, onSuccess }: MultiDayBookingDialogProps) {
  const { toast } = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<Client | null>(null)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [services, setServices] = useState<ServiceOption[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [rows, setRows] = useState<UnitRow[]>(() => [newRow(), newRow()])
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(false)

  const refreshClients = useCallback(() => {
    setClients(clientStore.getClients())
  }, [])

  useEffect(() => {
    const unsub = clientStore.subscribe(refreshClients)
    return unsub
  }, [refreshClients])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoadingData(true)
      try {
        await clientStore.loadClients()
        if (cancelled) return
        refreshClients()
        const [svcRes, staffRes] = await Promise.all([
          ServicesAPI.getAll({ limit: 500 }),
          StaffDirectoryAPI.getAll(),
        ])
        if (cancelled) return
        if (svcRes.success && svcRes.data) setServices(svcRes.data as ServiceOption[])
        if (staffRes.success && staffRes.data) {
          const list = (staffRes.data as StaffOption[]).filter(
            (u) =>
              (u._id || u.id) &&
              (u.role === "staff" || u.role === "manager" || u.role === "admin") &&
              u.isActive === true &&
              u.allowAppointmentScheduling === true
          )
          setStaff(list)
        }
      } catch (e) {
        console.error(e)
        toast({ title: "Could not load form data", variant: "destructive" })
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, refreshClients, toast])

  useEffect(() => {
    if (!open) {
      setSelectedCustomer(null)
      setCustomerSearch("")
      setShowCustomerDropdown(false)
      setRows([newRow(), newRow()])
    }
  }, [open])

  const phoneDigits = useMemo(() => customerSearch.replace(/\D/g, ""), [customerSearch])

  const filteredCustomers = useMemo(() => {
    if (phoneDigits.length < 3) return []
    return clients.filter((c) => c.phone.replace(/\D/g, "").includes(phoneDigits))
  }, [clients, phoneDigits])

  const serviceById = useMemo(() => {
    const m = new Map<string, ServiceOption>()
    for (const s of services) {
      const id = s._id || s.id
      if (id) m.set(String(id), s)
    }
    return m
  }, [services])

  const updateRow = (rowId: string, patch: Partial<UnitRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)))
  }

  const addRow = () => setRows((prev) => [...prev, newRow()])
  const removeRow = (rowId: string) => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== rowId)))

  const handleSubmit = async () => {
    const clientId = selectedCustomer?._id || selectedCustomer?.id
    if (!clientId) {
      toast({ title: "Select a client", variant: "destructive" })
      return
    }
    for (const r of rows) {
      if (!r.serviceId || !r.staffId || !r.date || !r.startTime) {
        toast({
          title: "Complete each row",
          description: "Date, time, service, and staff are required for every visit.",
          variant: "destructive",
        })
        return
      }
    }

    const units = rows.map((r) => {
      const svc = serviceById.get(r.serviceId)
      const duration = svc?.duration ?? 60
      const price = svc?.price
      const { startAt, endAt } = isoRangeIST(r.date, r.startTime, duration)
      return {
        serviceId: r.serviceId,
        staffId: r.staffId,
        startAt,
        endAt,
        ...(price != null ? { price } : {}),
      }
    })

    setLoading(true)
    try {
      const res = await BookingsAPI.create({
        clientId: String(clientId),
        type: "multi_day",
        paymentMode: "per_appointment",
        units,
      })
      if (!res.success) {
        const msg = (res as { error?: string }).error || "Booking failed"
        toast({ title: "Could not create booking", description: msg, variant: "destructive" })
        return
      }
      toast({
        title: "Multi-day booking created",
        description: `${units.length} appointment(s) linked to one booking.`,
      })
      onSuccess?.()
      onOpenChange(false)
    } catch (e: unknown) {
      let msg = "Something went wrong."
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === "object") {
        const d = e.response.data as { error?: string }
        if (typeof d.error === "string") msg = d.error
      }
      toast({
        title: "Could not create booking",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden min-h-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <CalendarRange className="h-5 w-5 text-violet-600" />
            Multi-day booking
          </DialogTitle>
          <DialogDescription>
            Schedule several visits on different dates under one booking. Times use India (IST).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-1 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-5 pb-4">
            <div className="relative space-y-2">
              <Label>Client</Label>
              <Input
                placeholder="Enter at least 3 digits of client phone…"
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
                onBlur={() => {
                  window.setTimeout(() => setShowCustomerDropdown(false), 180)
                }}
                className="h-11"
              />
              {showCustomerDropdown && phoneDigits.length >= 3 && filteredCustomers.length > 0 && (
                <ul
                  className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                  role="listbox"
                >
                  {filteredCustomers.slice(0, 50).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
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
              {selectedCustomer && (
                <p className="text-xs text-slate-500">
                  Selected: {selectedCustomer.name} · {selectedCustomer.phone}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Visits</Label>
                <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
                  <Plus className="h-4 w-4" />
                  Add visit
                </Button>
              </div>

              {loadingData && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading services and staff…
                </div>
              )}

              <div className="space-y-3">
                {rows.map((row, idx) => {
                  const svc = row.serviceId ? serviceById.get(row.serviceId) : undefined
                  const dur = svc?.duration ?? 60
                  return (
                    <div
                      key={row.id}
                      className={cn(
                        "rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3",
                        "grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
                      )}
                    >
                      <div className="lg:col-span-2 space-y-1.5">
                        <Label className="text-xs text-slate-600">Date</Label>
                        <Input
                          type="date"
                          value={row.date}
                          onChange={(e) => updateRow(row.id, { date: e.target.value })}
                          className="h-10 bg-white"
                        />
                      </div>
                      <div className="lg:col-span-2 space-y-1.5">
                        <Label className="text-xs text-slate-600">Start</Label>
                        <Input
                          type="time"
                          value={row.startTime}
                          onChange={(e) => updateRow(row.id, { startTime: e.target.value })}
                          className="h-10 bg-white"
                        />
                      </div>
                      <div className="lg:col-span-4 space-y-1.5">
                        <Label className="text-xs text-slate-600">Service</Label>
                        <Select
                          value={row.serviceId || undefined}
                          onValueChange={(v) => updateRow(row.id, { serviceId: v })}
                        >
                          <SelectTrigger className="h-10 bg-white">
                            <SelectValue placeholder="Select service" />
                          </SelectTrigger>
                          <SelectContent>
                            {services.map((s) => {
                              const id = String(s._id || s.id)
                              return (
                                <SelectItem key={id} value={id}>
                                  {s.name} ({s.duration ?? 60} min)
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="lg:col-span-3 space-y-1.5">
                        <Label className="text-xs text-slate-600">Staff</Label>
                        <Select
                          value={row.staffId || undefined}
                          onValueChange={(v) => updateRow(row.id, { staffId: v })}
                        >
                          <SelectTrigger className="h-10 bg-white">
                            <SelectValue placeholder="Select staff" />
                          </SelectTrigger>
                          <SelectContent>
                            {staff.map((u) => {
                              const id = String(u._id || u.id)
                              return (
                                <SelectItem key={id} value={id}>
                                  {u.name || u.email || id}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="lg:col-span-1 flex sm:justify-end items-end pb-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-slate-400 hover:text-red-600"
                          disabled={rows.length <= 1}
                          onClick={() => removeRow(row.id)}
                          aria-label={`Remove visit ${idx + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {row.serviceId && (
                        <p className="lg:col-span-12 text-xs text-slate-500">
                          Duration {dur} min (from service catalog)
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-white shrink-0 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-violet-600 hover:bg-violet-700"
            onClick={handleSubmit}
            disabled={loading || loadingData}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create booking"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
