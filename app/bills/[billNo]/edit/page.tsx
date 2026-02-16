"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { SalesAPI } from "@/lib/api"
import { createTaxCalculator, BillItem as TaxBillItem } from "@/lib/tax-calculator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft, Save, AlertTriangle, Info } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface SaleItem {
  _id?: string
  productId?: string // Important: needed for products to track inventory
  name: string
  type: "service" | "product"
  quantity: number
  price: number
  total: number
  taxCategory?: string
}

interface SaleData {
  _id: string
  billNo: string
  customerName: string
  customerPhone?: string
  date: string
  items: SaleItem[]
  netTotal: number
  taxAmount: number
  grossTotal: number
  discount: number
  discountType: "percentage" | "fixed"
  notes?: string
  paymentStatus?: {
    totalAmount: number
    paidAmount: number
    remainingAmount: number
    dueDate?: string
  }
  status: string
}

export default function EditBillPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()

  const [sale, setSale] = useState<SaleData | null>(null)
  const [items, setItems] = useState<SaleItem[]>([])
  const [discount, setDiscount] = useState<number>(0)
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage")
  const [notes, setNotes] = useState<string>("")
  const [editReason, setEditReason] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])

  const billNo = params.billNo as string

  useEffect(() => {
    const loadSale = async () => {
      if (!billNo) return
      setLoading(true)
      try {
        const response = await SalesAPI.getByBillNo(billNo)
        if (!response.success || !response.data) {
          toast({
            title: "Bill not found",
            description: "The requested bill could not be found.",
            variant: "destructive",
          })
          router.push("/reports")
          return
        }

        const data = response.data as SaleData
        setSale(data)
        // Preserve productId from original items
        const itemsWithProductId = (data.items || []).map((item: any) => ({
          ...item,
          productId: item.productId || undefined, // Preserve productId if it exists
        }))
        setItems(itemsWithProductId)
        setDiscount(data.discount || 0)
        setDiscountType(data.discountType || "percentage")
        setNotes(data.notes || "")

        // Check for validation warnings
        const warnings: string[] = []
        const billDate = new Date(data.date)
        const daysSinceBill = Math.floor((new Date().getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSinceBill > 90) {
          warnings.push(`This bill is ${daysSinceBill} days old. Editing bills older than 90 days may require administrator approval.`)
        }
        if (data.paymentStatus?.paidAmount >= data.paymentStatus?.totalAmount) {
          warnings.push("This bill is fully paid. Editing may require refund processing.")
        }
        setValidationWarnings(warnings)
      } catch (error) {
        console.error("Failed to load bill:", error)
        toast({
          title: "Error",
          description: "Failed to load bill details. Please try again.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    loadSale()
  }, [billNo, router, toast])

  // Determine if tax was applied in the original bill
  // If original taxAmount is 0, tax was not applied, so don't calculate tax during edit
  const originalBillHadTax = sale ? (sale.taxAmount > 0) : false

  const taxCalculator = useMemo(
    () =>
      createTaxCalculator({
        enableTax: originalBillHadTax,
      }),
    [originalBillHadTax],
  )

  const { netTotal, taxAmount, grossTotal } = useMemo(() => {
    const billItems: TaxBillItem[] = items.map((item, index) => ({
      id: item._id || `${index}`,
      name: item.name,
      type: item.type,
      price: item.price,
      quantity: item.quantity,
      taxCategory: item.taxCategory,
    }))

    const { summary } = taxCalculator.calculateBillTax(billItems)
    let calculatedNet = summary.totalBaseAmount
    const calculatedTax = summary.totalTaxAmount

    let discountValue = 0
    if (discountType === "percentage") {
      discountValue = (calculatedNet * (discount || 0)) / 100
    } else {
      discountValue = discount || 0
    }

    if (discountValue > calculatedNet) {
      discountValue = calculatedNet
    }

    calculatedNet = calculatedNet - discountValue
    const total = calculatedNet + calculatedTax

    return {
      netTotal: Math.round(calculatedNet * 100) / 100,
      taxAmount: Math.round(calculatedTax * 100) / 100,
      grossTotal: Math.round(total * 100) / 100,
    }
  }, [items, discount, discountType, taxCalculator])

  const handleItemChange = (index: number, field: "quantity" | "price", value: number) => {
    setItems((prev) => {
      const next = [...prev]
      const item = { ...next[index] }
      if (field === "quantity") {
        item.quantity = value > 0 ? value : 0
      } else {
        item.price = value >= 0 ? value : 0
      }
      item.total = item.price * item.quantity
      next[index] = item
      return next
    })
  }

  const handleSave = async () => {
    if (!sale || !billNo) {
      console.error("Cannot save: sale or billNo is missing", { sale: !!sale, billNo })
      toast({
        title: "Error",
        description: "Bill data is not loaded. Please refresh the page.",
        variant: "destructive",
      })
      return
    }

    if (!editReason.trim()) {
      toast({
        title: "Edit reason required",
        description: "Please provide a reason for editing this bill.",
        variant: "destructive",
      })
      return
    }

    // Validate items
    if (!items || items.length === 0) {
      toast({
        title: "Validation Error",
        description: "Bill must have at least one item.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      // Ensure items have the correct structure for backend
      const formattedItems = items.map((item) => ({
        name: item.name,
        type: item.type,
        quantity: Number(item.quantity || 0),
        price: Number(item.price || 0),
        total: Number(item.total || item.price * item.quantity || 0),
        productId: (item as any).productId || undefined, // Include productId if it exists
        taxCategory: item.taxCategory || undefined,
      }))

      const payload: Partial<SaleData> & { editReason: string } = {
        items: formattedItems,
        netTotal: Number(netTotal.toFixed(2)),
        taxAmount: Number(taxAmount.toFixed(2)),
        grossTotal: Number(grossTotal.toFixed(2)),
        discount: Number(discount || 0),
        discountType,
        notes: notes || "",
        paymentStatus: {
          ...(sale.paymentStatus || {}),
          totalAmount: Number(grossTotal.toFixed(2)),
          remainingAmount: Math.max(Number(grossTotal.toFixed(2)) - Number(sale.paymentStatus?.paidAmount || 0), 0),
        },
        editReason: editReason.trim(),
      }

      console.log("Saving bill with payload:", {
        saleId: sale._id,
        billNo,
        itemsCount: formattedItems.length,
        grossTotal: payload.grossTotal,
        editReason: payload.editReason,
      })

      const response = await SalesAPI.update(sale._id, payload)
      
      console.log("Save response:", response)

      if (!response.success) {
        throw new Error(response.error || "Failed to save bill")
      }

      toast({
        title: "Bill updated",
        description: "The bill has been updated successfully.",
      })

      // Small delay to show the success message
      setTimeout(() => {
        router.push(`/receipt/${billNo}`)
      }, 500)
    } catch (error: any) {
      console.error("Failed to save bill:", error)
      const errorMessage = error?.response?.data?.error || error?.message || "Failed to save bill. Please try again."
      toast({
        title: "Save failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !sale) {
    return (
      <ProtectedRoute requiredModule="sales">
        <ProtectedLayout requiredModule="sales">
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading bill details...</p>
            </div>
          </div>
        </ProtectedLayout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute requiredModule="sales">
      <ProtectedLayout requiredModule="sales">
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Bill #{sale.billNo}</h1>
            <p className="text-gray-600">
              {sale.customerName} • {new Date(sale.date).toLocaleDateString()} • Status: {sale.status}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.back()} disabled={saving}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button 
              onClick={(e) => {
                e.preventDefault()
                console.log("Save button clicked", { sale: !!sale, billNo, itemsCount: items.length, editReason: editReason.trim() })
                handleSave()
              }} 
              disabled={saving || !sale}
            >
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {validationWarnings.length > 0 && (
          <Alert variant="default" className="border-yellow-200 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-800">Warning</AlertTitle>
            <AlertDescription className="text-yellow-700">
              <ul className="list-disc list-inside space-y-1">
                {validationWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Bill Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 border-b border-slate-200">
                    <TableHead className="w-1/3">Item</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-24">Quantity</TableHead>
                    <TableHead className="w-28">Price</TableHead>
                    <TableHead className="w-28 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={item._id || index}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="capitalize">{item.type}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, "quantity", Number(e.target.value))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={item.price}
                          onChange={(e) => handleItemChange(index, "price", Number(e.target.value))}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-500 py-4">
                        No items in this bill.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Discount & Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-32"
                />
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                >
                  <option value="percentage">%</option>
                  <option value="fixed">₹</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bill Notes</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes about this bill..."
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-red-700 mb-1">Edit Reason *</label>
                <Textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Why are you editing this bill? (Required for audit)"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Net Total (after discount)</span>
                <span className="font-medium">₹{netTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Tax Amount</span>
                <span className="font-medium">₹{taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold text-gray-900 border-t pt-2 mt-2">
                <span>Grand Total</span>
                <span>₹{grossTotal.toFixed(2)}</span>
              </div>
              {sale.paymentStatus && (
                <>
                  <div className="flex justify-between text-sm text-gray-600 mt-2">
                    <span>Already Paid</span>
                    <span className="font-medium">
                      ₹{Number(sale.paymentStatus.paidAmount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    {(() => {
                      const paidAmount = Number(sale.paymentStatus.paidAmount || 0)
                      const difference = grossTotal - paidAmount
                      
                      if (difference < 0) {
                        // Customer paid more than new total - refund needed
                        const refundAmount = Math.abs(difference)
                        return (
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-orange-700 font-medium">Refund Amount</span>
                              <span className="text-orange-700 font-bold">
                                ₹{refundAmount.toFixed(2)}
                              </span>
                            </div>
                            <p className="text-xs text-orange-600 italic">
                              Customer will receive a refund of ₹{refundAmount.toFixed(2)}
                            </p>
                          </div>
                        )
                      } else if (difference > 0) {
                        // Customer owes more
                        return (
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-blue-700 font-medium">Total Due</span>
                              <span className="text-blue-700 font-bold">
                                ₹{difference.toFixed(2)}
                              </span>
                            </div>
                            <p className="text-xs text-blue-600 italic">
                              Customer needs to pay ₹{difference.toFixed(2)} more
                            </p>
                          </div>
                        )
                      } else {
                        // Fully paid
                        return (
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-green-700 font-medium">Payment Status</span>
                              <span className="text-green-700 font-bold">Fully Paid</span>
                            </div>
                            <p className="text-xs text-green-600 italic">
                              No additional payment or refund required
                            </p>
                          </div>
                        )
                      }
                    })()}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}


