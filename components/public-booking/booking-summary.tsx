"use client"

import { CalendarDays, Check, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  formatDurationMinutes,
  formatLongDate,
  formatSlotTimeDisplay,
  type CartLineItem,
} from "@/lib/public-booking-api"

export type BookingSuccessSummary = {
  businessName: string
  customerName: string
  date: string
  time: string
  totalDuration: number
  totalAmount: number
}

type BookingSuccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: BookingSuccessSummary | null
}

export function BookingSuccessDialog({
  open,
  onOpenChange,
  summary,
}: BookingSuccessDialogProps) {
  const firstName = summary?.customerName?.trim().split(/\s+/)[0] || "there"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-slate-900/65 backdrop-blur-md"
        className={cn(
          "max-w-[440px] gap-0 overflow-hidden border-0 p-0 shadow-2xl",
          "sm:rounded-2xl"
        )}
      >
        <DialogTitle className="sr-only">Booking confirmed</DialogTitle>
        <DialogDescription className="sr-only">
          Your appointment was booked successfully.
        </DialogDescription>

        <div className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] px-6 pt-8 pb-10 text-center text-white">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 rounded-full p-2 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </div>
          <h2 className="text-xl font-bold tracking-tight">You&apos;re booked!</h2>
          <p className="mt-2 text-sm text-white/90">
            Thanks {firstName}. {summary?.businessName} is expecting you.
          </p>
        </div>

        {summary && (
          <div className="space-y-4 px-6 py-6">
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm">
              <p className="font-semibold text-slate-900">{summary.businessName}</p>
              <p className="mt-2 text-slate-600">{formatLongDate(summary.date)}</p>
              <p className="text-slate-600">{formatSlotTimeDisplay(summary.time)}</p>
              <p className="mt-2 text-xs text-slate-500">
                {formatDurationMinutes(summary.totalDuration)} · ₹
                {summary.totalAmount.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-purple-100 bg-purple-50/50 p-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#7C3AED]" />
              <p className="text-xs leading-relaxed text-slate-600">
                You&apos;ll receive a confirmation message if the salon has notifications enabled.
              </p>
            </div>
            <Button
              type="button"
              className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function BookingSummaryContent({
  businessName,
  cart,
  preferredStaffName,
  selectedDate,
  selectedTime,
  totalDuration,
  totalAmount,
  compact = false,
}: {
  businessName: string
  cart: CartLineItem[]
  preferredStaffName?: string | null
  selectedDate?: string
  selectedTime?: string
  totalDuration: number
  totalAmount: number
  compact?: boolean
}) {
  const staffLabel = preferredStaffName?.trim() || "No Preference"
  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Salon</p>
        <p className={cn("font-semibold text-slate-900", compact ? "text-sm" : "text-base")}>
          {businessName}
        </p>
      </div>

      {cart.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Services</p>
          {cart.map((item) => (
            <div key={item.cartId} className="flex justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {staffLabel} · {formatDurationMinutes(item.duration)}
                </p>
              </div>
              <span className="shrink-0 font-medium text-slate-700">
                ₹{item.price.toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>
      )}

      {selectedDate && selectedTime && (
        <div className="flex items-center gap-2 rounded-lg bg-purple-50/60 px-3 py-2 text-sm text-slate-700">
          <CalendarDays className="h-4 w-4 text-[#7C3AED]" />
          <span>
            {formatLongDate(selectedDate)} at {formatSlotTimeDisplay(selectedTime)}
          </span>
        </div>
      )}

      <div className="border-t border-slate-100 pt-3">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Duration</span>
          <span>{formatDurationMinutes(totalDuration)}</span>
        </div>
        <div className="mt-1 flex justify-between font-semibold text-slate-900">
          <span>Total</span>
          <span>₹{totalAmount.toLocaleString("en-IN")}</span>
        </div>
      </div>
    </div>
  )
}
