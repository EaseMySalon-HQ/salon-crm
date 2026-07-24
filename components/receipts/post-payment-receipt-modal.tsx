"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ReceiptPreview } from "@/components/receipts/receipt-preview"
import { RecordConsumptionDialog } from "@/components/bills/record-consumption-dialog"
import { SettingsAPI } from "@/lib/api"
import type { Receipt } from "@/lib/data"
import { getReceiptGrandTotal } from "@/lib/receipt-grand-total"
import { canShowRecordConsumptionCta } from "@/lib/record-consumption-cta"
import { useCurrency } from "@/hooks/use-currency"
import { CheckCircle2, FileText, Package } from "lucide-react"

export interface PostPaymentReceiptModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  receipt: any | null
  returnPath: string
  /** Mongo sale id when receipt.id is not the server id */
  saleId?: string
  /** Countdown before auto-close and redirect; default 10 */
  autoCloseSeconds?: number
}

export function PostPaymentReceiptModal({
  open,
  onOpenChange,
  receipt,
  returnPath,
  saleId,
  autoCloseSeconds = 10,
}: PostPaymentReceiptModalProps) {
  const router = useRouter()
  const { formatAmount } = useCurrency()
  const [secondsLeft, setSecondsLeft] = useState(autoCloseSeconds)
  const [showInvoice, setShowInvoice] = useState(false)
  const [consumptionOpen, setConsumptionOpen] = useState(false)
  const [businessSettings, setBusinessSettings] = useState<any>(null)
  const navigatedRef = useRef(false)
  /** Previous seconds value for this open session — avoids auto-redirect on reopen while state is still 0 before reset applies. */
  const prevSecondsLeftRef = useRef<number | null>(null)

  const effectiveSaleId = saleId || receipt?.id

  const showConsumptionCta = canShowRecordConsumptionCta({
    saleId: effectiveSaleId,
    status: receipt?.status,
  })

  const closeAndNavigate = useCallback(() => {
    if (navigatedRef.current) return
    navigatedRef.current = true
    onOpenChange(false)
    router.push(returnPath)
  }, [onOpenChange, router, returnPath])

  useEffect(() => {
    if (open) navigatedRef.current = false
  }, [open])

  useEffect(() => {
    if (!open) {
      prevSecondsLeftRef.current = null
      return
    }
    setSecondsLeft(autoCloseSeconds)
    setShowInvoice(false)
    setConsumptionOpen(false)
    prevSecondsLeftRef.current = null
    let cancelled = false
    ;(async () => {
      try {
        const res = await SettingsAPI.getBusinessSettings()
        if (!cancelled && res.success) setBusinessSettings(res.data)
      } catch {
        if (!cancelled) setBusinessSettings(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, receipt?.receiptNumber, autoCloseSeconds])

  const timerPaused = showInvoice || consumptionOpen

  // Countdown runs only while the summary view is shown — not during invoice preview or consumption dialog.
  useEffect(() => {
    if (!open || timerPaused) return undefined
    const id = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [open, timerPaused, receipt?.receiptNumber, autoCloseSeconds])

  useEffect(() => {
    if (!open || timerPaused) {
      prevSecondsLeftRef.current = null
      return
    }
    const prev = prevSecondsLeftRef.current
    prevSecondsLeftRef.current = secondsLeft
    // Only redirect when countdown actually reaches 0 (was > 0), never on stale 0 from a previous session.
    if (secondsLeft === 0 && prev !== null && prev > 0) {
      closeAndNavigate()
    }
  }, [open, timerPaused, secondsLeft, closeAndNavigate])

  const handleDialogOpenChange = (next: boolean) => {
    if (!next) {
      closeAndNavigate()
      return
    }
    onOpenChange(next)
  }

  if (!receipt) return null

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-2 px-6 pt-6 pb-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <DialogTitle className="text-lg">Payment collected</DialogTitle>
            </div>
            <DialogDescription className="text-left text-sm text-muted-foreground">
              Invoice <span className="font-mono font-medium text-foreground">#{receipt.receiptNumber}</span> has been
              saved.
              {showInvoice ? (
                <>
                  {" "}
                  Review the invoice below. The auto-return timer is paused until you hide the preview or tap Close.
                </>
              ) : consumptionOpen ? (
                <> The auto-return timer is paused while you record consumption.</>
              ) : (
                <>
                  {" "}
                  You will return to {returnPath === "/appointments" ? "appointments" : "billing"} in{" "}
                  <span className="font-semibold tabular-nums text-foreground">{secondsLeft}</span>s.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {showInvoice ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-6 pb-2">
              <div className="shrink-0 rounded-lg border-2 border-slate-900 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800">Total bill</span>
                <span className="text-xl font-bold tabular-nums text-slate-900">
                  {formatAmount(getReceiptGrandTotal(receipt as Receipt))}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border border-slate-200 bg-muted/30 p-2 [-webkit-overflow-scrolling:touch]">
                <ReceiptPreview receipt={receipt as Receipt} businessSettings={businessSettings} />
              </div>
            </div>
          ) : null}

          <DialogFooter className="!flex-row flex w-full shrink-0 flex-wrap gap-2 border-t bg-muted/20 px-6 py-4">
            {!showInvoice ? (
              <>
                <Button
                  type="button"
                  variant="default"
                  className="min-h-10 flex-1 gap-2 sm:min-w-0"
                  onClick={() => setShowInvoice(true)}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  View invoice
                </Button>
                {showConsumptionCta && effectiveSaleId ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10 flex-1 gap-2 border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 sm:min-w-0"
                    onClick={() => setConsumptionOpen(true)}
                  >
                    <Package className="h-4 w-4 shrink-0" />
                    Record consumption
                  </Button>
                ) : null}
                <Button type="button" variant="outline" className="min-h-10 flex-1 sm:min-w-0" onClick={() => closeAndNavigate()}>
                  Close
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-10 flex-1 sm:min-w-0"
                  onClick={() => setShowInvoice(false)}
                >
                  Hide invoice
                </Button>
                {showConsumptionCta && effectiveSaleId ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10 flex-1 gap-2 border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 sm:min-w-0"
                    onClick={() => setConsumptionOpen(true)}
                  >
                    <Package className="h-4 w-4 shrink-0" />
                    Record consumption
                  </Button>
                ) : null}
                <Button type="button" variant="outline" className="min-h-10 flex-1 sm:min-w-0" onClick={() => closeAndNavigate()}>
                  Close
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {effectiveSaleId ? (
        <RecordConsumptionDialog
          mode="bill"
          saleId={String(effectiveSaleId)}
          billNo={receipt.receiptNumber}
          open={consumptionOpen}
          onOpenChange={setConsumptionOpen}
        />
      ) : null}
    </>
  )
}
