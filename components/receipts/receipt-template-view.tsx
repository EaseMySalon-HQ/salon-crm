"use client"

import { useEffect, useMemo, useRef } from "react"
import type { Receipt } from "@/lib/data"
import { ReceiptPreview } from "@/components/receipts/receipt-preview"
import { ThermalReceiptGenerator } from "@/components/receipts/thermal-receipt-generator"
import {
  getThermalPaperWidthMm,
  isThermalPaperSize,
  resolveReceiptPaperSize,
} from "@/lib/receipt-paper-size"

interface ReceiptTemplateViewProps {
  receipt: Receipt
  businessSettings?: any
}

function ThermalReceiptFrame({
  html,
  paperWidthMm,
  receiptNumber,
}: {
  html: string
  paperWidthMm: number
  receiptNumber: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const resizeToContent = () => {
      const doc = iframe.contentDocument
      if (!doc?.body) return
      iframe.style.height = `${Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight)}px`
    }

    const handleLoad = () => {
      resizeToContent()
      const doc = iframe.contentDocument
      if (!doc) return
      const images = Array.from(doc.images || [])
      images.forEach((img) => {
        if (!img.complete) img.addEventListener("load", resizeToContent, { once: true })
      })
    }

    iframe.addEventListener("load", handleLoad)
    handleLoad()
    return () => iframe.removeEventListener("load", handleLoad)
  }, [html])

  return (
    <div
      className="receipt-print-root mx-auto bg-white shadow-sm shrink-0"
      style={{ width: `${paperWidthMm}mm`, maxWidth: `${paperWidthMm}mm` }}
    >
      <iframe
        ref={iframeRef}
        title={`Receipt ${receiptNumber}`}
        srcDoc={html}
        className="block border-0"
        scrolling="no"
        style={{ width: `${paperWidthMm}mm`, maxWidth: `${paperWidthMm}mm`, minHeight: "200px" }}
      />
    </div>
  )
}

export function ReceiptTemplateView({ receipt, businessSettings }: ReceiptTemplateViewProps) {
  const paperSize = resolveReceiptPaperSize(businessSettings)

  const thermalHtml = useMemo(() => {
    if (!isThermalPaperSize(paperSize)) return null
    const { generateThermalReceiptHTML } = ThermalReceiptGenerator({ receipt, businessSettings })
    return generateThermalReceiptHTML()
  }, [receipt, businessSettings, paperSize])

  if (isThermalPaperSize(paperSize) && thermalHtml) {
    const widthMm = getThermalPaperWidthMm(paperSize)
    return (
      <ThermalReceiptFrame
        html={thermalHtml}
        paperWidthMm={widthMm}
        receiptNumber={receipt.receiptNumber}
      />
    )
  }

  return (
    <div className="receipt-print-root bg-white rounded-lg shadow-sm overflow-hidden overflow-x-hidden">
      <ReceiptPreview receipt={receipt} businessSettings={businessSettings} />
    </div>
  )
}

export function printReceiptWithTemplate(receipt: Receipt, businessSettings?: any) {
  const paperSize = resolveReceiptPaperSize(businessSettings)
  if (isThermalPaperSize(paperSize)) {
    const { printThermalReceipt } = ThermalReceiptGenerator({ receipt, businessSettings })
    printThermalReceipt()
    return
  }
  window.print()
}
