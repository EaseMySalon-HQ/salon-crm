"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { ReceiptPreview } from "@/components/receipts/receipt-preview"
import {
  PublicInvoiceFeedbackSection,
  type FeedbackEligibility,
} from "@/components/receipts/public-invoice-feedback"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { SalesAPI } from "@/lib/api"
import { buildReceiptPaymentsWithLegacyFallback } from "@/lib/sale-payment-lines"
import { formatSaleTimeForDisplay } from "@/lib/sale-datetime-format"
import { receiptPreviewFromBillPageData } from "@/lib/receipt-preview-from-sale-api"

interface ReceiptData {
  id: string
  billNo: string
  customerName: string
  customerPhone: string
  date: string
  time: string
  items: Array<{
    name: string
    type: string
    quantity: number
    price: number
    total: number
    discount?: number
    discountType?: string
    staffName?: string
    staffContributions?: Array<{ staffId?: string; staffName?: string; percentage?: number; amount?: number }>
    hsnSacCode?: string
    taxAmount?: number
    priceExcludingGST?: number
    taxRate?: number
  }>
  netTotal: number
  taxAmount: number
  grossTotal: number
  subtotalExcludingTax?: number
  paymentMode: string
  payments: Array<{
    type: string
    amount: number
    recordedAt?: string
  }>
  staffName: string
  status: string
  taxBreakdown?: {
    serviceTax: number
    serviceRate: number
    productTaxByRate: { [rate: string]: number }
  }
  billChangeCreditedToWallet?: number
}

function mapSaleToReceiptData(saleData: any): ReceiptData {
  const receiptPayments = buildReceiptPaymentsWithLegacyFallback({
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

  return {
    id: saleData._id || saleData.id,
    billNo: saleData.billNo,
    customerName: saleData.customerName,
    customerPhone: saleData.customerPhone || "N/A",
    date: saleData.date,
    time: formatSaleTimeForDisplay({ date: saleData.date, time: saleData.time }),
    items: saleData.items.map((item: any) => ({
      name: item.name,
      type: item.type,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
      discount: item.discount ?? 0,
      discountType: item.discountType || "percentage",
      staffName: item.staffName || saleData.staffName,
      staffContributions: item.staffContributions,
      hsnSacCode: item.hsnSacCode || "",
      taxAmount: item.taxAmount,
      priceExcludingGST: item.priceExcludingGST,
      taxRate: item.taxRate,
      lineSource: item.lineSource,
    })),
    netTotal: saleData.netTotal,
    taxAmount: saleData.taxAmount,
    grossTotal: saleData.grossTotal,
    subtotalExcludingTax:
      (saleData.items || []).reduce((sum: number, item: any) => {
        const base =
          item.priceExcludingGST != null
            ? item.priceExcludingGST * (item.quantity || 1)
            : (item.total || 0) - (item.taxAmount || 0)
        return sum + base
      }, 0) || (saleData.grossTotal - saleData.taxAmount),
    paymentMode: saleData.paymentMode,
    payments: receiptPayments,
    staffName: saleData.staffName,
    status: saleData.status,
    taxBreakdown: saleData.taxBreakdown,
    billChangeCreditedToWallet:
      saleData.billChangeCreditedToWallet != null &&
      Number(saleData.billChangeCreditedToWallet) > 0.005
        ? Number(saleData.billChangeCreditedToWallet)
        : undefined,
    tip: saleData.tip || 0,
    discount: Math.max(0, Number(saleData.discount) || 0),
    discountType: saleData.discountType,
    loyaltyDiscountAmount: Math.max(0, Number(saleData.loyaltyDiscountAmount) || 0),
    receiptTotalsBreakdown: saleData.receiptTotalsBreakdown ?? undefined,
  }
}

// Public receipt page - no authentication required
export default function PublicReceiptPage() {
  const params = useParams()
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [businessSettings, setBusinessSettings] = useState<any>(null)
  const [feedbackEligibility, setFeedbackEligibility] = useState<FeedbackEligibility | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const applyPublicReceiptResponse = useCallback((response: Awaited<ReturnType<typeof SalesAPI.getByBillNoPublic>>) => {
    if (!response.success || !response.data) return false
    const receiptData = mapSaleToReceiptData(response.data)
    setReceipt(receiptData)
    if (response.businessSettings) {
      setBusinessSettings(response.businessSettings)
    } else {
      setBusinessSettings({
        name: "Business",
        address: "",
        phone: "",
        email: "",
        gstin: "",
        logo: null,
      })
    }
    if (response.feedbackEligibility) {
      setFeedbackEligibility(response.feedbackEligibility as FeedbackEligibility)
    } else {
      setFeedbackEligibility(null)
    }
    return true
  }, [])

  /** Re-fetch receipt + eligibility after feedback submit (no full-page loader). */
  const refreshPublicReceipt = useCallback(async () => {
    const billNo = params.billNo as string
    const token = params.token as string
    if (!billNo || !token) return
    try {
      const response = await SalesAPI.getByBillNoPublic(billNo, token)
      if (response.success && response.data) {
        applyPublicReceiptResponse(response)
      }
    } catch {
      /* keep current UI */
    }
  }, [params.billNo, params.token, applyPublicReceiptResponse])

  // Load receipt data by bill number and token
  useEffect(() => {
    const loadReceipt = async () => {
      try {
        const billNo = params.billNo as string
        const token = params.token as string

        if (!billNo || !token) {
          setError("Bill number and token are required")
          setIsLoading(false)
          return
        }

        try {
          const response = await SalesAPI.getByBillNoPublic(billNo, token)
          if (applyPublicReceiptResponse(response)) {
            setError(null)
          } else {
            setError("Receipt not found or invalid link")
            setFeedbackEligibility(null)
          }
        } catch (apiError: any) {
          console.error("Public receipt API error:", apiError)
          setError(apiError.response?.data?.error || "Failed to load receipt")
          setFeedbackEligibility(null)
        }
      } catch (err) {
        console.error("Error loading receipt:", err)
        setError("Failed to load receipt")
      } finally {
        setIsLoading(false)
      }
    }

    loadReceipt()
  }, [params.billNo, params.token, applyPublicReceiptResponse])

  const handleDownloadPDF = () => {
    // Simply trigger browser's print dialog (user can save as PDF)
    window.print()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading receipt...</p>
        </div>
      </div>
    )
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">❌</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Receipt Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'The requested receipt could not be found.'}</p>
          <p className="text-sm text-gray-500">This link may have expired or is invalid.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Receipt Content - Clean view without action buttons */}
      <div className="max-w-4xl mx-auto">
        <PublicInvoiceFeedbackSection
          billNo={params.billNo as string}
          shareToken={params.token as string}
          eligibility={feedbackEligibility}
          businessName={businessSettings?.name}
          onFeedbackSubmitted={refreshPublicReceipt}
          receipt={
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <ReceiptPreview
                receipt={receiptPreviewFromBillPageData({
                  ...receipt,
                  payments: receipt.payments.map((payment) => ({
                    mode: payment.type,
                    amount: payment.amount,
                    recordedAt: payment.recordedAt,
                  })),
                })}
                businessSettings={businessSettings}
              />
            </div>
          }
          trailingActions={
            <Button
              type="button"
              onClick={handleDownloadPDF}
              variant="outline"
              className="bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          }
        />
      </div>

      {/* Print styles - hide button when printing */}
      <style jsx global>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}

