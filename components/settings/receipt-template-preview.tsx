"use client"

import { useEffect, useMemo, useState } from "react"
import { ReceiptTemplateView } from "@/components/receipts/receipt-template-view"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SettingsAPI } from "@/lib/api"
import {
  buildReceiptTemplatePreviewSample,
  mergePreviewBusinessSettings,
} from "@/lib/receipt-template-preview-sample"
import { isThermalPaperSize, type ReceiptPaperSize } from "@/lib/receipt-paper-size"
import { cn } from "@/lib/utils"

interface ReceiptTemplatePreviewContentProps {
  paperSize: ReceiptPaperSize
}

function ReceiptTemplatePreviewContent({ paperSize }: ReceiptTemplatePreviewContentProps) {
  const [businessSettings, setBusinessSettings] = useState<Record<string, unknown> | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadBusinessSettings() {
      setIsLoading(true)
      try {
        const response = await SettingsAPI.getBusinessSettings()
        if (!cancelled && response?.success) {
          setBusinessSettings(response.data || null)
        }
      } catch {
        if (!cancelled) setBusinessSettings(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void loadBusinessSettings()
    return () => {
      cancelled = true
    }
  }, [])

  const previewReceipt = useMemo(() => buildReceiptTemplatePreviewSample(), [])
  const previewBusinessSettings = useMemo(
    () => mergePreviewBusinessSettings(businessSettings, paperSize),
    [businessSettings, paperSize]
  )

  const isThermal = isThermalPaperSize(paperSize)

  if (isLoading) {
    return (
      <div className="flex min-h-[240px] w-full items-center justify-center text-sm text-slate-500">
        Loading preview...
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain",
        isThermal ? "h-[min(70vh,520px)]" : "max-h-[min(80vh,640px)]"
      )}
    >
      <div className={cn("p-4", isThermal && "flex justify-center")}>
        <ReceiptTemplateView receipt={previewReceipt} businessSettings={previewBusinessSettings} />
      </div>
    </div>
  )
}

interface ReceiptTemplatePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paperSize: ReceiptPaperSize
}

export function ReceiptTemplatePreviewDialog({
  open,
  onOpenChange,
  paperSize,
}: ReceiptTemplatePreviewDialogProps) {
  const isThermal = isThermalPaperSize(paperSize)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-hidden flex flex-col",
          isThermal ? "max-w-lg" : "max-w-3xl"
        )}
      >
        <DialogHeader>
          <DialogTitle>Receipt template preview</DialogTitle>
          <DialogDescription>
            Sample receipt using your business details and the {paperSize} template.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          {open ? <ReceiptTemplatePreviewContent paperSize={paperSize} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
