export type ReceiptPaperSize = "57mm" | "80mm" | "A5" | "A4"

export const RECEIPT_PAPER_SIZES: ReceiptPaperSize[] = ["57mm", "80mm", "A5", "A4"]

export const DEFAULT_RECEIPT_PAPER_SIZE: ReceiptPaperSize = "A4"

export type ReceiptPaperSizeOption = {
  value: ReceiptPaperSize
  label: string
  description: string
  category: "thermal" | "standard"
}

export const RECEIPT_PAPER_SIZE_OPTIONS: ReceiptPaperSizeOption[] = [
  {
    value: "57mm",
    label: "57mm Thermal",
    description: "Compact thermal roll for 57mm receipt printers",
    category: "thermal",
  },
  {
    value: "80mm",
    label: "80mm Thermal",
    description: "Standard thermal roll for 80mm receipt printers",
    category: "thermal",
  },
  {
    value: "A5",
    label: "A5",
    description: "Half-page layout for normal printers",
    category: "standard",
  },
  {
    value: "A4",
    label: "A4",
    description: "Full-page layout for normal printers",
    category: "standard",
  },
]

export function isReceiptPaperSize(value: unknown): value is ReceiptPaperSize {
  return typeof value === "string" && RECEIPT_PAPER_SIZES.includes(value as ReceiptPaperSize)
}

export function resolveReceiptPaperSize(
  businessSettings?: { receiptPaperSize?: string | null } | null
): ReceiptPaperSize {
  const raw = businessSettings?.receiptPaperSize
  return isReceiptPaperSize(raw) ? raw : DEFAULT_RECEIPT_PAPER_SIZE
}

export function isThermalPaperSize(size: ReceiptPaperSize): boolean {
  return size === "57mm" || size === "80mm"
}

export function getThermalPaperWidthMm(size: ReceiptPaperSize): number {
  return size === "57mm" ? 57 : 80
}

export function getReceiptPreviewClassName(size: ReceiptPaperSize): string {
  switch (size) {
    case "57mm":
      return "max-w-[57mm] w-full mx-auto text-[10px] leading-tight"
    case "80mm":
      return "max-w-[80mm] w-full mx-auto text-xs leading-snug"
    case "A5":
      return "max-w-[148mm] w-full mx-auto text-sm"
    case "A4":
    default:
      return "max-w-2xl w-full mx-auto text-sm"
  }
}

export function getReceiptPrintCss(size: ReceiptPaperSize): string {
  const pageSize =
    size === "57mm"
      ? "57mm auto"
      : size === "80mm"
        ? "80mm auto"
        : size === "A5"
          ? "A5 portrait"
          : "A4 portrait"

  const bodyWidth =
    size === "57mm" ? "57mm" : size === "80mm" ? "80mm" : size === "A5" ? "148mm" : "210mm"

  return `
    @media print {
      @page {
        size: ${pageSize};
        margin: ${isThermalPaperSize(size) ? "2mm" : "10mm"};
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${bodyWidth};
      }
      .receipt-print-root {
        width: ${bodyWidth} !important;
        max-width: ${bodyWidth} !important;
        margin: 0 auto !important;
        box-shadow: none !important;
        border: none !important;
      }
      .no-print {
        display: none !important;
      }
    }
  `
}
