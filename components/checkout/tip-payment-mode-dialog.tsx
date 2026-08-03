"use client"

import { Banknote, CreditCard, Smartphone } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TipPaymentBucket } from "@/lib/tip-payment-allocation"
import {
  getCheckoutPaymentAmountByMode,
  getTipEligiblePaymentModes,
  TIP_PAYMENT_MODE_LABELS,
} from "@/lib/tip-payment-mode-prompt"

const MODE_STYLES: Record<
  TipPaymentBucket,
  { active: string; idle: string; icon: typeof Banknote }
> = {
  cash: {
    active: "border-green-400 bg-green-100 ring-2 ring-green-300",
    idle: "border-green-200 bg-green-50/60 hover:bg-green-50",
    icon: Banknote,
  },
  card: {
    active: "border-blue-400 bg-blue-100 ring-2 ring-blue-300",
    idle: "border-blue-200 bg-blue-50/60 hover:bg-blue-50",
    icon: CreditCard,
  },
  online: {
    active: "border-purple-400 bg-purple-100 ring-2 ring-purple-300",
    idle: "border-purple-200 bg-purple-50/60 hover:bg-purple-50",
    icon: Smartphone,
  },
}

type TipPaymentModeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tipAmount: number
  cash: number
  card: number
  online: number
  selection: TipPaymentBucket | null
  onSelectionChange: (mode: TipPaymentBucket) => void
  onConfirm: () => void
  confirmDisabled?: boolean
  confirmLabel?: string
  contentClassName?: string
  overlayClassName?: string
}

export function TipPaymentModeDialog({
  open,
  onOpenChange,
  tipAmount,
  cash,
  card,
  online,
  selection,
  onSelectionChange,
  onConfirm,
  confirmDisabled = false,
  confirmLabel = "Complete billing",
  contentClassName,
  overlayClassName,
}: TipPaymentModeDialogProps) {
  const eligibleModes = getTipEligiblePaymentModes(tipAmount, cash, card, online)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-sm", contentClassName)} overlayClassName={overlayClassName}>
        <DialogHeader>
          <DialogTitle>Tip payment mode</DialogTitle>
          <DialogDescription className="text-left text-sm text-slate-600">
            Tip of{" "}
            <span className="font-medium text-slate-900">₹{tipAmount.toFixed(2)}</span> — choose
            which payment mode it was collected on.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-1">
          {eligibleModes.map((mode) => {
            const styles = MODE_STYLES[mode]
            const Icon = styles.icon
            const selected = selection === mode
            const amount = getCheckoutPaymentAmountByMode(mode, cash, card, online)
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSelectionChange(mode)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
                  selected ? styles.active : styles.idle
                )}
              >
                <Icon className="h-5 w-5 shrink-0 text-slate-700" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{TIP_PAYMENT_MODE_LABELS[mode]}</p>
                  <p className="text-xs tabular-nums text-slate-600">
                    ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                    collected
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button type="button" onClick={onConfirm} disabled={confirmDisabled || !selection}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
