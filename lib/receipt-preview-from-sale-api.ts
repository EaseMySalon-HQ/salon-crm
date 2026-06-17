import type { Receipt } from "@/lib/data"
import { buildReceiptPaymentsWithLegacyFallback } from "@/lib/sale-payment-lines"
import { formatSaleTimeForDisplay } from "@/lib/sale-datetime-format"
import { mapSaleRefundHistoryForReceipt } from "@/lib/receipt-refunds"

function mapSaleTipLinesForReceipt(raw: unknown): Array<{ staffName: string; amount: number }> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const lines = raw
    .map((l: any) => ({
      staffName: l?.staffName != null ? String(l.staffName).trim() : "",
      amount: Math.max(0, Number(l?.amount) || 0),
    }))
    .filter((l) => l.amount > 0.005 && l.staffName)
  return lines.length > 0 ? lines : undefined
}

/**
 * Maps a sale from SalesAPI.getByBillNo to the Receipt shape used by ReceiptPreview.
 * Kept in sync with the API fallback branch in app/receipt/[billNo]/page.tsx.
 */
export function receiptPreviewReceiptFromSaleApi(saleData: any): Receipt {
  const id = String(saleData._id || saleData.id || "")
  const billNo = String(saleData.billNo || "")
  const items = saleData.items || []

  const paymentsFinal = buildReceiptPaymentsWithLegacyFallback({
    date: saleData.date,
    payments: saleData.payments,
    paymentHistory: saleData.paymentHistory || [],
    loyaltyPointsRedeemed: saleData.loyaltyPointsRedeemed,
    loyaltyDiscountAmount: saleData.loyaltyDiscountAmount,
    status: saleData.status,
    invoiceDeleted: saleData.invoiceDeleted,
    paymentStatus: saleData.paymentStatus,
    grossTotal: saleData.grossTotal,
    paymentMode: saleData.paymentMode,
    tip: saleData.tip,
  })

  const subtotalExcludingTax =
    items.reduce((sum: number, item: any) => {
      const base =
        item.priceExcludingGST != null
          ? item.priceExcludingGST * (item.quantity || 1)
          : (item.total || 0) - (item.taxAmount || 0)
      return sum + base
    }, 0) || (saleData.grossTotal - saleData.taxAmount)

  const discountType =
    String(saleData.discountType || "percentage").toLowerCase() === "fixed"
      ? "fixed"
      : "percentage"
  const cartDiscount = Math.max(0, Number(saleData.discount) || 0)
  const loyaltyDiscountAmount = Math.max(0, Number(saleData.loyaltyDiscountAmount) || 0)
  const grossTotal = Number(saleData.grossTotal) || 0
  const tipAmount = Number(saleData.tip) || 0
  const roundOff =
    saleData.receiptTotalsBreakdown?.roundOff != null
      ? Number(saleData.receiptTotalsBreakdown.roundOff)
      : 0

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
    time: formatSaleTimeForDisplay({ date: saleData.date, time: saleData.time }),
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
        lineSource: item.lineSource,
        isMembershipFree: item.isMembershipFree,
        membershipDiscountPercent: item.membershipDiscountPercent,
      })) || [],
    subtotal: saleData.netTotal,
    subtotalExcludingTax,
    tip: tipAmount,
    tipStaffName: saleData.tipStaffName,
    tipLines: mapSaleTipLinesForReceipt(saleData.tipLines),
    discount: cartDiscount,
    discountType,
    tax: saleData.taxAmount,
    roundOff,
    total: grossTotal + tipAmount,
    totalsBreakdown: saleData.receiptTotalsBreakdown ?? undefined,
    loyaltyDiscountAmount,
    payments: paymentsFinal,
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
    walletRefundCredited:
      saleData.walletRefundCredited != null &&
      Number(saleData.walletRefundCredited) > 0.005
        ? Number(saleData.walletRefundCredited)
        : undefined,
    refundHistory: mapSaleRefundHistoryForReceipt(saleData.refundHistory),
    paymentStatus: saleData.paymentStatus
      ? {
          paidAmount:
            saleData.paymentStatus.paidAmount != null
              ? Number(saleData.paymentStatus.paidAmount)
              : undefined,
          totalAmount:
            saleData.paymentStatus.totalAmount != null
              ? Number(saleData.paymentStatus.totalAmount)
              : undefined,
          remainingAmount:
            saleData.paymentStatus.remainingAmount != null
              ? Number(saleData.paymentStatus.remainingAmount)
              : undefined,
        }
      : undefined,
  } as Receipt
}

/** Maps bill receipt page / thermal payload to ReceiptPreview shape. */
export function receiptPreviewFromBillPageData(data: {
  id: string
  billNo: string
  customerName: string
  customerPhone: string
  date: string
  time: string
  items: any[]
  netTotal: number
  taxAmount: number
  grossTotal: number
  subtotalExcludingTax?: number
  tip?: number
  tipStaffName?: string
  tipLines?: Array<{ staffName?: string; amount: number }>
  discount?: number
  discountType?: string
  loyaltyDiscountAmount?: number
  receiptTotalsBreakdown?: Receipt["totalsBreakdown"]
  payments?: any[]
  paymentHistory?: any[]
  loyaltyPointsRedeemed?: number
  status?: string
  invoiceDeleted?: boolean
  paymentStatus?: any
  paymentMode?: string
  staffName?: string
  taxBreakdown?: Receipt["taxBreakdown"]
  shareToken?: string
  billChangeCreditedToWallet?: number
  walletRefundCredited?: number
  refundHistory?: unknown
  paymentStatus?: any
}): Receipt {
  return receiptPreviewReceiptFromSaleApi({
    _id: data.id,
    id: data.id,
    billNo: data.billNo,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    date: data.date,
    time: data.time,
    items: data.items,
    netTotal: data.netTotal,
    taxAmount: data.taxAmount,
    grossTotal: data.grossTotal,
    tip: data.tip,
    tipStaffName: data.tipStaffName,
    tipLines: data.tipLines,
    discount: data.discount,
    discountType: data.discountType,
    loyaltyDiscountAmount: data.loyaltyDiscountAmount,
    receiptTotalsBreakdown: data.receiptTotalsBreakdown,
    payments: data.payments,
    paymentHistory: data.paymentHistory,
    loyaltyPointsRedeemed: data.loyaltyPointsRedeemed,
    status: data.status,
    invoiceDeleted: data.invoiceDeleted,
    paymentStatus: data.paymentStatus,
    paymentMode: data.paymentMode,
    staffName: data.staffName,
    taxBreakdown: data.taxBreakdown,
    shareToken: data.shareToken,
    billChangeCreditedToWallet: data.billChangeCreditedToWallet,
    walletRefundCredited: data.walletRefundCredited,
    refundHistory: data.refundHistory,
    paymentStatus: data.paymentStatus,
  })
}
