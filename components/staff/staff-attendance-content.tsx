"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { LogIn, LogOut, Loader2, UserCheck, CheckCircle2, Clock, AlertTriangle, Timer, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { hasStaffDirectoryTabPermission } from "@/lib/permission-mappings"
import { formatInIST, getTodayIST } from "@/lib/date-utils"
import {
  StaffAttendanceAPI,
  StaffDirectoryAPI,
  type StaffAttendanceRow,
} from "@/lib/api"

function formatTime(iso: string | null): string {
  if (!iso) return "—"
  return formatInIST(iso, { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()
}

function durationLabel(checkIn: string, checkOut: string | null): string {
  if (!checkOut) return "—"
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime()
  if (ms <= 0) return "—"
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function markedByLabel(row: StaffAttendanceRow): string {
  const parts: string[] = []
  if (row.checkInByName) parts.push(`In: ${row.checkInByName}`)
  if (row.checkOutByName) parts.push(`Out: ${row.checkOutByName}`)
  return parts.length ? parts.join(" · ") : "—"
}

function staffInitials(name?: string): string {
  if (!name?.trim()) return "?"
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

type StaffOption = {
  id: string
  name: string
  avatar?: string
}

function StaffConfirmAvatar({ name, avatar }: { name: string; avatar?: string }) {
  return (
    <Avatar className="h-20 w-20 border-2 border-white shadow-md">
      <AvatarImage src={avatar || undefined} alt={name} />
      <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xl font-semibold">
        {staffInitials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

const DAY_STATUS_META: Record<string, { label: string; className: string }> = {
  present: { label: "Present", className: "bg-emerald-600 text-white border-0" },
  half_day: { label: "Half day", className: "bg-orange-500 text-white border-0" },
  absent: { label: "Absent", className: "bg-rose-600 text-white border-0" },
}

function DayStatusBadge({ row }: { row: StaffAttendanceRow }) {
  if (!row.dayStatus) return <span className="text-muted-foreground">—</span>
  if (row.dayStatus === "late") {
    const suffix = row.lateMinutes ? ` (${row.lateMinutes}m)` : ""
    return <span className="font-medium text-red-600">Late{suffix}</span>
  }
  const meta = DAY_STATUS_META[row.dayStatus] || DAY_STATUS_META.present
  return <Badge className={meta.className}>{meta.label}</Badge>
}

type CheckInStatusKind = "on_time" | "late" | "half_day"

function resolveCheckInStatus(row: StaffAttendanceRow): CheckInStatusKind {
  if (row.dayStatus === "half_day") return "half_day"
  if (row.dayStatus === "late") return "late"
  return "on_time"
}

const CHECK_IN_STATUS_META: Record<
  CheckInStatusKind,
  { label: string; Icon: typeof CheckCircle2; textClass: string; bgClass: string }
> = {
  on_time: {
    label: "On Time",
    Icon: CheckCircle2,
    textClass: "text-emerald-700",
    bgClass: "bg-emerald-50 border-emerald-100",
  },
  late: {
    label: "Late",
    Icon: Clock,
    textClass: "text-red-600",
    bgClass: "bg-red-50 border-red-100",
  },
  half_day: {
    label: "Half day",
    Icon: AlertTriangle,
    textClass: "text-orange-600",
    bgClass: "bg-orange-50 border-orange-100",
  },
}

const DIALOG_UNMOUNT_DELAY_MS = 350

function CheckInResultDialog({
  row,
  open,
  onOpenChange,
}: {
  row: StaffAttendanceRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const statusKind = row ? resolveCheckInStatus(row) : "on_time"
  const meta = CHECK_IN_STATUS_META[statusKind]
  const StatusIcon = meta.Icon
  const statusLabel =
    row && statusKind === "late" && row.lateMinutes
      ? `${meta.label} (${row.lateMinutes}m)`
      : meta.label

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl border-slate-200">
        <DialogHeader className="space-y-1 text-center sm:text-center">
          <DialogTitle className="text-xl font-semibold text-slate-900">Checked in</DialogTitle>
        </DialogHeader>
        {row ? (
          <div className="space-y-4 py-2">
            <div className="text-center">
              <p className="text-sm text-slate-500">Staff</p>
              <p className="text-lg font-semibold text-slate-900">{row.staffName}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-500">Check-in time</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatTime(row.checkInAt)}
              </p>
            </div>
            <div
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 ${meta.bgClass}`}
            >
              <StatusIcon className={`h-6 w-6 shrink-0 ${meta.textClass}`} />
              <span className={`text-lg font-bold ${meta.textClass}`}>{statusLabel}</span>
            </div>
          </div>
        ) : null}
        <DialogFooter className="sm:justify-center">
          <DialogClose asChild>
            <Button type="button" className="min-w-[120px]">
              OK
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CheckOutResultDialog({
  row,
  open,
  onOpenChange,
}: {
  row: StaffAttendanceRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const totalDuration = row ? durationLabel(row.checkInAt, row.checkOutAt) : "—"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl border-slate-200">
        <DialogHeader className="space-y-1 text-center sm:text-center">
          <DialogTitle className="text-xl font-semibold text-slate-900">Checked out</DialogTitle>
        </DialogHeader>
        {row ? (
          <div className="space-y-4 py-2">
            <div className="text-center">
              <p className="text-sm text-slate-500">Staff</p>
              <p className="text-lg font-semibold text-slate-900">{row.staffName}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-500">Check-out time</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatTime(row.checkOutAt)}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
              <Timer className="h-6 w-6 shrink-0 text-indigo-600" />
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-indigo-600/80">
                  Total duration
                </p>
                <p className="text-lg font-bold tabular-nums text-indigo-700">{totalDuration}</p>
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter className="sm:justify-center">
          <DialogClose asChild>
            <Button type="button" className="min-w-[120px]">
              OK
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function StaffAttendanceContent() {
  const { toast } = useToast()
  const { user, hasPermission } = useAuth()
  const isStaffUser = user?.role === "staff" && !user?.isOwner
  const canMarkForOthers = hasStaffDirectoryTabPermission(hasPermission, "staff_attendance", "view")
  const canCorrectAttendance = hasStaffDirectoryTabPermission(hasPermission, "staff_attendance", "edit")

  const [date, setDate] = useState(getTodayIST())
  const [rows, setRows] = useState<StaffAttendanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState("")
  const [checkInDialogRow, setCheckInDialogRow] = useState<StaffAttendanceRow | null>(null)
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false)
  const [checkOutDialogRow, setCheckOutDialogRow] = useState<StaffAttendanceRow | null>(null)
  const [checkOutDialogOpen, setCheckOutDialogOpen] = useState(false)
  const [pendingMarkAction, setPendingMarkAction] = useState<"check-in" | "check-out" | null>(null)
  const [undoTarget, setUndoTarget] = useState<{
    row: StaffAttendanceRow
    action: "check-in" | "check-out"
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await StaffAttendanceAPI.list({ date })
      if (res?.success) setRows(res.data || [])
      else setRows([])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [date])

  const refreshRowsSilently = useCallback(async () => {
    try {
      const res = await StaffAttendanceAPI.list({ date })
      if (res?.success) setRows(res.data || [])
    } catch {
      /* keep current rows */
    }
  }, [date])

  const loadStaff = useCallback(async () => {
    if (!canMarkForOthers) return
    try {
      const res = await StaffDirectoryAPI.getAll()
      const list = (res.data || [])
        .filter((s: { isOwner?: boolean }) => !s.isOwner)
        .map((s: { _id: string; name: string; avatar?: string }) => ({
          id: s._id,
          name: s.name,
          avatar: s.avatar || "",
        }))
      setStaffOptions(list)
      if (!selectedStaffId && list.length) setSelectedStaffId(list[0].id)
    } catch {
      setStaffOptions([])
    }
  }, [canMarkForOthers, selectedStaffId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadStaff()
  }, [loadStaff])

  const myRow = useMemo(() => {
    if (!isStaffUser || !user?._id) return null
    return rows.find((r) => r.staffId === user._id) || null
  }, [rows, isStaffUser, user?._id])

  const selectedRow = useMemo(() => {
    if (!selectedStaffId) return null
    return rows.find((r) => r.staffId === selectedStaffId) || null
  }, [rows, selectedStaffId])

  const targetStaffId = isStaffUser ? user?._id : selectedStaffId
  const targetRow = isStaffUser ? myRow : selectedRow
  const selectedStaff = staffOptions.find((s) => s.id === selectedStaffId)
  const selectedStaffName = selectedStaff?.name || targetRow?.staffName || "this staff member"
  const undoStaff = undoTarget
    ? staffOptions.find((s) => s.id === undoTarget.row.staffId)
    : null

  const handleCheckIn = async () => {
    setActing(true)
    try {
      const res = await StaffAttendanceAPI.checkIn({
        staffId: isStaffUser ? undefined : selectedStaffId,
        date,
      })
      if (!res?.success || !res.data) throw new Error(res?.error || "Check-in failed")
      setCheckInDialogRow(res.data)
      setCheckInDialogOpen(true)
      void refreshRowsSilently()
    } catch (err) {
      toast({
        title: "Check-in failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setActing(false)
    }
  }

  const handleCheckOut = async () => {
    setActing(true)
    try {
      const res = await StaffAttendanceAPI.checkOut({
        staffId: isStaffUser ? undefined : selectedStaffId,
        date,
      })
      if (!res?.success || !res.data) throw new Error(res?.error || "Check-out failed")
      setCheckOutDialogRow(res.data)
      setCheckOutDialogOpen(true)
      void refreshRowsSilently()
    } catch (err) {
      toast({
        title: "Check-out failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setActing(false)
    }
  }

  const handleUndo = async () => {
    if (!undoTarget) return
    setActing(true)
    try {
      if (undoTarget.action === "check-in") {
        const res = await StaffAttendanceAPI.remove(undoTarget.row.id)
        if (!res?.success) throw new Error(res?.error || "Failed to undo check-in")
        toast({
          title: "Check-in removed",
          description: `${undoTarget.row.staffName}'s attendance for today was cleared.`,
        })
      } else {
        const res = await StaffAttendanceAPI.undoCheckOut(undoTarget.row.id)
        if (!res?.success) throw new Error(res?.error || "Failed to undo check-out")
        toast({
          title: "Check-out undone",
          description: `${undoTarget.row.staffName} is back on duty.`,
        })
      }
      setUndoTarget(null)
      await load()
    } catch (err) {
      toast({
        title: "Correction failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setActing(false)
    }
  }

  const requestMarkAction = (action: "check-in" | "check-out") => {
    if (canMarkForOthers && !isStaffUser) {
      setPendingMarkAction(action)
      return
    }
    if (action === "check-in") void handleCheckIn()
    else void handleCheckOut()
  }

  const confirmMarkAction = () => {
    const action = pendingMarkAction
    setPendingMarkAction(null)
    if (!action) return
    // Wait for confirm AlertDialog to fully unmount before opening the result dialog
    window.setTimeout(() => {
      if (action === "check-in") void handleCheckIn()
      else if (action === "check-out") void handleCheckOut()
    }, DIALOG_UNMOUNT_DELAY_MS)
  }

  const releaseBodyScrollLock = () => {
    document.body.style.pointerEvents = ""
    document.body.style.overflow = ""
    document.documentElement.style.overflow = ""
    document.body.removeAttribute("data-scroll-locked")
  }

  const closeCheckInDialog = (open: boolean) => {
    setCheckInDialogOpen(open)
    if (!open) {
      window.setTimeout(() => {
        setCheckInDialogRow(null)
        releaseBodyScrollLock()
      }, DIALOG_UNMOUNT_DELAY_MS)
    }
  }

  const closeCheckOutDialog = (open: boolean) => {
    setCheckOutDialogOpen(open)
    if (!open) {
      window.setTimeout(() => {
        setCheckOutDialogRow(null)
        releaseBodyScrollLock()
      }, DIALOG_UNMOUNT_DELAY_MS)
    }
  }

  const isToday = date === getTodayIST()
  const canCheckIn = isToday && !targetRow
  const canCheckOut = isToday && targetRow?.status === "checked_in"

  return (
    <div className="space-y-6">
      <CheckInResultDialog
        row={checkInDialogRow}
        open={checkInDialogOpen}
        onOpenChange={closeCheckInDialog}
      />
      <CheckOutResultDialog
        row={checkOutDialogRow}
        open={checkOutDialogOpen}
        onOpenChange={closeCheckOutDialog}
      />
      <AlertDialog
        open={!!pendingMarkAction}
        onOpenChange={(open) => {
          if (!open) setPendingMarkAction(null)
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm {pendingMarkAction === "check-out" ? "check-out" : "check-in"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div className="flex flex-col items-center gap-3 pt-1">
                  <StaffConfirmAvatar
                    name={selectedStaffName}
                    avatar={selectedStaff?.avatar}
                  />
                  <p className="text-lg font-semibold text-slate-900">{selectedStaffName}</p>
                </div>
                <p className="text-center">
                  Mark as{" "}
                  <span className="font-medium text-slate-800">
                    {pendingMarkAction === "check-out" ? "checked out" : "checked in"}
                  </span>{" "}
                  for today?
                </p>
                <p className="text-center">Please confirm this is the correct staff member.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={acting}
              onClick={(e) => {
                e.preventDefault()
                confirmMarkAction()
              }}
            >
              {acting ? "Please wait…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!undoTarget}
        onOpenChange={(open) => {
          if (!open) setUndoTarget(null)
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {undoTarget?.action === "check-out" ? "Undo check-out" : "Undo check-in"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-sm text-muted-foreground">
                {undoTarget ? (
                  <div className="flex flex-col items-center gap-3 pt-1">
                    <StaffConfirmAvatar
                      name={undoTarget.row.staffName}
                      avatar={undoStaff?.avatar}
                    />
                    <p className="text-lg font-semibold text-slate-900">{undoTarget.row.staffName}</p>
                  </div>
                ) : null}
                {undoTarget?.action === "check-out" ? (
                  <p className="text-center">
                    Remove check-out? They will show as on duty again.
                  </p>
                ) : (
                  <p className="text-center">
                    Remove today&apos;s check-in? This clears their attendance record for today.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleUndo()}
              disabled={acting}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {acting ? "Please wait…" : "Undo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Label htmlFor="attendance-date">Date</Label>
          <Input
            id="attendance-date"
            type="date"
            value={date}
            max={getTodayIST()}
            onChange={(e) => setDate(e.target.value || getTodayIST())}
            className="w-[200px]"
          />
        </div>
      </div>

      {/* Check in / out card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-indigo-600" />
            Mark attendance
          </CardTitle>
          <CardDescription>
            {isStaffUser
              ? "Check in when you arrive and check out when you leave."
              : "Select a staff member and mark their check-in or check-out."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canMarkForOthers && !isStaffUser ? (
            <div className="max-w-xs space-y-2">
              <Label>Staff</Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {targetRow ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Check in: </span>
                <span className="font-medium">{formatTime(targetRow.checkInAt)}</span>
              </div>
              {targetRow.checkOutAt ? (
                <div className="text-sm">
                  <span className="text-muted-foreground">Check out: </span>
                  <span className="font-medium">{formatTime(targetRow.checkOutAt)}</span>
                </div>
              ) : null}
              <Badge variant={targetRow.status === "completed" ? "secondary" : "default"}>
                {targetRow.status === "completed" ? "Completed" : "On duty"}
              </Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No attendance recorded for this date.</p>
          )}

          {!isToday ? (
            <p className="text-sm text-amber-700">Check-in and check-out are only available for today.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => requestMarkAction("check-in")}
                disabled={acting || !canCheckIn || !targetStaffId}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogIn className="h-4 w-4 mr-2" />}
                Check in
              </Button>
              <Button
                variant="outline"
                onClick={() => requestMarkAction("check-out")}
                disabled={acting || !canCheckOut || !targetStaffId}
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
                Check out
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All staff table for the day */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Attendance log</CardTitle>
          <CardDescription>All staff check-ins for {date}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No attendance records yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Check in</TableHead>
                  <TableHead>Check out</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Day status</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Marked by</TableHead>
                  {canCorrectAttendance && isToday ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.staffName}</TableCell>
                    <TableCell>{formatTime(row.checkInAt)}</TableCell>
                    <TableCell>{formatTime(row.checkOutAt)}</TableCell>
                    <TableCell>{durationLabel(row.checkInAt, row.checkOutAt)}</TableCell>
                    <TableCell>
                      <DayStatusBadge row={row} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "completed" ? "secondary" : "default"}>
                        {row.status === "completed" ? "Completed" : "On duty"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px] text-xs text-muted-foreground">
                      {markedByLabel(row)}
                    </TableCell>
                    {canCorrectAttendance && isToday ? (
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {row.status === "completed" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-slate-600"
                              disabled={acting}
                              onClick={() =>
                                setUndoTarget({ row, action: "check-out" })
                              }
                            >
                              <Undo2 className="mr-1 h-3.5 w-3.5" />
                              Undo out
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              disabled={acting}
                              onClick={() => setUndoTarget({ row, action: "check-in" })}
                            >
                              <Undo2 className="mr-1 h-3.5 w-3.5" />
                              Undo in
                            </Button>
                          )}
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
    </div>
  )
}
