import { downloadTablePdf, downloadTableXlsx } from "@/lib/inventory-lists-export"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { PayrollPeriod, PayrollRow } from "@/lib/api"

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank transfer",
  wallet: "Wallet",
}

/** Business details shown on salary slips (ASCII-safe PDF output). */
export interface PayslipBusinessInfo {
  name: string
  addressLines: string[]
  phone?: string
  email?: string
  gstNumber?: string
}

export function formatPaymentMethod(method: string): string {
  return PAYMENT_LABELS[method] || method || "—"
}

/** jsPDF default fonts do not render ₹ — use ASCII-safe labels (Rs., USD, etc.). */
export function formatPdfMoney(amount: number, currency = "INR"): string {
  const value = Math.abs(Number(amount) || 0)
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

  const prefixByCurrency: Record<string, string> = {
    INR: "Rs.",
    USD: "USD",
    EUR: "EUR",
    GBP: "GBP",
    CAD: "CAD",
  }
  const prefix = prefixByCurrency[currency] || currency
  return amount < 0 ? `- ${prefix} ${formatted}` : `${prefix} ${formatted}`
}

export function businessSettingsToPayslipInfo(raw: {
  name?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  phone?: string
  email?: string
  gstNumber?: string
} | null | undefined): PayslipBusinessInfo {
  const addressLines: string[] = []
  if (raw?.address?.trim()) addressLines.push(raw.address.trim())
  const cityLine = [raw?.city, raw?.state, raw?.zipCode].filter(Boolean).join(", ")
  if (cityLine) addressLines.push(cityLine)

  return {
    name: raw?.name?.trim() || "Salary Slip",
    addressLines,
    phone: raw?.phone?.trim() || undefined,
    email: raw?.email?.trim() || undefined,
    gstNumber: raw?.gstNumber?.trim() || undefined,
  }
}

function pickNonEmpty(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

/** Merge tenant business settings with main Business profile for payslip header. */
export function mergePayslipBusinessSources(
  settings: {
    name?: string
    address?: string
    city?: string
    state?: string
    zipCode?: string
    phone?: string
    email?: string
    gstNumber?: string
  } | null | undefined,
  info: {
    name?: string
    address?: { street?: string; city?: string; state?: string; zipCode?: string }
    contact?: { phone?: string; email?: string }
  } | null | undefined
): PayslipBusinessInfo {
  return businessSettingsToPayslipInfo({
    name: pickNonEmpty(settings?.name, info?.name),
    address: pickNonEmpty(settings?.address, info?.address?.street),
    city: pickNonEmpty(settings?.city, info?.address?.city),
    state: pickNonEmpty(settings?.state, info?.address?.state),
    zipCode: pickNonEmpty(settings?.zipCode, info?.address?.zipCode),
    phone: pickNonEmpty(settings?.phone, info?.contact?.phone),
    email: pickNonEmpty(settings?.email, info?.contact?.email),
    gstNumber: settings?.gstNumber,
  })
}

export function sanitizePdfText(text: string): string {
  return text.replace(/\u20B9/g, "Rs.").replace(/₹/g, "Rs.")
}

function computePayslipHeaderHeight(business?: PayslipBusinessInfo): number {
  let lines = 1
  lines += business?.addressLines.length ?? 0
  if (business?.phone || business?.email) lines += 1
  if (business?.gstNumber) lines += 1
  return Math.max(22, 10 + lines * 4.5 + 4)
}

function pdfFinalY(doc: jsPDF, fallback: number): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback
}

function formatPayPeriodMonth(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
}

