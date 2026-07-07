import { normalizePhoneForWhatsApp, openWhatsAppWebWithText } from "@/lib/whatsapp-share"
import type { PayrollRow } from "@/lib/api"
import { formatPaymentMethod } from "@/lib/payroll-export"

export function formatPayslipWhatsAppMessage(
  row: PayrollRow,
  periodLabel: string,
  formatAmount: (n: number) => string,
  businessName?: string
): string {
  const lines: string[] = []
  lines.push(`*Salary slip — ${periodLabel}*`)
  if (businessName) lines.push(businessName)
  lines.push("")
  lines.push(`Hi ${row.staffName},`)
  lines.push("")
  lines.push("*Earnings*")
  lines.push(`Base salary: ${formatAmount(row.baseSalary)}`)
  lines.push(`Commission: ${formatAmount(row.incentive)}`)
  if (row.bonus > 0) lines.push(`Bonus: ${formatAmount(row.bonus)}`)

  const hasDeductions = row.deductions > 0
  if (hasDeductions) {
    lines.push("")
    lines.push("*Deductions*")
    if ((row.leaveDeduction ?? 0) > 0) {
      lines.push(
        `Leave without pay (${row.unpaidLeaveDays ?? 0} day(s)): -${formatAmount(row.leaveDeduction ?? 0)}`
      )
    }
    if ((row.advanceRecovery ?? 0) > 0) {
      lines.push(`Advance recovery: -${formatAmount(row.advanceRecovery ?? 0)}`)
    }
    if ((row.manualDeductions ?? 0) > 0) {
      lines.push(`Other: -${formatAmount(row.manualDeductions ?? 0)}`)
    }
  }

  lines.push("")
  lines.push(`*Net pay: ${formatAmount(row.netPay)}*`)

  if (row.status === "paid") {
    lines.push("")
    lines.push(
      `Paid via ${formatPaymentMethod(row.paymentMethod)}${
        row.paidAt ? ` on ${new Date(row.paidAt).toLocaleDateString("en-IN")}` : ""
      }`
    )
  }

  lines.push("")
  lines.push("Thank you.")
  return lines.join("\n")
}

export function sharePayslipViaWhatsApp(
  row: PayrollRow,
  periodLabel: string,
  formatAmount: (n: number) => string,
  businessName?: string
): boolean {
  const phone = normalizePhoneForWhatsApp(row.phone || "")
  if (!phone) return false
  const text = formatPayslipWhatsAppMessage(row, periodLabel, formatAmount, businessName)
  openWhatsAppWebWithText(phone, text)
  return true
}
