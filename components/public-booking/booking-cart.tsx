"use client"

import { useMemo } from "react"
import { Minus, Plus, ShoppingBag, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BOOKING_COLUMN_HEADER_CLASS } from "@/lib/booking-hero-layout"
import type { CartLineItem } from "@/lib/public-booking-api"
import { formatBookingPrice, formatDurationMinutes } from "@/lib/public-booking-api"

type BookingCartProps = {
  businessName: string
  cart: CartLineItem[]
  staffPreferenceLabel?: string
  staffPreferenceSelected?: boolean
  totalDuration: number
  totalAmount: number
  selectedDate?: string
  selectedTime?: string
  onRemove: (cartId: string) => void
  onAddSame?: (serviceId: string) => void
  onRemoveOne?: (serviceId: string) => void
  getQuantity?: (serviceId: string) => number
  onAddMoreServices?: () => void
  onContinue?: () => void
  continueDisabled?: boolean
  continueLabel?: string
  className?: string
  compact?: boolean
  fullHeight?: boolean
}

type GroupedCartLine = {
  serviceId: string
  item: CartLineItem
  qty: number
}

function groupCartLines(cart: CartLineItem[], getQuantity?: (id: string) => number): GroupedCartLine[] {
  const order: string[] = []
  const byId = new Map<string, CartLineItem>()

  for (const line of cart) {
    if (!byId.has(line.id)) {
      byId.set(line.id, line)
      order.push(line.id)
    }
  }

  return order.map((serviceId) => ({
    serviceId,
    item: byId.get(serviceId)!,
    qty: getQuantity?.(serviceId) ?? cart.filter((c) => c.id === serviceId).length,
  }))
}