export function exportPayrollXlsx(
  period: PayrollPeriod,
  formatAmount: (n: number) => string
) {
  const headers = [
    "Staff",
    "Role",
    "Base salary",
    "Commission",
    "Bonus",
    "LWP deduction",
    "Advance recovery",
    "Other deductions",
    "Total deductions",
    "Net pay",
    "Status",
    "Payment mode",
    "Paid on",
  ]

  const rows = period.rows.map((r) => [
    r.staffName,
    r.role || "",
    formatAmount(r.baseSalary),
    formatAmount(r.incentive),
    formatAmount(r.bonus),
    formatAmount(r.leaveDeduction ?? 0),
    formatAmount(r.advanceRecovery ?? 0),
    formatAmount(r.manualDeductions ?? 0),
    formatAmount(r.deductions),
    formatAmount(r.netPay),
    r.status === "paid" ? "Paid" : "Pending",
    r.status === "paid" ? formatPaymentMethod(r.paymentMethod) : "",
    r.paidAt ? new Date(r.paidAt).toLocaleDateString("en-IN") : "",
  ])

  downloadTableXlsx(`payroll-${period.month}`, "Payroll", headers, rows)
}

export function exportPayrollPdf(
  period: PayrollPeriod,
  formatAmount: (n: number) => string
) {
  const headers = [
    "Staff",
    "Base",
    "Commission",
    "Bonus",
    "Deductions",
    "Net pay",
    "Status",
  ]

  const rows = period.rows.map((r) => [
    r.staffName,
    formatAmount(r.baseSalary),
    formatAmount(r.incentive),
    formatAmount(r.bonus),
    formatAmount(r.deductions),
    formatAmount(r.netPay),
    r.status === "paid" ? "Paid" : "Pending",
  ])

  downloadTablePdf(
    "Staff Payroll Report",
    period.periodLabel,
    `payroll-${period.month}`,
    headers,
    rows,
    true
  )
}

