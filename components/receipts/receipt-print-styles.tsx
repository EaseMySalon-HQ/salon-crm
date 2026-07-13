"use client"

import { getReceiptPrintCss, resolveReceiptPaperSize, type ReceiptPaperSize } from "@/lib/receipt-paper-size"

interface ReceiptPrintStylesProps {
  businessSettings?: { receiptPaperSize?: string | null } | null
  paperSize?: ReceiptPaperSize
}

export function ReceiptPrintStyles({ businessSettings, paperSize }: ReceiptPrintStylesProps) {
  const resolved = paperSize ?? resolveReceiptPaperSize(businessSettings)
  return <style dangerouslySetInnerHTML={{ __html: getReceiptPrintCss(resolved) }} />
}
