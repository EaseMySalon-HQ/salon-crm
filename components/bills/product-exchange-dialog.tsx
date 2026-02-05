"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ProductsAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { createTaxCalculator, BillItem as TaxBillItem } from "@/lib/tax-calculator"

export interface ExchangeDialogItem {
  id?: string
  productId?: string
  name: string
  type: "service" | "product"
  quantity: number
  price: number
  total: number
  taxCategory?: string
}

interface ProductExchangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  billItems: ExchangeDialogItem[]
  enableTax?: boolean // Whether tax should be calculated (based on original bill's tax status)
  onPreviewChange?: (preview: {
    updatedItems: ExchangeDialogItem[]
    netTotal: number
    taxAmount: number
    grossTotal: number
  }) => void
  onConfirm: (data: {
    updatedItems: ExchangeDialogItem[]
    editReason: string
    notes?: string
  }) => void
}

interface ProductOption {
  _id: string
  name: string
  price: number
  stock?: number
  taxCategory?: string
}

export function ProductExchangeDialog({
  open,
  onOpenChange,
  billItems,
  enableTax = true, // Default to true for backward compatibility
  onPreviewChange,
  onConfirm,
}: ProductExchangeDialogProps) {
  const { toast } = useToast()
  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedBillItemIndex, setSelectedBillItemIndex] = useState<number | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [returnQuantity, setReturnQuantity] = useState<number>(1)
  const [exchangeQuantity, setExchangeQuantity] = useState<number>(1)
  const [editReason, setEditReason] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [loadingProducts, setLoadingProducts] = useState(false)

  const taxCalculator = useMemo(
    () =>
      createTaxCalculator({
        enableTax: enableTax, // Use the prop to respect original bill's tax status
      }),
    [enableTax],
  )

  useEffect(() => {
    if (open) {
      loadProducts()
      // Reset state when dialog opens
      setSelectedBillItemIndex(null)
      setSelectedProductId("")
      setReturnQuantity(1)
      setExchangeQuantity(1)
      setEditReason("")
      setNotes("")
    }
  }, [open])

  const loadProducts = async () => {
    try {
      setLoadingProducts(true)
      const response = await ProductsAPI.getAll({ limit: 1000 })
      if (response.success) {
        const data = (response.data || []) as ProductOption[]
        const sellable = data.filter((p) => (p as any).productType === "retail" || (p as any).productType === "both" || !(p as any).productType)
        setProducts(sellable)
      }
    } catch (error) {
      console.error("Failed to load products for exchange:", error)
      toast({
        title: "Error",
        description: "Failed to load products for exchange. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoadingProducts(false)
    }
  }

  const selectedBillItem = selectedBillItemIndex != null ? billItems[selectedBillItemIndex] : null
  const selectedProduct = products.find((p) => p._id === selectedProductId) || null

  const preview = useMemo(() => {
    if (!selectedBillItem || !selectedProduct) {
      const original = calculateTotals(billItems, taxCalculator)
      return { updatedItems: billItems, ...original }
    }

    const updatedItems: ExchangeDialogItem[] = billItems.map((item, index) => {
      if (index !== selectedBillItemIndex) return item

      const remainingQty = Math.max(item.quantity - returnQuantity, 0)
      const baseItem: ExchangeDialogItem = { ...item }
      baseItem.quantity = remainingQty
      baseItem.total = baseItem.price * baseItem.quantity
      return baseItem
    })

    if (exchangeQuantity > 0) {
      updatedItems.push({
        id: undefined,
        productId: selectedProduct._id,
        name: selectedProduct.name,
        type: "product",
        quantity: exchangeQuantity,
        price: selectedProduct.price || 0,
        total: (selectedProduct.price || 0) * exchangeQuantity,
        taxCategory: selectedProduct.taxCategory,
      })
    }

    const totals = calculateTotals(updatedItems, taxCalculator)
    return {
      updatedItems,
      ...totals,
    }
  }, [billItems, selectedBillItem, selectedProduct, selectedBillItemIndex, returnQuantity, exchangeQuantity, taxCalculator])

  useEffect(() => {
    if (onPreviewChange) {
      onPreviewChange({
        updatedItems: preview.updatedItems,
        netTotal: preview.netTotal,
        taxAmount: preview.taxAmount,
        grossTotal: preview.grossTotal,
      })
    }
  }, [preview, onPreviewChange])

  const handleConfirm = () => {
    if (!selectedBillItem || !selectedProduct) {
      toast({
        title: "Incomplete selection",
        description: "Please select a bill item and a product to exchange with.",
        variant: "destructive",
      })
      return
    }

    if (!editReason.trim()) {
      toast({
        title: "Edit reason required",
        description: "Please provide a reason for this exchange.",
        variant: "destructive",
      })
      return
    }

    if (returnQuantity <= 0 || exchangeQuantity <= 0) {
      toast({
        title: "Invalid quantities",
        description: "Return and exchange quantities must be greater than zero.",
        variant: "destructive",
      })
      return
    }

    if (selectedBillItem.quantity < returnQuantity) {
      toast({
        title: "Invalid return quantity",
        description: `You cannot return more than ${selectedBillItem.quantity} units.`,
        variant: "destructive",
      })
      return
    }

    // Validate stock availability for exchange product
    if (selectedProduct.stock != null && selectedProduct.stock < exchangeQuantity) {
      toast({
        title: "Insufficient stock",
        description: `Only ${selectedProduct.stock} units available for ${selectedProduct.name}. Please reduce the exchange quantity.`,
        variant: "destructive",
      })
      return
    }

    onConfirm({
      updatedItems: preview.updatedItems,
      editReason,
      notes,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Exchange Product on Bill</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          <div className="space-y-4">
            <div>
              <Label className="mb-1 block text-sm font-medium">Select Billed Product to Return</Label>
              <Select
                value={selectedBillItemIndex != null ? String(selectedBillItemIndex) : ""}
                onValueChange={(value) => {
                  const idx = Number(value)
                  setSelectedBillItemIndex(Number.isNaN(idx) ? null : idx)
                  setReturnQuantity(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose billed product" />
                </SelectTrigger>
                <SelectContent>
                  {billItems
                    .filter((item) => item.type === "product")
                    .map((item, index) => (
                      <SelectItem key={`${item.productId || item.id || item.name}-${index}`} value={String(index)}>
                        {item.name} • Qty {item.quantity} • ₹{item.total.toFixed(2)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBillItem && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Return Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  max={selectedBillItem.quantity}
                  value={returnQuantity}
                  onChange={(e) => setReturnQuantity(Math.max(1, Math.min(Number(e.target.value) || 1, selectedBillItem.quantity)))}
                />
                <p className="text-xs text-muted-foreground">
                  Original quantity: {selectedBillItem.quantity}. Remaining on bill after return:{" "}
                  {Math.max(selectedBillItem.quantity - returnQuantity, 0)}.
                </p>
              </div>
            )}

            <div>
              <Label className="mb-1 block text-sm font-medium">Select Replacement Product</Label>
              <Select
                disabled={loadingProducts}
                value={selectedProductId}
                onValueChange={(value) => {
                  setSelectedProductId(value)
                  setExchangeQuantity(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingProducts ? "Loading products..." : "Choose replacement product"} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product._id} value={product._id}>
                      {product.name} • ₹{(product.price || 0).toFixed(2)} {product.stock != null && `• Stock: ${product.stock}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProduct && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Exchange Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={exchangeQuantity}
                  onChange={(e) => setExchangeQuantity(Math.max(1, Number(e.target.value) || 1))}
                />
                {selectedProduct.stock != null && (
                  <p className="text-xs text-muted-foreground">Available stock: {selectedProduct.stock}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="border rounded-md p-3 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Net Total</span>
                <span>₹{preview.netTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-medium">Tax</span>
                <span>₹{preview.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t pt-2 mt-2">
                <span>Grand Total</span>
                <span>₹{preview.grossTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 border-b border-slate-200">
                    <TableHead>Item</TableHead>
                    <TableHead className="w-16 text-right">Qty</TableHead>
                    <TableHead className="w-24 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.updatedItems.map((item, idx) => (
                    <TableRow key={`${item.productId || item.id || item.name}-${idx}`}>
                      <TableCell className="truncate max-w-[140px]">{item.name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">₹{item.total.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {preview.updatedItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-3">
                        No items after exchange.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-red-700">Exchange Reason *</Label>
              <Textarea
                rows={2}
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Why is the customer exchanging this product?"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Internal Notes</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this exchange"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Apply Exchange</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function calculateTotals(items: ExchangeDialogItem[], taxCalculator: ReturnType<typeof createTaxCalculator>) {
  const billItems: TaxBillItem[] = items.map((item, index) => ({
    id: item.id || `${index}`,
    name: item.name,
    type: item.type,
    price: item.price,
    quantity: item.quantity,
    taxCategory: item.taxCategory,
  }))

  const { summary } = taxCalculator.calculateBillTax(billItems)
  return {
    netTotal: Math.round(summary.totalBaseAmount * 100) / 100,
    taxAmount: Math.round(summary.totalTaxAmount * 100) / 100,
    grossTotal: Math.round(summary.totalAmount * 100) / 100,
  }
}


