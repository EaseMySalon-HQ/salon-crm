"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ReceiptPreview } from "@/components/receipts/receipt-preview"
import { Button } from "@/components/ui/button"
import { Printer, ArrowLeft, Thermometer, MessageCircle } from "lucide-react"
import Link from "next/link"
import { SettingsAPI } from "@/lib/api"
import { SalesAPI } from "@/lib/api"
import { ThermalReceiptGenerator } from "@/components/receipts/thermal-receipt-generator"
import { useToast } from "@/hooks/use-toast"

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
  tip: number
  tipStaffName?: string
  paymentMode: string
  payments: Array<{
    type: string
    amount: number
  }>
  staffName: string
  status: string
  invoiceDeleted?: boolean
  taxBreakdown?: {
    serviceTax: number
    serviceRate: number
    productTaxByRate: { [rate: string]: number }
  }
  shareToken?: string
}

export default function ReceiptPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [businessSettings, setBusinessSettings] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  // Load business settings
  useEffect(() => {
    const loadBusinessSettings = async () => {
      try {
        console.log('Loading business settings for receipt...')
        const response = await SettingsAPI.getBusinessSettings()
        console.log('Business settings response:', response)
        if (response.success) {
          setBusinessSettings(response.data)
          console.log('Business settings loaded:', response.data)
        }
      } catch (error) {
        console.error('Error loading business settings:', error)
      }
    }

    loadBusinessSettings()
  }, [])

  // Load receipt data by bill number
  useEffect(() => {
    const loadReceipt = async () => {
      try {
        const billNo = params.billNo as string
        
        console.log('🎯 Receipt Page Debug:')
        console.log('Bill Number:', billNo)
        
        if (!billNo) {
          setError('Bill number is required')
          setIsLoading(false)
          return
        }

        // First, try to use data from query parameters (has correct taxBreakdown)
        try {
          const dataParam = searchParams.get('data')
          if (dataParam) {
            console.log('🔄 Using query parameter data (has correct taxBreakdown)...')
            const frontendData = JSON.parse(decodeURIComponent(dataParam))
            console.log('📋 Frontend data:', frontendData)
            console.log('📋 Frontend taxBreakdown:', frontendData.taxBreakdown)
            console.log('📋 Frontend payments:', frontendData.payments)
            
            // Transform frontend data to receipt format
            const receiptData: ReceiptData = {
              id: frontendData.id,
              billNo: frontendData.receiptNumber,
              customerName: frontendData.clientName,
              customerPhone: frontendData.clientPhone || 'N/A',
              date: frontendData.date,
              time: frontendData.time,
              items: frontendData.items.map((item: any) => ({
                name: item.name,
                type: item.type,
                quantity: item.quantity,
                price: item.price,
                total: item.total,
                discount: item.discount ?? 0,
                discountType: item.discountType || 'percentage',
                staffName: item.staffName || frontendData.staffName,
                staffContributions: item.staffContributions,
                hsnSacCode: item.hsnSacCode || '',
                taxAmount: item.taxAmount,
                priceExcludingGST: item.priceExcludingGST,
                taxRate: item.taxRate
              })),
              netTotal: frontendData.subtotal,
              taxAmount: frontendData.tax,
              grossTotal: frontendData.total - (frontendData.tip || 0),
              subtotalExcludingTax: frontendData.subtotalExcludingTax,
              tip: frontendData.tip || 0,
              tipStaffName: frontendData.tipStaffName,
              paymentMode: frontendData.payments?.[0]?.type || 'Cash',
              payments: frontendData.payments || [{ type: 'Cash', amount: frontendData.total }],
              staffName: frontendData.staffName,
              status:
                typeof frontendData.status === "string"
                  ? frontendData.status
                  : frontendData.invoiceDeleted
                    ? "cancelled"
                    : "completed",
              invoiceDeleted: frontendData.invoiceDeleted === true,
              // Include taxBreakdown for correct tax display
              taxBreakdown: frontendData.taxBreakdown,
              shareToken: frontendData.shareToken
            }
            
            console.log('🔍 Frontend receipt data:', receiptData)
            console.log('🔍 Frontend taxBreakdown:', receiptData.taxBreakdown)
            setReceipt(receiptData)
            console.log('✅ Receipt loaded from frontend data with correct taxBreakdown')
            return
          }
        } catch (frontendError) {
          console.error('❌ Frontend data parsing failed:', frontendError)
        }

        // Fallback: Try to fetch sale data from the API using bill number
        try {
          const response = await SalesAPI.getByBillNo(billNo)
          if (response.success && response.data) {
            console.log('✅ Sale data found from API:', response.data)
            
            // Transform sale data to receipt format
            const saleData = response.data
            console.log('🔍 Raw sale data from API:', saleData)
            console.log('🔍 Sale payments array:', saleData.payments)
            console.log('🔍 Sale payment mode:', saleData.paymentMode)
            
            const receiptData: ReceiptData = {
              id: saleData._id || saleData.id,
              billNo: saleData.billNo,
              customerName: saleData.customerName,
              customerPhone: saleData.customerPhone || 'N/A',
              date: saleData.date,
              time: new Date(saleData.date).toLocaleTimeString(),
              items: (saleData.items || []).map((item: any) => ({
                name: item.name,
                type: item.type,
                quantity: item.quantity,
                price: item.price,
                total: item.total,
                discount: item.discount ?? 0,
                discountType: item.discountType || 'percentage',
                staffName: item.staffName || saleData.staffName,
                staffContributions: item.staffContributions,
                hsnSacCode: item.hsnSacCode || '',
                taxAmount: item.taxAmount,
                priceExcludingGST: item.priceExcludingGST,
                taxRate: item.taxRate
              })),
              netTotal: saleData.netTotal,
              taxAmount: saleData.taxAmount,
              grossTotal: saleData.grossTotal,
              subtotalExcludingTax: (saleData.items || []).reduce((sum: number, item: any) => {
                const base = item.priceExcludingGST != null ? item.priceExcludingGST * (item.quantity || 1) : (item.total || 0) - (item.taxAmount || 0)
                return sum + base
              }, 0) || (saleData.grossTotal - saleData.taxAmount),
              tip: saleData.tip || 0,
              tipStaffName: saleData.tipStaffName,
              paymentMode: saleData.paymentMode,
              payments: saleData.payments?.length > 0 ? saleData.payments.map((payment: any) => {
                // Handle both 'mode' field (from Sale model) and 'type' field (from receipt)
                const paymentType = payment.mode || payment.type
                console.log('🔍 Processing payment:', { payment, paymentType, mode: payment.mode, type: payment.type })
                return {
                  type: paymentType?.toLowerCase() || 'unknown',
                  amount: payment.amount || 0
                }
              }) : [{ type: (saleData.paymentMode?.toLowerCase() || 'unknown'), amount: saleData.grossTotal }],
              staffName: saleData.staffName,
              status: typeof saleData.status === "string" ? saleData.status : saleData.invoiceDeleted ? "cancelled" : "completed",
              invoiceDeleted: saleData.invoiceDeleted === true,
              taxBreakdown: saleData.taxBreakdown ? {
                serviceTax: saleData.taxBreakdown.serviceTax ?? 0,
                serviceRate: saleData.taxBreakdown.serviceRate ?? 5,
                productTaxByRate: saleData.taxBreakdown.productTaxByRate || {}
              } : undefined,
              shareToken: saleData.shareToken
            }
            
            console.log('🔍 Final receipt data from API:', receiptData)
            console.log('🔍 Payments array:', receiptData.payments)
            setReceipt(receiptData)
          } else {
            console.log('❌ Sale not found for bill number:', billNo)
            setError('Receipt not found')
          }
        } catch (apiError) {
          console.error('❌ API error:', apiError)
          setError('Failed to load receipt data')
        }
      } catch (err) {
        console.error('Error loading receipt:', err)
        setError('Failed to load receipt')
      } finally {
        setIsLoading(false)
      }
    }

    loadReceipt()
  }, [params.billNo])

  // Past deleted invoices: old ?data= URLs lacked status flags; resolve via API (archived bill) and show Cancelled
  useEffect(() => {
    if (!searchParams.get("data")) return
    const billNo = params.billNo as string
    if (!billNo || !receipt) return
    if (receipt.invoiceDeleted || String(receipt.status).toLowerCase() === "cancelled") return

    let unmounted = false
    const id = setTimeout(() => {
      SalesAPI.getByBillNo(billNo)
        .then((res) => {
          if (unmounted || !res?.success || !res.data) return
          const d = res.data as { invoiceDeleted?: boolean; status?: string }
          if (d.invoiceDeleted || String(d.status).toLowerCase() === "cancelled") {
            setReceipt((prev) => (prev ? { ...prev, status: "cancelled", invoiceDeleted: true } : null))
          }
        })
        .catch(() => {})
    }, 0)
    return () => {
      unmounted = true
      clearTimeout(id)
    }
  }, [receipt, params.billNo, searchParams])

  const handlePrint = () => {
    window.print()
  }

  const handleShareWhatsApp = () => {
    const phone = receipt?.customerPhone || (receipt as any)?.clientPhone || ''
    const digitsOnly = phone.replace(/\D/g, '')
    let waPhone = digitsOnly
    if (digitsOnly.length === 10) {
      waPhone = '91' + digitsOnly
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      waPhone = '91' + digitsOnly.slice(1)
    } else if (digitsOnly.length >= 10) {
      waPhone = digitsOnly.startsWith('91') ? digitsOnly : '91' + digitsOnly.slice(-10)
    }
    if (!waPhone || waPhone.length < 10) {
      toast({
        title: "No phone number",
        description: "Customer phone number is not available for this receipt.",
        variant: "destructive",
      })
      return
    }
    let baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    if (baseUrl.startsWith('https://localhost') || baseUrl.startsWith('https://127.0.0.1')) {
      baseUrl = baseUrl.replace('https://', 'http://')
    }
    const publicUrl = receipt?.shareToken
      ? `${baseUrl}/receipt/public/${receipt.billNo}/${receipt.shareToken}`
      : (typeof window !== 'undefined' ? window.location.href : '')
    const clientName = receipt?.customerName || (receipt as any)?.clientName || 'Customer'
    const totalAmount = receipt?.grossTotal ?? receipt?.netTotal ?? 0
    const message = `Hi ${clientName},

Your invoice ${receipt?.billNo || ''} is ready.
Total: ₹${totalAmount}

View here:
${publicUrl}`
    const whatsappUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
  }

  const handleThermalPrint = () => {
    if (!receipt || !businessSettings) return
    
    // Convert receipt data to the format expected by ThermalReceiptGenerator
      const receiptForThermal = {
      id: receipt.id,
      receiptNumber: receipt.billNo,
      clientId: receipt.id,
      clientName: receipt.customerName,
      clientPhone: receipt.customerPhone,
      date: receipt.date,
      time: receipt.time,
      subtotalExcludingTax: (receipt as any).subtotalExcludingTax,
      items: receipt.items.map(item => ({
        id: Math.random().toString(),
        name: item.name,
        type: item.type as "service" | "product",
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        discount: item.discount ?? 0,
        discountType: (item.discountType || "percentage") as "percentage" | "fixed",
        staffId: "",
        staffName: item.staffName || "",
        staffContributions: item.staffContributions,
        hsnSacCode: (item as any).hsnSacCode || "",
        taxAmount: (item as any).taxAmount,
        priceExcludingGST: (item as any).priceExcludingGST,
        taxRate: (item as any).taxRate
      })),
      subtotal: receipt.netTotal,
      tip: receipt.tip || 0,
      tipStaffName: receipt.tipStaffName,
      status: receipt.status,
      invoiceDeleted: receipt.invoiceDeleted,
      discount: 0,
      tax: receipt.taxAmount,
      roundOff: 0,
      total: receipt.grossTotal + (receipt.tip || 0),
      payments: receipt.payments.map(payment => ({
        type: payment.type as "cash" | "card" | "online",
        amount: payment.amount
      })),
      staffId: "",
      staffName: receipt.staffName,
      notes: ""
    }

    const { printThermalReceipt } = ThermalReceiptGenerator({ 
      receipt: receiptForThermal,
      businessSettings 
    })
    
    printThermalReceipt()
  }

  const pageContent = isLoading ? (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Loading receipt...</p>
      </div>
    </div>
  ) : error || !receipt ? (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">❌</span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Receipt Not Found</h1>
        <p className="text-gray-600 mb-6">{error || 'The requested receipt could not be found.'}</p>
        <Link href="/reports">
          <Button variant="outline" className="mr-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Reports
          </Button>
        </Link>
      </div>
    </div>
  ) : (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header with Actions */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm p-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Receipt #{receipt.billNo}</h1>
            <p className="text-gray-600">
              {receipt.customerName} • {new Date(receipt.date).toLocaleDateString()} • {receipt.time}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={(() => {
                const raw = searchParams.get("returnTo")
                if (!raw) return "/quick-sale"
                try {
                  const decoded = decodeURIComponent(raw)
                  if (decoded.startsWith("/")) return decoded
                } catch {
                  /* ignore */
                }
                return raw.startsWith("/") ? raw : `/${raw}`
              })()}
            >
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <Button onClick={handlePrint} variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button onClick={handleThermalPrint} variant="outline" className="bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100">
              <Thermometer className="h-4 w-4 mr-2" />
              Thermal Print
            </Button>
            <Button onClick={handleShareWhatsApp} variant="outline" className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100">
              <MessageCircle className="h-4 w-4 mr-2" />
              Share via WhatsApp
            </Button>
          </div>
        </div>
      </div>

      {/* Receipt Content */}
      <div className="max-w-4xl mx-auto">
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
              items: receipt.items?.map(item => ({
                id: item.name,
                name: item.name,
                type: item.type as "service" | "product",
                price: item.price,
                quantity: item.quantity,
                discount: item.discount ?? 0,
                discountType: (item.discountType || 'percentage') as "percentage" | "fixed",
                staffId: receipt.id,
                staffName: item.staffName || receipt.staffName,
                staffContributions: item.staffContributions,
                total: item.total,
                hsnSacCode: (item as any).hsnSacCode || '',
                taxAmount: (item as any).taxAmount,
                priceExcludingGST: (item as any).priceExcludingGST,
                taxRate: (item as any).taxRate
              })) || [],
              subtotal: receipt.netTotal,
              subtotalExcludingTax: (receipt as any).subtotalExcludingTax,
              tip: receipt.tip || 0,
              tipStaffName: receipt.tipStaffName,
              discount: 0,
              tax: receipt.taxAmount,
              total: receipt.grossTotal + (receipt.tip || 0),
              payments: receipt.payments?.map(payment => ({
                type: (payment?.type || 'unknown') as "cash" | "card" | "online",
                amount: payment?.amount || 0
              })) || [],
              staffId: receipt.id,
              staffName: receipt.staffName,
              notes: '',
              taxBreakdown: receipt.taxBreakdown,
              status: receipt.status,
              invoiceDeleted: receipt.invoiceDeleted,
            }} 
            businessSettings={businessSettings} 
          />
        </div>
      </div>

      {/* Print-only styles */}
      <style jsx global>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )

  return (
    <ProtectedRoute requiredModule="sales">
      <ProtectedLayout requiredModule="sales">
        {pageContent}
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
