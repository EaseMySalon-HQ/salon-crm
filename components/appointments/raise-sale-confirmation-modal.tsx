"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { AppointmentsAPI } from "@/lib/api"
import {
  buildFinalTimeline,
  computeCompression,
  formatRange,
  isAllCancelled,
  minutesToApiTime,
  parseTimeToMinutesLoose,
  shouldCompress,
  type FinalizeStatus,
  type SvcRow,
} from "@/lib/booking-finalize"

type Anchor = {
  _id: string
  time?: string
  date?: string
  serviceId?: { _id?: string; name?: string; duration?: number; price?: number } | string
  staffId?: { _id?: string; name?: string } | string
  staffAssignments?: Array<{ staffId: { _id?: string; name?: string } | string; role?: string }>
  duration?: number
  status?: string
  bookingGroupId?: string | null
  // legacy single-doc shape — modal doesn't split these per service
  additionalServices?: Array<{ _id?: string; name?: string; duration?: number; price?: number }>
}

export type RaiseSaleConfirmationResult = {
  /** Appointment docs (full sibling object) chosen for billing, AFTER any time shifts. */
  performed: Anchor[]
  /** Appointment docs marked cancelled_at_billing. */
  cancelled: Anchor[]
  /** True when every service was cancelled — caller should NOT navigate to /quick-sale. */
  skipBilling: boolean
}

type RowState = {
  apt: Anchor
  appointmentId: string
  serviceName: string
  staffId: string
  startMinutes: number
  duration: number
  status: FinalizeStatus
  /** Default checked when service was already started/completed. */
  checked: boolean
  /** Whether this row is locked because it already happened. */
  frozen: boolean
}

function getStaffId(apt: Anchor): string {
  const s: any = apt.staffId
  if (s && typeof s === "object" && s._id) return String(s._id)
  if (typeof s === "string") return s
  const a = apt.staffAssignments?.[0]?.staffId as any
  if (a && typeof a === "object" && a._id) return String(a._id)
  if (typeof a === "string") return a
  return ""
}

function getServiceName(apt: Anchor): string {
  const s: any = apt.serviceId
  if (s && typeof s === "object" && s.name) return String(s.name)
  return "Service"
}

function getDuration(apt: Anchor): number {
  if (typeof apt.duration === "number" && apt.duration > 0) return apt.duration
  const s: any = apt.serviceId
  if (s && typeof s === "object" && typeof s.duration === "number") return s.duration
  return 60
}

function buildRows(siblings: Anchor[]): RowState[] {
  return siblings
    .map((apt) => {
      const status = (apt.status || "scheduled") as FinalizeStatus
      const startMinutes = parseTimeToMinutesLoose(apt.time)
      const frozen = status === "completed"
      const defaultChecked =
        status === "service_started" || status === "completed" || status === "arrived"
      return {
        apt,
        appointmentId: String(apt._id),
        serviceName: getServiceName(apt),
        staffId: getStaffId(apt),
        startMinutes,
        duration: getDuration(apt),
        status,
        checked: defaultChecked,
        frozen,
      }
    })
    .sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes
      return a.appointmentId.localeCompare(b.appointmentId)
    })
}

export interface RaiseSaleConfirmationModalProps {
  open: boolean
  onClose: () => void
  /** The clicked appointment card — used to compute the booking start time. */
  anchor: Anchor | null
  /** All appointment docs in the same bookingGroup (including the anchor). */
  siblings: Anchor[]
  onConfirm: (result: RaiseSaleConfirmationResult) => void
}

/**
 * Per-service confirmation step that runs before /quick-sale when a booking
 * has multiple services. Lets the user uncheck services that were not actually
 * performed (those become 'cancelled_at_billing'). When the cancelled set
 * includes the leading service, remaining performed services are shifted left
 * to start at the original booking time.
 */
