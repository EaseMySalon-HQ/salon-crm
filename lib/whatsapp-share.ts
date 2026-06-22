/**
 * Client-only helpers to open WhatsApp Web / app with a prefilled message (wa.me),
 * same pattern as receipt share and marketing contact "Book demo".
 */

export function normalizePhoneForWhatsApp(phone: string): string | null {
  const digitsOnly = String(phone || "").replace(/\D/g, "")
  let waPhone = digitsOnly
  if (digitsOnly.length === 10) {
    waPhone = "91" + digitsOnly
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    waPhone = "91" + digitsOnly.slice(1)
  } else if (digitsOnly.length >= 10) {
    waPhone = digitsOnly.startsWith("91") ? digitsOnly : "91" + digitsOnly.slice(-10)
  }
  if (!waPhone || waPhone.length < 10) return null
  return waPhone
}

export function openWhatsAppWebWithText(intlPhoneDigits: string, text: string): void {
  const url = `https://wa.me/${intlPhoneDigits}?text=${encodeURIComponent(text)}`
  if (typeof window === "undefined") return
  window.open(url, "_blank", "noopener,noreferrer")
}

/** Open WhatsApp chat for a phone number (no prefilled message). */
export function openWhatsAppChat(intlPhoneDigits: string): void {
  if (typeof window === "undefined") return
  window.open(`https://wa.me/${intlPhoneDigits}`, "_blank", "noopener,noreferrer")
}

export type PurchaseOrderWhatsAppLine = {
  productName: string
  quantity: number
  unitCost: number
  lineTotal: number
}

export function formatPurchaseOrderWhatsAppMessage(p: {
  supplierName: string
  contactPerson?: string
  poNumber?: string | null
  orderDateLabel: string
  expectedDeliveryLabel?: string
  notes?: string
  lines: PurchaseOrderWhatsAppLine[]
  subtotal: number
  gstAmount: number
  grandTotal: number
}): string {
  const who = p.contactPerson?.trim() || p.supplierName || "there"
  let text = `Hi ${who},\n\n`
  if (p.poNumber?.trim()) {
    text += `Purchase order ${p.poNumber.trim()}\n`
  } else {
    text += `Purchase order (our reference will be assigned when we submit this order in our system)\n`
  }
  text += `${p.supplierName ? `Vendor: ${p.supplierName}\n` : ""}`
  text += `Order date: ${p.orderDateLabel}\n`
  if (p.expectedDeliveryLabel?.trim()) {
    text += `Expected delivery: ${p.expectedDeliveryLabel}\n`
  }
  const qtyOnly =
    (p.grandTotal || 0) <= 0.005 &&
    p.lines.every((L) => (L.unitCost || 0) <= 0 && (L.lineTotal || 0) <= 0.005)

  text += `\nItems:\n`
  if (qtyOnly) {
    for (const L of p.lines) {
      text += `• ${L.productName} — Qty ${L.quantity}\n`
    }
    text += `\nPricing is recorded on our purchase invoice after receipt.\n`
  } else {
    for (const L of p.lines) {
      text += `• ${L.productName} — Qty ${L.quantity} × ₹${L.unitCost.toFixed(2)} = ₹${L.lineTotal.toFixed(2)}\n`
    }
    text += `\nSubtotal ₹${p.subtotal.toFixed(2)} | GST ₹${p.gstAmount.toFixed(2)}\n`
    text += `Grand total ₹${p.grandTotal.toFixed(2)}\n`
  }
  if (p.notes?.trim()) text += `\nNotes: ${p.notes.trim()}\n`
  text += `\nThank you.`
  return text
}
