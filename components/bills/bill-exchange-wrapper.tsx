"use client"

import { useEffect, useState, useMemo } from "react"
import { ProductExchangeDialog, ExchangeDialogItem } from "./product-exchange-dialog"
import { SalesAPI, SettingsAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { createTaxCalculator, BillItem as TaxBillItem } from "@/lib/tax-calculator"

interface BillExchangeWrapperProps {
  isOpen: boolean
  onClose: () => void
  billNo: string
  saleId: string
  onExchangeComplete: () => void
}

export function BillExchangeWrapper({
  isOpen,
  onClose,
  billNo,
  saleId,
  onExchangeComplete,
}: BillExchangeWrapperProps) {
  const { toast } = useToast()
  const [billItems, setBillItems] = useState<ExchangeDialogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [taxSettings, setTaxSettings] = useState<any>(null)
  const [originalBillData, setOriginalBillData] = useState<any>(null)

  // Determine if tax was applied in the original bill
  const originalBillHadTax = originalBillData ? (originalBillData.taxAmount > 0) : false

  const taxCalculator = useMemo(() => {
    const settings = taxSettings?.settings?.taxSettings || {}
    return createTaxCalculator({
      ...settings,
      enableTax: originalBillHadTax, // Respect original bill's tax status
    })
  }, [taxSettings, originalBillHadTax])

  useEffect(() => {
    if (isOpen && saleId && saleId.trim() !== '') {
      loadBillData()
      loadTaxSettings()
    } else if (isOpen && (!saleId || saleId.trim() === '')) {
      console.error("BillExchangeWrapper: saleId is missing or empty", { saleId, billNo })
      toast({
        title: "Error",
        description: "Cannot load bill: Sale ID is missing.",
        variant: "destructive",
      })
      onClose()
    }
  }, [isOpen, saleId, billNo, onClose, toast])

  const loadTaxSettings = async () => {
    try {
      const response = await SettingsAPI.getBusinessSettings()
      if (response.success) {
        setTaxSettings(response.data)
      }
    } catch (error) {
      console.error("Failed to load tax settings:", error)
    }
  }

  const loadBillData = async () => {
    setLoading(true)
    try {
      const response = await SalesAPI.getByBillNo(billNo)
      if (response.success && response.data) {
        const sale = response.data
        setOriginalBillData(sale) // Store original bill data to check tax status
        const items: ExchangeDialogItem[] = (sale.items || []).map((item: any) => ({
          id: item._id || item.id,
          productId: item.productId,
          name: item.name,
          type: item.type || 'product',
          quantity: Number(item.quantity || 0),
          price: Number(item.price || 0),
          total: Number(item.total || item.price * item.quantity || 0),
          taxCategory: item.taxCategory,
        }))
        setBillItems(items)
      } else {
        toast({
          title: "Error",
          description: "Failed to load bill data for exchange.",
          variant: "destructive",
        })
        onClose()
      }
    } catch (error: any) {
      console.error("Failed to load bill:", error)
      toast({
        title: "Error",
        description: error?.message || "Failed to load bill data.",
        variant: "destructive",
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (data: {
    updatedItems: ExchangeDialogItem[]
    editReason: string
    notes?: string
  }) => {
    if (!saleId || saleId.trim() === '') {
      toast({
        title: "Error",
        description: "Sale ID is missing. Cannot process exchange.",
        variant: "destructive",
      })
      return
    }

    try {
      // Calculate taxes using tax calculator
      const billItemsForTax: TaxBillItem[] = data.updatedItems.map((item, index) => ({
        id: item.productId || item.id || `${index}`,
        name: item.name,
        type: item.type,
        price: item.price,
        quantity: item.quantity,
        taxCategory: item.taxCategory,
      }))

      const { summary } = taxCalculator.calculateBillTax(billItemsForTax)
      const netTotal = summary.totalBaseAmount
      const taxAmount = summary.totalTaxAmount
      const grossTotal = summary.totalAmount

      const payload = {
        items: data.updatedItems.map(item => ({
          productId: item.productId,
          name: item.name,
          type: item.type,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
          taxCategory: item.taxCategory,
        })),
        netTotal,
        taxAmount,
        grossTotal,
        editReason: data.editReason,
        notes: data.notes,
      }

      console.log("Calling exchangeProducts with:", { saleId, billNo, itemsCount: payload.items.length })
      const response = await SalesAPI.exchangeProducts(saleId, payload)
      
      if (response.success) {
        toast({
          title: "Exchange Successful",
          description: "Products have been exchanged successfully.",
        })
        onExchangeComplete()
      } else {
        throw new Error(response.error || "Exchange failed")
      }
    } catch (error: any) {
      console.error("Exchange error:", error)
      toast({
        title: "Exchange Failed",
        description: error?.message || "Failed to process exchange. Please try again.",
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return null // Dialog will show loading state
  }

  return (
    <ProductExchangeDialog
      open={isOpen}
      onOpenChange={onClose}
      billItems={billItems}
      enableTax={originalBillHadTax} // Pass tax status to dialog
      onConfirm={handleConfirm}
    />
  )
}

