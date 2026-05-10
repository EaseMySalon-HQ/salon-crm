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
import { PurchaseOrdersAPI, SuppliersAPI, ProductsAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Loader2, MessageCircle, Package, Search, Trash2 } from "lucide-react"
import { format } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  formatPurchaseOrderWhatsAppMessage,
  normalizePhoneForWhatsApp,
  openWhatsAppWebWithText,
} from "@/lib/whatsapp-share"

interface POFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedSupplierId?: string | null
  /** When set, form loads this draft PO for editing (Put). */
  editingPoId?: string | null
  onSaved?: () => void
}

export function POForm({ open, onOpenChange, preselectedSupplierId, editingPoId, onSaved }: POFormProps) {
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const [loadingPo, setLoadingPo] = React.useState(false)
  const [suppliers, setSuppliers] = React.useState<any[]>([])
  const [products, setProducts] = React.useState<any[]>([])
  const [supplierId, setSupplierId] = React.useState("")
  const [orderDate, setOrderDate] = React.useState(format(new Date(), "yyyy-MM-dd"))
  const [expectedDeliveryDate, setExpectedDeliveryDate] = React.useState("")
  const [items, setItems] = React.useState<{ productId: string; productName: string; quantity: number; unitCost: number; gstPercent: number }[]>([])
  const [notes, setNotes] = React.useState("")
  const [sharePromptOpen, setSharePromptOpen] = React.useState(false)
  const [pendingSharePo, setPendingSharePo] = React.useState<any | null>(null)
  const [productSearch, setProductSearch] = React.useState("")
  const [productSearchOpen, setProductSearchOpen] = React.useState(false)

  React.useEffect(() => {
    if (!open) return

    SuppliersAPI.getAll({ activeOnly: true }).then((r) => {
      if (r.success) setSuppliers(r.data || [])
    })
    ProductsAPI.getAll({ limit: 500 }).then((r) => {
      if (r.success) setProducts(Array.isArray(r.data) ? r.data : (r.data?.data || []))
    })

    if (editingPoId) {
      setLoadingPo(true)
      PurchaseOrdersAPI.getById(editingPoId)
        .then((r) => {
          if (!r.success || !r.data) {
            toast({ title: "Error", description: "Could not load purchase order", variant: "destructive" })
            onOpenChange(false)
            return
          }
          const po = r.data
          if (po.status !== "draft") {
            toast({ title: "Only draft orders can be edited", variant: "destructive" })
            onOpenChange(false)
            return
          }
          setSupplierId((po.supplierId?._id || po.supplierId)?.toString() || "")
          setOrderDate(po.orderDate ? format(new Date(po.orderDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"))
          setExpectedDeliveryDate(
            po.expectedDeliveryDate ? format(new Date(po.expectedDeliveryDate), "yyyy-MM-dd") : ""
          )
          setNotes(po.notes || "")
          setItems(
            (po.items || []).map((it: any) => ({
              productId: (it.productId?._id || it.productId)?.toString() || "",
              productName: it.productName || "",
              quantity: it.quantity ?? 1,
              unitCost: it.unitCost ?? 0,
              gstPercent: it.gstPercent ?? 0,
            }))
          )
        })
        .finally(() => setLoadingPo(false))
      return
    }

    setLoadingPo(false)
    setSupplierId(preselectedSupplierId || "")
    setOrderDate(format(new Date(), "yyyy-MM-dd"))
    setExpectedDeliveryDate("")
    setItems([])
    setNotes("")
  }, [open, editingPoId, preselectedSupplierId, toast, onOpenChange])

  React.useEffect(() => {
    if (preselectedSupplierId && open && !editingPoId) setSupplierId(preselectedSupplierId)
  }, [preselectedSupplierId, open, editingPoId])

  // Get selected supplier for category filtering
  const selectedSupplier = React.useMemo(() => suppliers.find((s) => s._id === supplierId), [suppliers, supplierId])

  const openShareForSavedPo = React.useCallback(
    (po: any) => {
      if (!po) return
      const supId = (po.supplierId?._id || po.supplierId)?.toString?.() || String(po.supplierId || "")
      const sup =
        suppliers.find((s) => s._id === supId)
      const intl = normalizePhoneForWhatsApp(String(sup?.whatsapp || sup?.phone || "").trim())
      if (!intl) return
      const orderDateLabel = po.orderDate ? format(new Date(po.orderDate), "dd MMM yyyy") : ""
      const exp = po.expectedDeliveryDate ? format(new Date(po.expectedDeliveryDate), "dd MMM yyyy") : undefined
      const lines = (po.items || []).map((it: any) => ({
        productName: it.productName || "Product",
        quantity: Number(it.quantity) || 0,
        unitCost: Number(it.unitCost) || 0,
        lineTotal: Number(it.total) || 0,
      }))
      const msg = formatPurchaseOrderWhatsAppMessage({
        supplierName: sup?.name || "",
        contactPerson: sup?.contactPerson,
        poNumber: po.poNumber,
        orderDateLabel,
        expectedDeliveryLabel: exp,
        notes: po.notes,
        lines,
        subtotal: Number(po.subtotal) || 0,
        gstAmount: Number(po.gstAmount) || 0,
        grandTotal: Number(po.grandTotal) || 0,
      })
      openWhatsAppWebWithText(intl, msg)
    },
    [suppliers]
  )
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
        unitCost: 0,
        gstPercent: 0,
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

  const canOfferWhatsAppShareForPo = React.useCallback(
    (po: any) => {
      const supId = (po?.supplierId?._id || po?.supplierId)?.toString?.() ?? String(po?.supplierId ?? "")
      const sup = suppliers.find((s) => s._id === supId)
      return !!normalizePhoneForWhatsApp(String(sup?.whatsapp || sup?.phone || "").trim())
    },
    [suppliers]
  )

  const prevSheetOpenRef = React.useRef(false)
  React.useEffect(() => {
    if (open && !prevSheetOpenRef.current) {
      setSharePromptOpen(false)
      setPendingSharePo(null)
    }
    prevSheetOpenRef.current = open
  }, [open])

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
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx]
      if (!it.productName?.trim()) {
        toast({
          title: "Product name required",
          description: `Line ${idx + 1}: enter or pick a product with a name.`,
          variant: "destructive",
        })
        return
      }
      if (!Number.isFinite(it.quantity) || it.quantity < 1) {
        toast({
          title: "Quantity required",
          description: `Line ${idx + 1}: quantity must be at least 1.`,
          variant: "destructive",
        })
        return
      }
      if (!it.productId) {
        toast({
          title: "Product required",
          description: `Line ${idx + 1}: choose a product from the list.`,
          variant: "destructive",
        })
        return
      }
    }
    try {
      setSaving(true)
      const payloadItems = items.map((i) => ({
        productId: i.productId,
        productName: i.productName.trim(),
        quantity: i.quantity,
        unitCost: 0,
        gstPercent: 0,
      }))

      if (editingPoId) {
        const res = await PurchaseOrdersAPI.update(editingPoId, {
          supplierId,
          orderDate,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          items: payloadItems,
          notes,
        })
        if (res.success) {
          const po = res.data
          toast({
            title: "Purchase order updated",
            description: po?.poNumber ? `${po.poNumber} saved.` : "Saved.",
          })
          onSaved?.()
          onOpenChange(false)
        } else {
          toast({ title: "Error", description: res.error || "Failed", variant: "destructive" })
        }
        return
      }

      const res = await PurchaseOrdersAPI.create({
        supplierId,
        orderDate,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        items: payloadItems,
        notes,
        status: "ordered",
      })
      if (res.success) {
        const po = res.data
        toast({
          title: "Purchase order created",
          description: po?.poNumber ? `${po.poNumber} submitted.` : "Submitted.",
        })
        onSaved?.()
        onOpenChange(false)
        if (po && canOfferWhatsAppShareForPo(po)) {
          setPendingSharePo(po)
          setSharePromptOpen(true)
        }
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
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editingPoId ? "Edit purchase order" : "New Purchase Order"}</SheetTitle>
        </SheetHeader>
        {loadingPo ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
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

          <div className="space-y-2">
              <Label>Expected Delivery Date</Label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
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
              <p className="text-xs text-muted-foreground">Product and quantity are required on each line.</p>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">Product *</th>
                      <th className="text-right p-2 w-20">Qty *</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2">
                            <div>
                              <div className="font-medium">{item.productName}</div>
                              <div className="text-xs text-muted-foreground">Available: {products.find((p) => p._id === item.productId)?.stock ?? 0}</div>
                            </div>
                          </td>
                          <td className="p-2 text-right">
                            <Input
                              type="number"
                              min={1}
                              className="w-16 h-8 text-right"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                            />
                          </td>
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
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
          </div>

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" disabled={saving || items.length === 0}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingPoId ? "Save changes" : "Create & Submit Order"}
            </Button>
          </SheetFooter>
        </form>
        )}
      </SheetContent>
      </Sheet>

      <Dialog
        open={sharePromptOpen}
        onOpenChange={(next) => {
          setSharePromptOpen(next)
          if (!next) setPendingSharePo(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share purchase order on WhatsApp?</DialogTitle>
            <DialogDescription>
              {pendingSharePo?.poNumber ? (
                <>
                  Send <span className="font-medium text-foreground">{pendingSharePo.poNumber}</span> to the supplier&apos;s
                  WhatsApp or phone number on file. Opens WhatsApp Web in your browser — use the tab where you&apos;re already
                  logged in, same idea as booking a demo.
                </>
              ) : (
                <>
                  Opens WhatsApp Web in your browser with a draft message. Use your logged-in WhatsApp Web session to send it
                  to the supplier&apos;s saved number.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSharePromptOpen(false)
                setPendingSharePo(null)
              }}
            >
              Not now
            </Button>
            <Button
              type="button"
              className="bg-green-600 text-white hover:bg-green-700"
              onClick={() => {
                if (pendingSharePo) openShareForSavedPo(pendingSharePo)
                setSharePromptOpen(false)
                setPendingSharePo(null)
              }}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Share via WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
