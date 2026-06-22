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
import { BT } from "@/lib/booking-page-theme"
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

        <div
          className="relative overflow-hidden px-6 pt-8 pb-10 text-center text-white"
          style={{
            background:
              "linear-gradient(to bottom right, var(--booking-accent), color-mix(in srgb, var(--booking-accent) 65%, #1e1b4b))",
          }}
        >
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
            <div className={cn("rounded-xl border p-4 text-sm", BT.borderSubtle, BT.bgSurfaceMuted)}>
              <p className={cn("font-semibold", BT.textPrimary)}>{summary.businessName}</p>
              <p className={cn("mt-2", BT.textSecondary)}>{formatLongDate(summary.date)}</p>
              <p className={BT.textSecondary}>{formatSlotTimeDisplay(summary.time)}</p>
              <p className={cn("mt-2 text-xs", BT.textMuted)}>
                {formatDurationMinutes(summary.totalDuration)} · ₹
                {summary.totalAmount.toLocaleString("en-IN")}
              </p>
            </div>
            <div className={cn("flex items-start gap-3 rounded-xl border p-3", BT.borderAccent, BT.bgAccentSoft)}>
              <Sparkles className={cn("mt-0.5 h-4 w-4 shrink-0", BT.textAccent)} />
              <p className={cn("text-xs leading-relaxed", BT.textSecondary)}>
                You&apos;ll receive a confirmation message if the salon has notifications enabled.
              </p>
            </div>
            <Button type="button" className={cn("w-full", BT.btnPrimary)} onClick={() => onOpenChange(false)}>
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
        <p className={cn("text-xs font-medium uppercase tracking-wide", BT.textMuted)}>Salon</p>
        <p className={cn("font-semibold", BT.textPrimary, compact ? "text-sm" : "text-base")}>
          {businessName}
        </p>
      </div>

      {cart.length > 0 && (
        <div className="space-y-2">
          <p className={cn("text-xs font-medium uppercase tracking-wide", BT.textMuted)}>Services</p>
          {cart.map((item) => (
            <div key={item.cartId} className="flex justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className={cn("truncate font-medium", BT.textSecondary)}>{item.name}</p>
                <p className={cn("text-xs", BT.textMuted)}>
                  {staffLabel} · {formatDurationMinutes(item.duration)}
                </p>
              </div>
              <span className={cn("shrink-0 font-medium", BT.textSecondary)}>
                ₹{item.price.toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>
      )}

      {selectedDate && selectedTime && (
        <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", BT.bgAccentSoft, BT.textSecondary)}>
          <CalendarDays className={cn("h-4 w-4", BT.textAccent)} />
          <span>
            {formatLongDate(selectedDate)} at {formatSlotTimeDisplay(selectedTime)}
          </span>
        </div>
      )}

      <div className={cn("border-t pt-3", BT.borderSubtle)}>
        <div className={cn("flex justify-between text-sm", BT.textSecondary)}>
          <span>Duration</span>
          <span>{formatDurationMinutes(totalDuration)}</span>
        </div>
        <div className={cn("mt-1 flex justify-between font-semibold", BT.textPrimary)}>
          <span>Total</span>
          <span>₹{totalAmount.toLocaleString("en-IN")}</span>
        </div>
      </div>
    </div>
  )
}
