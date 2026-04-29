import type { Receipt } from "@/lib/data"
import { buildReceiptPaymentsFromSale } from "@/lib/sale-payment-lines"

/**
 * Maps a sale from SalesAPI.getByBillNo to the Receipt shape used by ReceiptPreview.
 * Kept in sync with the API fallback branch in app/receipt/[billNo]/page.tsx.
 */
export function receiptPreviewReceiptFromSaleApi(saleData: any): Receipt {
  const id = String(saleData._id || saleData.id || "")
  const billNo = String(saleData.billNo || "")
  const items = saleData.items || []

  const payments =
    saleData.payments?.length > 0
      ? buildReceiptPaymentsFromSale({
          date: saleData.date,
          payments: saleData.payments,
          paymentHistory: saleData.paymentHistory || [],
        })
      : [
          {
            type: (saleData.paymentMode?.split?.(",")?.[0]?.toLowerCase() || "cash") as
              | "cash"
              | "card"
              | "online"
              | "unknown",
            amount: saleData.grossTotal,
            recordedAt: new Date(saleData.date).toISOString(),
          },
        ]

  const subtotalExcludingTax =
    items.reduce((sum: number, item: any) => {
      const base =
        item.priceExcludingGST != null
          ? item.priceExcludingGST * (item.quantity || 1)
          : (item.total || 0) - (item.taxAmount || 0)
      return sum + base
    }, 0) || (saleData.grossTotal - saleData.taxAmount)

  const taxBreakdown = saleData.taxBreakdown
    ? {
        serviceTax: saleData.taxBreakdown.serviceTax ?? 0,
        serviceRate: saleData.taxBreakdown.serviceRate ?? 5,
        productTaxByRate: saleData.taxBreakdown.productTaxByRate || {},
      }
    : undefined

  return {
    id,
    receiptNumber: billNo,
    clientId: id,
    clientName: saleData.customerName,
    clientPhone: saleData.customerPhone || "N/A",
    date: saleData.date,
    time: new Date(saleData.date).toLocaleTimeString(),
    items:
      items.map((item: any) => ({
        id: item.name,
        name: item.name,
        type: item.type as "service" | "product",
        price: item.price,
        quantity: item.quantity,
        discount: item.discount ?? 0,
        discountType: (item.discountType || "percentage") as "percentage" | "fixed",
        staffId: id,
        staffName: item.staffName || saleData.staffName,
        staffContributions: item.staffContributions,
        total: item.total,
        hsnSacCode: item.hsnSacCode || "",
        taxAmount: item.taxAmount,
        priceExcludingGST: item.priceExcludingGST,
        taxRate: item.taxRate,
      })) || [],
    subtotal: saleData.netTotal,
    subtotalExcludingTax,
    tip: saleData.tip || 0,
    tipStaffName: saleData.tipStaffName,
    discount: 0,
    tax: saleData.taxAmount,
    total: saleData.grossTotal + (saleData.tip || 0),
    payments,
    staffId: id,
    staffName: saleData.staffName,
    notes: "",
    taxBreakdown,
    status:
      typeof saleData.status === "string"
        ? saleData.status
        : saleData.invoiceDeleted
          ? "cancelled"
          : "completed",
    invoiceDeleted: saleData.invoiceDeleted === true,
    billChangeCreditedToWallet:
      saleData.billChangeCreditedToWallet != null &&
      Number(saleData.billChangeCreditedToWallet) > 0.005
        ? Number(saleData.billChangeCreditedToWallet)
        : undefined,
  } as Receipt
}
