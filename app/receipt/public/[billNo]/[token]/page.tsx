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
import { buildReceiptPaymentsFromSale } from "@/lib/sale-payment-lines"

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
  return {
    id: saleData._id || saleData.id,
    billNo: saleData.billNo,
    customerName: saleData.customerName,
    customerPhone: saleData.customerPhone || "N/A",
    date: saleData.date,
    time: saleData.time || new Date(saleData.date).toLocaleTimeString(),
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
    payments:
      saleData.payments?.length > 0
        ? buildReceiptPaymentsFromSale({
            date: saleData.date,
            payments: saleData.payments,
            paymentHistory: saleData.paymentHistory || [],
          })
        : [
            {
              type: (String(saleData.paymentMode || "cash").split(",")[0]?.trim().toLowerCase() ||
                "unknown") as "cash" | "card" | "online" | "wallet" | "unknown",
              amount: saleData.grossTotal,
              recordedAt: new Date(saleData.date).toISOString(),
            },
          ],
    staffName: saleData.staffName,
    status: saleData.status,
    taxBreakdown: saleData.taxBreakdown,
    billChangeCreditedToWallet:
      saleData.billChangeCreditedToWallet != null &&
      Number(saleData.billChangeCreditedToWallet) > 0.005
        ? Number(saleData.billChangeCreditedToWallet)
        : undefined,
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
                receipt={{
                  id: receipt.id,
                  receiptNumber: receipt.billNo,
                  clientId: receipt.id,
                  clientName: receipt.customerName,
                  clientPhone: receipt.customerPhone,
                  date: receipt.date,
                  time: receipt.time,
                  items:
                    receipt.items?.map((item) => ({
                      id: item.name,
                      name: item.name,
                      type: item.type as "service" | "product",
                      price: item.price,
                      quantity: item.quantity,
                      discount: (item as any).discount ?? 0,
                      discountType: ((item as any).discountType || "percentage") as "percentage" | "fixed",
                      staffId: receipt.id,
                      staffName: item.staffName || receipt.staffName,
                      staffContributions: item.staffContributions,
                      total: item.total,
                      hsnSacCode: (item as any).hsnSacCode || "",
                      taxAmount: (item as any).taxAmount,
                      priceExcludingGST: (item as any).priceExcludingGST,
                      taxRate: (item as any).taxRate,
                    })) || [],
                  subtotal: receipt.netTotal,
                  subtotalExcludingTax: (receipt as any).subtotalExcludingTax,
                  tip: 0,
                  discount: 0,
                  tax: receipt.taxAmount,
                  total: receipt.grossTotal,
                  payments:
                    receipt.payments?.map((payment) => ({
                      type: (payment?.type || "unknown") as
                        | "cash"
                        | "card"
                        | "online"
                        | "wallet"
                        | "unknown",
                      amount: payment?.amount || 0,
                      recordedAt: payment?.recordedAt,
                    })) || [],
                  staffId: receipt.id,
                  staffName: receipt.staffName,
                  notes: "",
                  taxBreakdown: receipt.taxBreakdown,
                  billChangeCreditedToWallet: receipt.billChangeCreditedToWallet,
                }}
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

