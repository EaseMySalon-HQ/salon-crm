"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import type { LucideIcon } from "lucide-react"
import { ChevronDown, ChevronRight, Pencil, UtensilsCrossed, Coffee, User, Users, PenLine } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BlockTimeAPI } from "@/lib/api"

type ReasonChip = "Lunch" | "Break" | "Personal" | "Meeting" | "Custom"
const REASON_CHIPS: { value: ReasonChip; icon: LucideIcon }[] = [
  { value: "Lunch", icon: UtensilsCrossed },
  { value: "Break", icon: Coffee },
  { value: "Personal", icon: User },
  { value: "Meeting", icon: Users },
  { value: "Custom", icon: PenLine },
]

/** Returns the icon for a block title (Lunch, Break, Personal, Meeting, or Custom for anything else). */
export function getBlockReasonIcon(title: string): LucideIcon {
  const match = REASON_CHIPS.find((r) => r.value === title)
  return match ? match.icon : PenLine
}

function parseTimeToMinutes(time: string): number {
  if (!time) return 0
  const cleaned = time.replace(/\s*(am|pm)/i, "").trim()
  const parts = cleaned.split(":")
  const h = parseInt(parts[0] || "0", 10)
  const m = parseInt(parts[1] || "0", 10)
  const isPm = /pm/i.test(time) && h < 12
  const hour = isPm ? h + 12 : /am/i.test(time) && h === 12 ? 0 : h
  return hour * 60 + m
}

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export interface BlockTimeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate: string
  initialTime: string
  initialStaffId: string | null
  initialStaffName?: string
  staffOptions: Array<{ _id: string; name: string }>
  onSuccess?: () => void
}

export function BlockTimeModal({
  open,
  onOpenChange,
  initialDate,
  initialTime,
  initialStaffId,
  initialStaffName,
  staffOptions,
  onSuccess,
}: BlockTimeModalProps) {
  const [staffId, setStaffId] = useState<string>(initialStaffId ?? "")
  const [date, setDate] = useState(initialDate)
  const [startTime, setStartTime] = useState(initialTime)
  const [endTime, setEndTime] = useState("")
  const [reason, setReason] = useState<ReasonChip>("Lunch")
  const [customReason, setCustomReason] = useState("")
  const [repeat, setRepeat] = useState("none")
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [endDate, setEndDate] = useState("")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [showStaffPicker, setShowStaffPicker] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)

  useEffect(() => {
    if (open) {
      setDate(initialDate)
      setStaffId(initialStaffId ?? (staffOptions[0]?._id ?? ""))
      const startM = parseTimeToMinutes(initialTime)
      const endM = startM + 60
      setStartTime(minutesToHHMM(startM))
      setEndTime(minutesToHHMM(endM))
      setReason("Lunch")
      setCustomReason("")
      setRepeat("none")
      setRepeatOpen(false)
      setAdvancedOpen(false)
      setEndDate("")
      setDescription("")
    }
  }, [open, initialDate, initialTime, initialStaffId, staffOptions])

  const staffName =
    staffOptions.find((s) => s._id === staffId)?.name ?? initialStaffName ?? "Select staff"
  const formattedDate = date ? format(new Date(date + "T00:00:00"), "EEE, MMM d") : ""
  const title =
    reason === "Custom" ? customReason.trim() : reason
  const canSubmit =
    staffId &&
    title &&
    startTime &&
    endTime &&
    (reason !== "Custom" || customReason.trim()) &&
    (!["daily", "weekly", "monthly"].includes(repeat) || endDate)

  const handleBlockTime = async () => {
    if (!canSubmit) return
    setCreating(true)
    try {
      const res = await BlockTimeAPI.create({
        staffId,
        title,
        startDate: date,
        startTime,
        endTime,
        recurringFrequency: repeat,
        endDate: ["daily", "weekly", "monthly"].includes(repeat) ? endDate || null : null,
        description: description.slice(0, 200) || undefined,
      })
      if (res?.success) {
        onOpenChange(false)
        onSuccess?.()
      } else {
        alert("Failed to block time. Please try again.")
      }
    } catch (e) {
      console.error(e)
      alert("Failed to block time. Please try again.")
    } finally {
      setCreating(false)
    }
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 border-0 shadow-xl rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg font-semibold">Block Time</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          {/* Context bar: Staff · Date (clickable) */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setShowStaffPicker(!showStaffPicker)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700 truncate"
              >
                <span className="truncate">{staffName}</span>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>
              <span className="text-slate-400">·</span>
              <button
                type="button"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
              >
                <span>{formattedDate}</span>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>
            </div>
          </div>

          {showStaffPicker && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Staff</Label>
              <Select value={staffId} onValueChange={(v) => { setStaffId(v); setShowStaffPicker(false) }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staffOptions.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showDatePicker && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); setShowDatePicker(false) }}
                className="h-9"
              />
            </div>
          )}

          {/* Time range */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Time</Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-10 font-semibold tabular-nums"
              />
              <span className="text-slate-400 font-medium">→</span>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-10 font-semibold tabular-nums"
              />
            </div>
          </div>

          {/* Reason chips */}
          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Reason</Label>
            <div className="flex flex-wrap gap-2">
              {REASON_CHIPS.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReason(value)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    reason === value
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {value}
                </button>
              ))}
            </div>
            {reason === "Custom" && (
              <Input
                placeholder="e.g. Doctor appointment"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="h-9 mt-1"
              />
            )}
          </div>

          {/* Repeat (collapsed) */}
          <Collapsible open={repeatOpen} onOpenChange={setRepeatOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 w-full py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                {repeatOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <span>Repeat: {repeat === "none" ? "Doesn't Repeat" : repeat.charAt(0).toUpperCase() + repeat.slice(1)}</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 pl-6 pt-1">
                <Select value={repeat} onValueChange={setRepeat}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Doesn&apos;t Repeat</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                {["daily", "weekly", "monthly"].includes(repeat) && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">End date</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={date}
                      className="h-9"
                    />
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Advanced (collapsed) */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 w-full py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                {advancedOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <span>Advanced</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pl-6 pt-1 space-y-1.5">
                <Label className="text-xs text-slate-500">Description (optional)</Label>
                <textarea
                  placeholder="Add notes (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-100 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleBlockTime} disabled={!canSubmit || creating}>
            {creating ? "Blocking…" : "Block Time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