export function downloadPayslipPdf(
  row: PayrollRow,
  periodLabel: string,
  options?: {
    business?: PayslipBusinessInfo
    currency?: string
  }
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  const currency = options?.currency || "INR"
  const money = (n: number) => formatPdfMoney(n, currency)
  const business = options?.business
  let y = 14

  // ── Business header ─────────────────────────────────────────────────────
  const headerHeight = computePayslipHeaderHeight(business)
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(margin, y, contentWidth, headerHeight, 2, 2, "FD")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text(business?.name || "Salary Slip", margin + 4, y + 8)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  let headerY = y + 14

  for (const line of business?.addressLines || []) {
    doc.text(line, margin + 4, headerY, { maxWidth: contentWidth - 8 })
    headerY += 4.5
  }

  const contactParts: string[] = []
  if (business?.phone) contactParts.push(`Phone: ${business.phone}`)
  if (business?.email) contactParts.push(`Email: ${business.email}`)
  if (contactParts.length > 0) {
    doc.text(contactParts.join("  |  "), margin + 4, headerY, { maxWidth: contentWidth - 8 })
    headerY += 4.5
  }
  if (business?.gstNumber) {
    doc.text(`GSTIN: ${business.gstNumber}`, margin + 4, headerY, { maxWidth: contentWidth - 8 })
  }

  y += headerHeight + 4

  // ── Title band ──────────────────────────────────────────────────────────
  doc.setFillColor(51, 65, 85)
  doc.rect(margin, y, contentWidth, 14, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text("SALARY SLIP", pageWidth / 2, y + 6, { align: "center" })
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(periodLabel || formatPayPeriodMonth(row.month), pageWidth / 2, y + 11, { align: "center" })
  y += 18

  // ── Employee details ────────────────────────────────────────────────────
  const generatedOn = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

  autoTable(doc, {
    body: [
      ["Employee name", row.staffName, "Pay period", formatPayPeriodMonth(row.month)],
      ["Designation", row.role || "—", "Slip date", generatedOn],
      ["Employee phone", row.phone || "—", "Payment status", row.status === "paid" ? "Paid" : "Pending"],
    ],
    startY: y,
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 34, fillColor: [248, 250, 252] },
      1: { cellWidth: 58 },
      2: { fontStyle: "bold", cellWidth: 30, fillColor: [248, 250, 252] },
      3: { cellWidth: "auto" },
    },
    margin: { left: margin, right: margin },
  })

  y = pdfFinalY(doc, y + 24) + 6

  // ── Earnings ────────────────────────────────────────────────────────────
  const earnings: [string, string][] = [["Base salary", money(row.baseSalary)]]
  if ((row.incentive ?? 0) > 0) earnings.push(["Commission / incentive", money(row.incentive)])
  if ((row.bonus ?? 0) > 0) earnings.push(["Bonus", money(row.bonus)])
  if ((row.overtimePay ?? 0) > 0) earnings.push(["Overtime pay", money(row.overtimePay ?? 0)])

  const totalEarnings =
    (row.baseSalary || 0) + (row.incentive || 0) + (row.bonus || 0) + (row.overtimePay || 0)

  autoTable(doc, {
    head: [["Earnings", "Amount"]],
    body: [...earnings, ["Total earnings", money(totalEarnings)]],
    startY: y,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === earnings.length) {
        data.cell.styles.fillColor = [241, 245, 249]
        data.cell.styles.fontStyle = "bold"
      }
    },
  })

  y = pdfFinalY(doc, y + 20) + 6

  // ── Deductions ──────────────────────────────────────────────────────────
  const deductions: [string, string][] = []
  if ((row.leaveDeduction ?? 0) > 0) {
    deductions.push([
      `Leave without pay (${row.unpaidLeaveDays ?? 0} day(s))`,
      money(-(row.leaveDeduction ?? 0)),
    ])
  }
  if ((row.advanceRecovery ?? 0) > 0) {
    deductions.push(["Advance recovery", money(-(row.advanceRecovery ?? 0))])
  }
  if ((row.latePenalty ?? 0) > 0) {
    deductions.push(["Late penalty", money(-(row.latePenalty ?? 0))])
  }
  if ((row.manualDeductions ?? 0) > 0) {
    deductions.push(["Other deductions", money(-(row.manualDeductions ?? 0))])
  }

  const totalDeductions = row.deductions || 0

  if (deductions.length > 0) {
    autoTable(doc, {
      head: [["Deductions", "Amount"]],
      body: [...deductions, ["Total deductions", money(-totalDeductions)]],
      startY: y,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { halign: "right", fontStyle: "bold", textColor: [185, 28, 28] },
      },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === deductions.length) {
          data.cell.styles.fillColor = [254, 242, 242]
          data.cell.styles.fontStyle = "bold"
        }
      },
    })
    y = pdfFinalY(doc, y + 20) + 8
  }

  // ── Net pay highlight ───────────────────────────────────────────────────
  doc.setFillColor(236, 253, 245)
  doc.setDrawColor(167, 243, 208)
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, "FD")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(6, 95, 70)
  doc.text("Net pay", margin + 4, y + 10)
  doc.setFontSize(14)
  doc.text(money(row.netPay), pageWidth - margin - 4, y + 10, { align: "right" })
  y += 22

  // ── Payment & notes ─────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)

  if (row.status === "paid") {
    doc.text(
      `Paid via ${formatPaymentMethod(row.paymentMethod)} on ${
        row.paidAt ? new Date(row.paidAt).toLocaleDateString("en-IN") : "—"
      }`,
      margin,
      y
    )
    y += 6
  }

  if (row.deductionNote?.trim()) {
    doc.text(`Deduction note: ${sanitizePdfText(row.deductionNote.trim())}`, margin, y, {
      maxWidth: contentWidth,
    })
    y += 6
  }

  if (row.notes?.trim()) {
    doc.text(`Notes: ${sanitizePdfText(row.notes.trim())}`, margin, y, { maxWidth: contentWidth })
    y += 6
  }

  // ── Footer signatures ───────────────────────────────────────────────────
  y = Math.max(y + 10, 250)
  doc.setDrawColor(203, 213, 225)
  doc.line(margin, y, margin + 70, y)
  doc.line(pageWidth - margin - 70, y, pageWidth - margin, y)
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text("Employer signature", margin, y + 5)
  doc.text("Employee signature", pageWidth - margin - 70, y + 5)
  doc.text("This is a computer-generated salary slip.", pageWidth / 2, y + 12, { align: "center" })

  doc.save(`payslip-${row.staffName.replace(/[/\\?%*:|"<>]/g, "-")}-${row.month}.pdf`)
}
