"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { PurchaseOrdersAPI, SuppliersAPI, ProductsAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Package, Search, Trash2 } from "lucide-react"
import { format } from "date-fns"

interface POFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedSupplierId?: string | null
  onSaved?: () => void
}

export function POForm({ open, onOpenChange, preselectedSupplierId, onSaved }: POFormProps) {
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const [suppliers, setSuppliers] = React.useState<any[]>([])
  const [products, setProducts] = React.useState<any[]>([])
  const [supplierId, setSupplierId] = React.useState("")
  const [orderDate, setOrderDate] = React.useState(format(new Date(), "yyyy-MM-dd"))
  const [expectedDeliveryDate, setExpectedDeliveryDate] = React.useState("")
  const [items, setItems] = React.useState<{ productId: string; productName: string; quantity: number; unitCost: number; gstPercent: number }[]>([])
  const [notes, setNotes] = React.useState("")
  const [productSearch, setProductSearch] = React.useState("")
  const [productSearchOpen, setProductSearchOpen] = React.useState(false)
  const [gstMode, setGstMode] = React.useState<"exclude" | "include">("exclude")

  React.useEffect(() => {
    if (open) {
      SuppliersAPI.getAll({ activeOnly: true }).then((r) => {
        if (r.success) setSuppliers(r.data || [])
      })
      ProductsAPI.getAll({ limit: 500 }).then((r) => {
        if (r.success) setProducts(Array.isArray(r.data) ? r.data : (r.data?.data || []))
      })
      setSupplierId(preselectedSupplierId || "")
      setOrderDate(format(new Date(), "yyyy-MM-dd"))
      setExpectedDeliveryDate("")
      setItems([])
      setNotes("")
    }
  }, [open, preselectedSupplierId])

  React.useEffect(() => {
    if (preselectedSupplierId && open) setSupplierId(preselectedSupplierId)
  }, [preselectedSupplierId, open])

  // Get selected supplier for category filtering
  const selectedSupplier = React.useMemo(() => suppliers.find((s) => s._id === supplierId), [suppliers, supplierId])
  const supplierCategories = React.useMemo(
    () => (Array.isArray(selectedSupplier?.categories) ? selectedSupplier.categories : selectedSupplier?.category ? [selectedSupplier.category] : []),
    [selectedSupplier]
  )

  // Filter products by supplier's categories, then by search
  const filteredProducts = React.useMemo(() => {
    let list = products
    if (supplierId && supplierCategories.length > 0) {
      const catSet = new Set(supplierCategories.map((c: string) => (c || "").trim().toLowerCase()))
      list = products.filter((p) => {
        const pCat = (p.category || "").trim().toLowerCase()
        if (!pCat) return false
        return catSet.has(pCat) || [...catSet].some((sc) => pCat === sc || pCat.includes(sc) || sc.includes(pCat))
      })
    }
    const q = productSearch.toLowerCase().trim()
    if (q) {
      list = list.filter((p) => p.name?.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q))
    }
    return list
  }, [products, supplierId, supplierCategories, productSearch])

  // Group by category (as in quick sale)
  const productsByCategory = React.useMemo(() => {
    const acc: Record<string, typeof filteredProducts> = {}
    for (const p of filteredProducts) {
      const cat = (p.category || "").trim() || "Uncategorized"
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(p)
    }
    return acc
  }, [filteredProducts])
  const productCategoryOrder = Object.keys(productsByCategory).sort((a, b) => a.localeCompare(b))

  React.useEffect(() => {
    if (!productSearchOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (target instanceof Element && target.closest("[data-po-product-search]")) return
      setProductSearchOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [productSearchOpen])

  const addItem = (product: any) => {
    if (items.some((i) => i.productId === product._id)) return
    setItems((prev) => [
      ...prev,
      {
        productId: product._id,
        productName: product.name,
        quantity: 1,
        unitCost: product.cost || product.price || 0,
        gstPercent: 18,
      },
    ])
    setProductSearch("")
    setProductSearchOpen(false)
  }

  const updateItem = (idx: number, field: string, value: number | string) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const { subtotal, gstAmount, grandTotal, lineTotal } = React.useMemo(() => {
    if (gstMode === "exclude") {
      const st = items.reduce((s, i) => s + i.quantity * i.unitCost, 0)
      const gst = items.reduce((s, i) => s + i.quantity * i.unitCost * (i.gstPercent / 100), 0)
      return {
        subtotal: st,
        gstAmount: gst,
        grandTotal: Math.round((st + gst) * 100) / 100,
        lineTotal: (i: (typeof items)[0]) => i.quantity * i.unitCost * (1 + i.gstPercent / 100),
      }
    }
    const st = items.reduce((s, i) => {
      const base = i.unitCost / (1 + i.gstPercent / 100)
      return s + i.quantity * base
    }, 0)
    const gst = items.reduce((s, i) => {
      const base = i.unitCost / (1 + i.gstPercent / 100)
      return s + i.quantity * (i.unitCost - base)
    }, 0)
    const gt = items.reduce((s, i) => s + i.quantity * i.unitCost, 0)
    return {
      subtotal: Math.round(st * 100) / 100,
      gstAmount: Math.round(gst * 100) / 100,
      grandTotal: Math.round(gt * 100) / 100,
      lineTotal: (i: (typeof items)[0]) => i.quantity * i.unitCost,
    }
  }, [items, gstMode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplierId) {
      toast({ title: "Error", description: "Select a supplier", variant: "destructive" })
      return
    }
    if (items.length === 0) {
      toast({ title: "Error", description: "Add at least one item", variant: "destructive" })
      return
    }
    try {
      setSaving(true)
      const res = await PurchaseOrdersAPI.create({
        supplierId,
        orderDate,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        items: items.map((i) => {
          const unitCost = gstMode === "include" ? i.unitCost / (1 + i.gstPercent / 100) : i.unitCost
          return {
            productId: i.productId,
            productName: i.productName,
            quantity: i.quantity,
            unitCost,
            gstPercent: i.gstPercent,
          }
        }),
        notes,
        status: "ordered",
      })
      if (res.success) {
        toast({ title: "Success", description: "Purchase order created" })
        onSaved?.()
        onOpenChange(false)
      } else {
        toast({ title: "Error", description: res.error || "Failed", variant: "destructive" })
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.error || "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Purchase Order</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Order Date</Label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Expected Delivery Date</Label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>GST</Label>
              <RadioGroup value={gstMode} onValueChange={(v: "exclude" | "include") => setGstMode(v)} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="exclude" id="gst-exclude" />
                  <Label htmlFor="gst-exclude" className="font-normal cursor-pointer">Exclude GST</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="include" id="gst-include" />
                  <Label htmlFor="gst-include" className="font-normal cursor-pointer">Include GST</Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {gstMode === "exclude" ? "Unit cost is before tax; GST will be added." : "Unit cost already includes GST."}
              </p>
            </div>
          </div>

          <div className="space-y-2" data-po-product-search>
            <Label>Add Products</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={supplierId ? "Search products..." : "Select supplier first"}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onFocus={() => supplierId && setProductSearchOpen(true)}
                className="pl-9"
                disabled={!supplierId}
              />
              {productSearchOpen && (
              <div className="absolute top-full left-0 right-0 z-[9999] mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                {!supplierId ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Select a supplier first to see products</div>
                ) : supplierCategories.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">This supplier has no categories. Add categories in Edit Supplier.</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {productSearch ? `No products found matching "${productSearch}"` : "No products in supplier categories"}
                  </div>
                ) : (
                  <div className="py-1">
                    {productCategoryOrder.map((category) => (
                      <div key={category} className="mb-2 last:mb-0">
                        <div className="px-3 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide bg-muted/50 border-b">
                          {category}
                        </div>
                        {productsByCategory[category].map((product) => (
                          <button
                            key={product._id}
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left text-sm transition-colors"
                            onClick={() => addItem(product)}
                          >
                            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="flex-1 min-w-0">
                              <span className="font-medium truncate block">{product.name}</span>
                              <span className="text-xs text-muted-foreground">Stock: {product.stock ?? 0}</span>
                            </span>
                            <span className="shrink-0">₹{((product.cost || product.price) || 0).toFixed(2)}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <Label>Items</Label>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">Product</th>
                      <th className="text-right p-2 w-20">Qty</th>
                      <th className="text-right p-2 w-24">Unit Cost {gstMode === "include" ? "(incl.)" : "(ex-GST)"}</th>
                      <th className="text-right p-2 w-20">GST %</th>
                      <th className="text-right p-2 w-24">Total</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2">{item.productName}</td>
                          <td className="p-2 text-right">
                            <Input
                              type="number"
                              min={1}
                              className="w-16 h-8 text-right"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                            />
                          </td>
                          <td className="p-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-20 h-8 text-right"
                              value={item.unitCost}
                              onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="p-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-16 h-8 text-right"
                              value={item.gstPercent}
                              onChange={(e) => updateItem(idx, "gstPercent", parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="p-2 text-right">₹{lineTotal(item).toFixed(2)}</td>
                          <td className="p-2">
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-4 text-sm mt-2">
                <span>Subtotal: ₹{subtotal.toFixed(2)}</span>
                <span>GST: ₹{gstAmount.toFixed(2)}</span>
                <span className="font-semibold">Grand Total: ₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
          </div>

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || items.length === 0}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create & Submit Order
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