export function RaiseSaleConfirmationModal({
  open,
  onClose,
  anchor,
  siblings,
  onConfirm,
}: RaiseSaleConfirmationModalProps) {
  const { toast } = useToast()
  const [rows, setRows] = useState<RowState[]>([])
  const [conflicts, setConflicts] = useState<Map<string, string>>(new Map())
  // Local per-row toggle that lets the user opt OUT of compressing a specific
  // row when the dry-run flagged a conflict for it.
  const [keepOriginalIds, setKeepOriginalIds] = useState<Set<string>>(new Set())
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setRows(buildRows(siblings))
    setConflicts(new Map())
    setKeepOriginalIds(new Set())
  }, [open, siblings])

  const earliestStart = useMemo(() => {
    if (rows.length === 0) return parseTimeToMinutesLoose(anchor?.time)
    return rows[0].startMinutes
  }, [rows, anchor])

  // Decisions + (optional) shifts derived from current row state.
  const { svcRows, shifts, allCancelled, performedRows, cancelledRows } = useMemo(() => {
    const svc: SvcRow[] = rows.map((r) => ({
      appointmentId: r.appointmentId,
      staffId: r.staffId,
      startMinutes: r.startMinutes,
      duration: r.duration,
      status: r.status,
      decision: r.checked ? "perform" : "cancel",
    }))
    const shouldShift = shouldCompress(svc)
    const computed = shouldShift ? computeCompression(svc, earliestStart) : []
    // Honour user-overridden "keep original timing" for individual rows.
    const filteredShifts = computed.filter((s) => !keepOriginalIds.has(s.appointmentId))
    const allCancel = isAllCancelled(svc)
    const performed = rows.filter((r) => r.checked)
    const cancelled = rows.filter((r) => !r.checked)
    return {
      svcRows: svc,
      shifts: filteredShifts,
      allCancelled: allCancel,
      performedRows: performed,
      cancelledRows: cancelled,
    }
  }, [rows, earliestStart, keepOriginalIds])

  // Live compression preview map (appointmentId -> new start minutes) so each
  // row can render its before/after time. Built once so it can be reused.
  const finalTimeline = useMemo(() => {
    const map = new Map<string, { startMinutes: number; endMinutes: number; shifted: boolean }>()
    if (allCancelled) return map
    for (const t of buildFinalTimeline(svcRows, earliestStart)) {
      // Apply the same "keep original" overrides as `shifts`.
      if (t.shifted && keepOriginalIds.has(t.appointmentId)) {
        const row = rows.find((r) => r.appointmentId === t.appointmentId)
        if (row) {
          map.set(t.appointmentId, {
            startMinutes: row.startMinutes,
            endMinutes: row.startMinutes + row.duration,
            shifted: false,
          })
          continue
        }
      }
      map.set(t.appointmentId, {
        startMinutes: t.startMinutes,
        endMinutes: t.endMinutes,
        shifted: t.shifted,
      })
    }
    return map
  }, [svcRows, earliestStart, allCancelled, keepOriginalIds, rows])

  // Live dry-run whenever the proposed shift set changes. We only ask the
  // server when there is at least one shift to check; pure cancellations
  // never conflict and we want to keep this cheap.
  useEffect(() => {
    if (!open) return
    if (shifts.length === 0) {
      setConflicts(new Map())
      return
    }
    const decisions = svcRows
      .filter((r) => r.decision === "perform")
      .map((r) => {
        const shift = shifts.find((s) => s.appointmentId === r.appointmentId)
        return shift
          ? {
              appointmentId: r.appointmentId,
              action: "perform" as const,
              shift: { time: minutesToApiTime(shift.newStartMinutes) },
            }
          : { appointmentId: r.appointmentId, action: "perform" as const }
      })
      .concat(
        svcRows
          .filter((r) => r.decision === "cancel")
          .map((r) => ({ appointmentId: r.appointmentId, action: "cancel" as const })),
      )

    let cancelled = false
    setDryRunLoading(true)
    AppointmentsAPI.finalizeForBilling({ decisions, dryRun: true })
      .then((res) => {
        if (cancelled) return
        const next = new Map<string, string>()
        for (const c of res.conflicts || []) {
          next.set(c.appointmentId, c.reason || "appointment_overlap")
        }
        setConflicts(next)
      })
      .catch(() => {
        if (cancelled) return
        // Pre-flight failure should not block the user — surface a soft warning
        // and let the final submit produce a real error.
        setConflicts(new Map())
      })
      .finally(() => {
        if (!cancelled) setDryRunLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, shifts, svcRows])

  const hasUnresolvedConflict = conflicts.size > 0

  const toggleRow = (id: string) => {
    setRows((prev) => prev.map((r) => (r.appointmentId === id ? { ...r, checked: !r.checked } : r)))
    // Reset the per-row override since the shift set may change.
    setKeepOriginalIds(new Set())
  }

  const handleKeepOriginal = (id: string) => {
    setKeepOriginalIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  const handleConfirm = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const decisions = svcRows
        .filter((r) => r.decision === "perform")
        .map((r) => {
          const shift = shifts.find((s) => s.appointmentId === r.appointmentId)
          return shift
            ? {
                appointmentId: r.appointmentId,
                action: "perform" as const,
                shift: { time: minutesToApiTime(shift.newStartMinutes) },
              }
            : { appointmentId: r.appointmentId, action: "perform" as const }
        })
        .concat(
          svcRows
            .filter((r) => r.decision === "cancel")
            .map((r) => ({ appointmentId: r.appointmentId, action: "cancel" as const })),
        )

      const res = await AppointmentsAPI.finalizeForBilling({ decisions })
      if (!res?.success) {
        if (res?.conflicts && res.conflicts.length > 0) {
          const next = new Map<string, string>()
          for (const c of res.conflicts) next.set(c.appointmentId, c.reason || "appointment_overlap")
          setConflicts(next)
          toast({
            title: "Staff conflict",
            description: "Some shifted services overlap existing bookings. Choose 'Keep original timing' or change the staff.",
            variant: "destructive",
          })
        } else {
          toast({
            title: "Could not finalize",
            description: (res as any)?.error || "Please try again.",
            variant: "destructive",
          })
        }
        return
      }

      // Apply the post-shift times locally so the caller can build the quick-sale
      // payload without waiting for a refetch.
      const performed: Anchor[] = performedRows.map((r) => {
        const t = finalTimeline.get(r.appointmentId)
        if (!t) return r.apt
        return { ...r.apt, time: minutesToApiTime(t.startMinutes), duration: r.duration }
      })

      onConfirm({
        performed,
        cancelled: cancelledRows.map((r) => r.apt),
        skipBilling: allCancelled,
      })

      // Always refresh the calendar so other open views pick up the changes.
      try {
        window.dispatchEvent(new CustomEvent("appointments-refresh"))
      } catch {}
    } catch (err: unknown) {
      const ax = err as { responseData?: { error?: string }; response?: { data?: { error?: string } }; message?: string }
      toast({
        title: "Could not finalize",
        description:
          ax?.responseData?.error ||
          ax?.response?.data?.error ||
          ax?.message ||
          "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirm services performed</DialogTitle>
          <DialogDescription>
            Uncheck any service that was not performed. Cancelled services will be removed from the
            calendar and excluded from billing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[55vh] overflow-y-auto">
          {rows.map((row) => {
            const conflictReason = conflicts.get(row.appointmentId)
            const finalSlot = finalTimeline.get(row.appointmentId)
            const originalRange = formatRange(row.startMinutes, row.startMinutes + row.duration)
            const newRange = finalSlot ? formatRange(finalSlot.startMinutes, finalSlot.endMinutes) : null
            const showShift = !!(finalSlot && finalSlot.shifted)
            return (
              <div
                key={row.appointmentId}
                className={`rounded-lg border p-3 transition-colors ${
                  conflictReason ? "border-red-300 bg-red-50/40" : row.checked ? "border-slate-200" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`svc-${row.appointmentId}`}
                    checked={row.checked}
                    disabled={row.frozen || submitting}
                    onCheckedChange={() => toggleRow(row.appointmentId)}
                    className="mt-1"
                  />
                  <label htmlFor={`svc-${row.appointmentId}`} className="flex-1 min-w-0 cursor-pointer">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm ${row.checked ? "text-slate-900" : "text-slate-500 line-through"}`}>
                        {row.serviceName}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold uppercase tracking-wide"
                      >
                        {row.status.replace(/_/g, " ")}
                      </Badge>
                      {row.frozen && (
                        <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50">
                          Already completed
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {showShift && newRange ? (
                        <span>
                          <span className="line-through opacity-70">{originalRange}</span>
                          <span className="mx-1">→</span>
                          <span className="font-medium text-slate-800">{newRange}</span>
                        </span>
                      ) : row.checked && newRange ? (
                        <span>{newRange}</span>
                      ) : (
                        <span className="opacity-70">{originalRange}</span>
                      )}
                    </div>
                    {conflictReason && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>This staff has another booking at this time.</span>
                        <button
                          type="button"
                          className="underline font-medium hover:text-red-900"
                          onClick={(e) => {
                            e.preventDefault()
                            handleKeepOriginal(row.appointmentId)
                          }}
                        >
                          Keep original timing
                        </button>
                      </div>
                    )}
                  </label>
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || dryRunLoading || hasUnresolvedConflict || rows.length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : allCancelled ? (
              "Mark all cancelled"
            ) : (
              "Confirm and continue"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
