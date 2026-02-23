"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ReceiptPreview } from "@/components/receipts/receipt-preview"
import { Button } from "@/components/ui/button"
import { Printer, ArrowLeft, Thermometer } from "lucide-react"
import Link from "next/link"
import { SettingsAPI } from "@/lib/api"
import { SalesAPI } from "@/lib/api"
import { ThermalReceiptGenerator } from "@/components/receipts/thermal-receipt-generator"

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
    staffName?: string
  }>
  netTotal: number
  taxAmount: number
  grossTotal: number
  tip: number
  tipStaffName?: string
  paymentMode: string
  payments: Array<{
    type: string
    amount: number
  }>
  staffName: string
  status: string
  taxBreakdown?: {
    serviceTax: number
    serviceRate: number
    productTaxByRate: { [rate: string]: number }
  }
}

export default function ReceiptPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [businessSettings, setBusinessSettings] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
                staffName: item.staffName || frontendData.staffName
              })),
              netTotal: frontendData.subtotal,
              taxAmount: frontendData.tax,
              grossTotal: frontendData.total - (frontendData.tip || 0),
              tip: frontendData.tip || 0,
              tipStaffName: frontendData.tipStaffName,
              paymentMode: frontendData.payments?.[0]?.type || 'Cash',
              payments: frontendData.payments || [{ type: 'Cash', amount: frontendData.total }],
              staffName: frontendData.staffName,
              status: 'completed',
              // Include taxBreakdown for correct tax display
              taxBreakdown: frontendData.taxBreakdown
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
              items: saleData.items.map((item: any) => ({
                name: item.name,
                type: item.type,
                quantity: item.quantity,
                price: item.price,
                total: item.total,
                staffName: item.staffName || saleData.staffName
              })),
              netTotal: saleData.netTotal,
              taxAmount: saleData.taxAmount,
              grossTotal: saleData.grossTotal,
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
              status: saleData.status
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

  const handlePrint = () => {
    window.print()
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
      items: receipt.items.map(item => ({
        id: Math.random().toString(),
        name: item.name,
        type: item.type as "service" | "product",
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        discount: 0,
        discountType: "percentage" as const,
        staffId: "",
        staffName: item.staffName || ""
      })),
      subtotal: receipt.netTotal,
      tip: receipt.tip || 0,
      tipStaffName: receipt.tipStaffName,
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
            <Link href={(() => {
              const returnTo = searchParams.get('returnTo')
              if (!returnTo) return '/quick-sale'
              return returnTo.startsWith('/') ? returnTo : `/${returnTo}`
            })()}>
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
                discount: 0,
                discountType: 'percentage' as const,
                staffId: receipt.id,
                staffName: item.staffName || receipt.staffName,
                total: item.total
              })) || [],
              subtotal: receipt.netTotal,
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
              taxBreakdown: receipt.taxBreakdown
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