export function BookingCartPanel({
  businessName,
  cart,
  staffPreferenceLabel,
  staffPreferenceSelected = false,
  totalDuration,
  totalAmount,
  selectedDate,
  selectedTime,
  onAddSame,
  onRemoveOne,
  getQuantity,
  onAddMoreServices,
  onContinue,
  continueDisabled,
  continueLabel = "Select staff & time",
  className,
  compact = false,
  fullHeight = false,
}: BookingCartProps) {
  const serviceCount = cart.length
  const groupedLines = useMemo(() => groupCartLines(cart, getQuantity), [cart, getQuantity])
  const canAdjustQty = !!(onAddSame && onRemoveOne)

  const panelClass = cn(
    "flex w-full flex-col bg-white",
    !fullHeight && !compact && "rounded-2xl border border-slate-200/80 shadow-sm",
    fullHeight && "max-h-[calc(100vh)] min-h-0 flex-col",
    compact && "border-0 shadow-none",
    className
  )

  if (cart.length === 0) {
    return (
      <div className={cn(panelClass, compact ? "p-5" : fullHeight ? "" : "p-6")}>
        <CartHeader count={0} compact={compact} fullHeight={fullHeight} />
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50">
            <ShoppingBag className="h-7 w-7 text-[#7C3AED]/60" />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-700">Your cart is empty</p>
          <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-slate-400">
            Browse categories and add services to build your appointment.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={panelClass}>
      <CartHeader count={serviceCount} compact={compact} fullHeight={fullHeight} />

      <div
        className={cn(
          "min-h-0",
          compact
            ? "max-h-[50vh] overflow-y-auto px-4 py-3"
            : fullHeight
              ? "flex-1 overflow-y-auto px-5 py-3 lg:px-6"
              : "max-h-[340px] overflow-y-auto px-4 py-3"
        )}
      >
        <div className="divide-y divide-slate-100">
          {groupedLines.map(({ serviceId, item, qty }) => (
            <div key={serviceId} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-slate-900">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDurationMinutes(item.duration * qty)}
                    {staffPreferenceLabel ? (
                      <>
                        {" · "}
                        <span
                          className={cn(
                            staffPreferenceSelected && "font-medium text-[#7C3AED]"
                          )}
                        >
                          {staffPreferenceLabel}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canAdjustQty && (
                    <div className="flex items-center rounded-full border border-[#7C3AED]/40 bg-white px-0.5">
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[#7C3AED] transition-colors hover:bg-purple-50"
                        onClick={() => onRemoveOne(serviceId)}
                        aria-label={`Remove one ${item.name}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[1.25rem] text-center text-sm font-semibold tabular-nums text-slate-900">
                        {qty}
                      </span>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[#7C3AED] transition-colors hover:bg-purple-50"
                        onClick={() => onAddSame(serviceId)}
                        aria-label={`Add another ${item.name}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <span className="min-w-[3.5rem] text-right text-sm font-medium tabular-nums text-slate-900">
                    {formatBookingPrice(item.price)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {onAddMoreServices && (
          <div className="mt-2 flex justify-end border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onAddMoreServices}
              className="text-sm font-medium text-[#7C3AED] hover:text-[#6D28D9] hover:underline"
            >
              Add more services
            </button>
          </div>
        )}

        <CartSummaryFooter
          businessName={businessName}
          totalDuration={totalDuration}
          totalAmount={totalAmount}
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          onContinue={onContinue}
          continueDisabled={continueDisabled}
          continueLabel={continueLabel}
          compact={compact}
          fullHeight={fullHeight}
        />
      </div>
    </div>
  )
}

function CartSummaryFooter({
  businessName,
  totalDuration,
  totalAmount,
  selectedDate,
  selectedTime,
  onContinue,
  continueDisabled,
  continueLabel,
  compact,
  fullHeight,
}: {
  businessName: string
  totalDuration: number
  totalAmount: number
  selectedDate?: string
  selectedTime?: string
  onContinue?: () => void
  continueDisabled?: boolean
  continueLabel: string
  compact?: boolean
  fullHeight?: boolean
}) {
  return (
    <div
      className={cn(
        "border-t border-slate-100 pt-4",
        compact ? "pb-1" : fullHeight ? "pb-4" : "pb-0"
      )}
    >
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-slate-500">
          <span>Duration</span>
          <span className="tabular-nums">{formatDurationMinutes(totalDuration)}</span>
        </div>
        {selectedDate && selectedTime && (
          <div className="flex justify-between text-slate-500">
            <span>When</span>
            <span className="text-right text-xs">{selectedTime}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
          <span className="font-medium text-slate-700">Total</span>
          <span className="text-lg font-bold tabular-nums text-slate-900">
            {formatBookingPrice(totalAmount)}
          </span>
        </div>
      </div>

      {onContinue && (
        <Button
          type="button"
          className={cn("mt-4 w-full bg-[#7C3AED] hover:bg-[#6D28D9]", compact && "mt-3")}
          disabled={continueDisabled}
          onClick={onContinue}
        >
          {continueLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}

      {!compact && (
        <p className="mt-2 text-center text-[10px] text-slate-400">
          Booking at {businessName}
        </p>
      )}
    </div>
  )
}

function CartHeader({
  count,
  compact,
  fullHeight,
}: {
  count: number
  compact?: boolean
  fullHeight?: boolean
}) {
  return (
    <div
      className={cn(
        BOOKING_COLUMN_HEADER_CLASS,
        compact ? "px-4" : fullHeight ? "px-5 lg:px-6" : "px-4",
        !fullHeight && "relative"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <h3 className="font-semibold text-slate-900">Your cart</h3>
        {count > 0 && (
          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-[#7C3AED]">
            {count} {count === 1 ? "service" : "services"}
          </span>
        )}
      </div>
    </div>
  )
}

export function MobileCartBar({
  itemCount,
  totalAmount,
  onOpen,
  onContinue,
  continueLabel = "Continue",
  continueDisabled = false,
}: {
  itemCount: number
  totalAmount: number
  onOpen: () => void
  onContinue?: () => void
  continueLabel?: string
  continueDisabled?: boolean
}) {
  if (itemCount === 0) return null
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_24px_rgba(15,23,42,0.08)] lg:hidden">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="text-xs text-slate-500">
            {itemCount} service{itemCount !== 1 ? "s" : ""} · Tap to review
          </p>
          <p className="font-semibold tabular-nums text-slate-900">{formatBookingPrice(totalAmount)}</p>
        </button>
        {onContinue ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0 bg-[#7C3AED] hover:bg-[#6D28D9]"
            disabled={continueDisabled}
            onClick={onContinue}
          >
            {continueLabel}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
