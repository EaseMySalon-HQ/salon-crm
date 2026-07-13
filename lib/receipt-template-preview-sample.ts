import type { Receipt } from "@/lib/data"
import type { ReceiptPaperSize } from "@/lib/receipt-paper-size"

export function buildReceiptTemplatePreviewSample(): Receipt {
  const subtotalExcludingTax = 1428.57
  const tax = 257.14
  const total = 1685.71

  return {
    id: "preview",
    receiptNumber: "INV-000042",
    clientId: "preview-client",
    clientName: "Priya Sharma",
    clientPhone: "9876543210",
    date: new Date().toISOString().slice(0, 10),
    time: "2:30 PM",
    items: [
      {
        id: "preview-item-1",
        name: "Haircut & Styling",
        type: "service",
        quantity: 1,
        price: 800,
        discount: 0,
        discountType: "percentage",
        staffName: "Anita",
        total: 800,
        taxRate: 5,
      } as Receipt["items"][number],
      {
        id: "preview-item-2",
        name: "Keratin Shampoo",
        type: "product",
        quantity: 1,
        price: 885.71,
        discount: 0,
        discountType: "percentage",
        total: 885.71,
        hsnSacCode: "3305",
        taxRate: 18,
      },
    ],
    subtotal: subtotalExcludingTax + tax,
    subtotalExcludingTax,
    tip: 100,
    tipStaffName: "Anita",
    discount: 0,
    discountType: "percentage",
    tax,
    total: total + 100,
    payments: [{ type: "online", amount: total + 100 }],
    staffId: "preview-staff",
    staffName: "Anita",
    status: "completed",
    taxBreakdown: {
      serviceTax: 38.1,
      serviceRate: 5,
      productTaxByRate: { "18": 134.29 },
    },
    totalsBreakdown: {
      grossPreTaxTotal: 1428.57,
      lineDiscountAmount: 0,
      membershipDiscountAmount: 0,
      cartDiscountAmount: 0,
      subtotalPreTax: 1428.57,
      taxAmount: 257.14,
      totalInclTax: 1685.71,
      roundOff: 0,
      loyaltyDiscountAmount: 0,
      tip: 100,
      grandTotal: 1785.71,
    },
  }
}

export function mergePreviewBusinessSettings(
  businessSettings: Record<string, unknown> | null | undefined,
  paperSize: ReceiptPaperSize
) {
  return {
    name: "Your Salon",
    address: "123 Beauty Street",
    city: "Mumbai",
    state: "Maharashtra",
    zipCode: "400001",
    phone: "9876543210",
    email: "hello@yoursalon.com",
    gstNumber: "27AAAAA0000A1Z5",
    currency: "INR",
    enableCurrency: true,
    enableTax: true,
    ...(businessSettings || {}),
    receiptPaperSize: paperSize,
  }
}
