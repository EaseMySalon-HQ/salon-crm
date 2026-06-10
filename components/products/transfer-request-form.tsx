"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { useCurrency } from "@/hooks/use-currency"
import {
  InventoryTransfersAPI,
  ProductsAPI,
  type TransferEligibilityBranch,
} from "@/lib/api"
import { X, Minus, Search, Plus, Trash2, Package, GripVertical, ArrowRightLeft } from "lucide-react"

type StockHint = { peer: number | null; current: number | null }

function catalogKey(name: string, sku?: string) {
  const s = (sku || "").trim()
  if (s) return s.toLowerCase()
  return (name || "").toLowerCase().trim()
}

/** Radix Select portals to body at z-50 by default — must exceed the modal overlay (z-9999). */
const modalSelectContentClass = "!z-[10000]"

interface TransferLineItem {
  id: string
  productId: string
  productName: string
  sku: string
  key: string
  quantity: number
  stock: number
}

export type TransferFormPrefill = {
  productId?: string
  direction?: "request_in" | "send_out"
}

export function TransferRequestForm({
  open,
  onClose,
  branches,
  currentBranchId,
  prefill,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  branches: TransferEligibilityBranch[]
  currentBranchId: string
  prefill?: TransferFormPrefill
  onCreated?: () => void
}) {
  const { toast } = useToast()
  const { formatAmount } = useCurrency()
  const queryClient = useQueryClient()
  const [products, setProducts] = useState<any[]>([])
  const [lineItems, setLineItems] = useState<TransferLineItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [productSearch, setProductSearch] = useState("")
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false)
  const productDropdownRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const prefillAppliedRef = useRef(false)
  const [isResizing, setIsResizing] = useState(false)
  const [modalSize, setModalSize] = useState({ width: "1400px", height: "800px" })
  const [direction, setDirection] = useState<"request_in" | "send_out">("request_in")
  const [peerBranchId, setPeerBranchId] = useState("")
  const [notes, setNotes] = useState("")

  const peerBranches = branches.filter((b) => b.id !== currentBranchId)
  const fromBranchId = direction === "request_in" ? peerBranchId : currentBranchId
  const toBranchId = direction === "request_in" ? currentBranchId : peerBranchId

  useEffect(() => {
    if (!open) {
      prefillAppliedRef.current = false
      return
    }
    fetchProducts()
    setDirection(prefill?.direction ?? "request_in")
    setPeerBranchId("")
    setNotes("")
    setLineItems([])
    setProductSearch("")
  }, [open, prefill?.direction])

  useEffect(() => {
    if (!open || !prefill?.productId || products.length === 0 || prefillAppliedRef.current) return
    const product = products.find((p) => String(p._id || p.id) === prefill.productId)
    if (product) {
      prefillAppliedRef.current = true
      addProductToCart(product)
    }
  }, [open, prefill?.productId, products])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !modalRef.current) return
      const rect = modalRef.current.getBoundingClientRect()
      const newWidth = e.clientX - rect.left
      const newHeight = e.clientY - rect.top
      setModalSize({
        width: `${Math.min(Math.max(newWidth, 1200), window.innerWidth - 32)}px`,
        height: `${Math.min(Math.max(newHeight, 600), window.innerHeight - 32)}px`,
      })
    }
    const handleMouseUp = () => setIsResizing(false)
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "nwse-resize"
      document.body.style.userSelect = "none"
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isResizing])

  const fetchProducts = async () => {
    try {
      setLoadingProducts(true)
      const response = await ProductsAPI.getAll({ limit: 1000 })
      if (response.success) setProducts(response.data || [])
    } catch (error) {
      console.error("Failed to fetch products:", error)
    } finally {
      setLoadingProducts(false)
    }
  }

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(productSearch.toLowerCase())
  )

  const addProductToCart = (product: any) => {
    const pid = String(product._id || product.id)
    setLineItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.productId === pid)
      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = { ...updated[existingIndex], quantity: updated[existingIndex].quantity + 1 }
        return updated
      }
      return [
        ...prev,
        {
          id: Date.now().toString(),
          productId: pid,
          productName: product.name,
          sku: product.sku || "",
          key: catalogKey(product.name, product.sku),
          quantity: 1,
          stock: product.stock || 0,
        },
      ]
    })
    setProductSearch("")
    setIsProductDropdownOpen(false)
  }

  const removeLine = (id: string) => setLineItems((prev) => prev.filter((item) => item.id !== id))

  const updateQuantity = (id: string, qty: number) => {
    if (qty < 1) return
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity: qty } : item)))
  }

  const stockKeys = useMemo(
    () => lineItems.map((i) => i.key).sort().join(","),
    [lineItems]
  )

  const { data: stockHints } = useQuery({
    queryKey: ["inventory-transfers", "stock-hint-batch", stockKeys, peerBranchId, currentBranchId],
    queryFn: async () => {
      const map: Record<string, StockHint> = {}
      await Promise.all(
        lineItems.map(async (item) => {
          const res = await InventoryTransfersAPI.getProductStockAcrossBranches(item.key)
          if (res.success) {
            const peer = res.data.branches.find((b) => b.branchId === peerBranchId)
            const current = res.data.branches.find((b) => b.branchId === currentBranchId)
            map[item.key] = {
              peer: peer?.found ? peer.stock : null,
              current: current?.found ? current.stock : null,
            }
          }
        })
      )
      return map
    },
    enabled: open && !!peerBranchId && lineItems.length > 0,
    staleTime: 30_000,
  })

  const getMaxQty = (item: TransferLineItem) => {
    if (direction === "send_out") return item.stock
    const hint = stockHints?.[item.key]
    if (hint?.peer != null) return hint.peer
    return 9999
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lineItems.length === 0) {
      toast({ title: "Validation Error", description: "Add at least one product", variant: "destructive" })
      return
    }
    if (!peerBranchId) {
      toast({ title: "Validation Error", description: "Select a branch", variant: "destructive" })
      return
    }

    for (const item of lineItems) {
      const max = getMaxQty(item)
      if (item.quantity > max) {
        toast({
          title: "Insufficient stock",
          description: `${item.productName}: max ${max} available at source branch`,
          variant: "destructive",
        })
        return
      }
    }

    try {
      setLoading(true)
      const results = await Promise.all(
        lineItems.map((item) =>
          InventoryTransfersAPI.createTransfer({
            fromBranchId,
            toBranchId,
            productKey: item.key,
            productName: item.productName,
            sku: item.sku || undefined,
            quantity: item.quantity,
            notes: notes.trim() || undefined,
          })
        )
      )
      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        throw new Error(failed[0].error || `Failed to create ${failed.length} request(s)`)
      }
      toast({
        title: "Success",
        description: `Created ${lineItems.length} transfer request${lineItems.length !== 1 ? "s" : ""}`,
      })
      queryClient.invalidateQueries({ queryKey: ["inventory-transfers"] })
      onCreated?.()
      onClose()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create transfer requests",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  const peerBranchName = peerBranches.find((b) => String(b.id) === peerBranchId)?.name

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <Card
        ref={modalRef}
        className="relative flex flex-col overflow-hidden border-0 bg-white shadow-2xl"
        style={{
          width: modalSize.width,
          height: modalSize.height,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 32px)",
          minWidth: "1200px",
          minHeight: "600px",
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b bg-gradient-to-r from-indigo-50 to-violet-50 px-8 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2">
              <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-gray-900">Transfer Request</CardTitle>
              <p className="mt-0.5 text-sm text-gray-500">Move stock between branches</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 rounded-full hover:bg-gray-100">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden bg-gray-50/50 p-0">
          <form onSubmit={handleSubmit} className="flex h-full flex-col">
            <div className="grid flex-1 grid-cols-2 gap-0 overflow-hidden">
              {/* Left — product search */}
              <div className="flex flex-col overflow-hidden border-r border-gray-200 bg-white">
                <div className="border-b border-gray-200 bg-white px-8 py-6">
                  <Label className="text-lg font-semibold text-gray-900">Search Products</Label>
                  <p className="mt-1 text-sm text-gray-500">Find and add products to transfer</p>
                </div>
                <div className="flex-1 overflow-y-auto px-8 py-6">
                  <div className="relative mb-6" ref={productDropdownRef}>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
                      <Input
                        placeholder="Type to search products..."
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value)
                          setIsProductDropdownOpen(true)
                        }}
                        onFocus={(e) => {
                          e.target.select()
                          setIsProductDropdownOpen(true)
                        }}
                        className="h-14 rounded-xl border-gray-300 pl-12 pr-12 text-base shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                      />
                      {productSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setProductSearch("")
                            setIsProductDropdownOpen(false)
                          }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 transform text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                    {isProductDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full z-[9999] mt-3 max-h-96 overflow-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                        {loadingProducts ? (
                          <div className="p-6 text-center text-sm text-gray-500">Loading products...</div>
                        ) : filteredProducts.length === 0 ? (
                          <div className="p-6 text-center text-sm text-gray-500">No products found</div>
                        ) : (
                          filteredProducts.map((product) => (
                            <div
                              key={product._id || product.id}
                              className="cursor-pointer border-b border-gray-100 p-4 transition-all last:border-b-0 hover:bg-indigo-50"
                              onClick={() => addProductToCart(product)}
                            >
                              <div className="text-base font-semibold text-gray-900">{product.name}</div>
                              <div className="mt-1.5 flex items-center gap-3 text-sm text-gray-600">
                                <span>
                                  Stock: <span className="font-medium">{product.stock ?? 0}</span>
                                </span>
                                <span className="text-gray-400">•</span>
                                <span>{formatAmount(product.price || 0)}</span>
                                {product.sku && (
                                  <>
                                    <span className="text-gray-400">•</span>
                                    <span>{product.sku}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Products are matched across branches by SKU or normalized name. If the product
                    does not exist at the destination branch, it will be created automatically when
                    the transfer is approved.
                  </p>
                </div>
              </div>

              {/* Right — cart + transfer details */}
              <div className="flex flex-col overflow-hidden bg-white">
                <div className="border-b border-gray-200 bg-white px-8 py-6">
                  <Label className="text-lg font-semibold text-gray-900">
                    Transfer details{" "}
                    {lineItems.length > 0 && (
                      <span className="font-normal text-gray-500">({lineItems.length} products)</span>
                    )}
                  </Label>
                </div>
                <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="font-semibold">Direction</Label>
                      <Select
                        value={direction}
                        onValueChange={(v) => setDirection(v as "request_in" | "send_out")}
                      >
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className={modalSelectContentClass}>
                          <SelectItem value="request_in">Request stock in</SelectItem>
                          <SelectItem value="send_out">Send stock out</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-semibold">
                        {direction === "request_in" ? "From branch" : "To branch"}
                      </Label>
                      <Select
                        value={peerBranchId || undefined}
                        onValueChange={setPeerBranchId}
                      >
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent className={modalSelectContentClass}>
                          {peerBranches.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              {b.name}
                              {b.city ? ` · ${b.city}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {peerBranchId && (
                    <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                      {direction === "request_in"
                        ? `Requesting stock from ${peerBranchName} → your branch`
                        : `Sending stock from your branch → ${peerBranchName}`}
                    </p>
                  )}

                  {lineItems.length > 0 ? (
                    <div className="max-h-[280px] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                      {lineItems.map((item) => {
                        const maxQty = getMaxQty(item)
                        return (
                          <div key={item.id} className="border-b border-gray-100 p-4 last:border-b-0 hover:bg-gray-50">
                            <div className="flex items-center justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="break-words font-semibold text-gray-900">{item.productName}</div>
                                <div className="mt-1 text-sm text-gray-500">
                                  Here: {item.stock}
                                  {peerBranchId && direction === "request_in" && maxQty < 9999 && (
                                    <span> · Source branch: {maxQty}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() =>
                                      item.quantity === 1
                                        ? removeLine(item.id)
                                        : updateQuantity(item.id, item.quantity - 1)
                                    }
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={maxQty}
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const n = parseInt(e.target.value, 10) || 1
                                      updateQuantity(item.id, Math.min(Math.max(1, n), maxQty))
                                    }}
                                    className="h-8 w-16 border-0 bg-transparent text-center focus-visible:ring-0"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => updateQuantity(item.id, Math.min(item.quantity + 1, maxQty))}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                                  onClick={() => removeLine(item.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-12 text-center">
                      <Package className="mx-auto mb-2 h-12 w-12 text-gray-400" />
                      <p className="text-sm font-medium text-gray-500">No products selected</p>
                      <p className="mt-1 text-xs text-gray-400">Search and add products from the left</p>
                    </div>
                  )}

                  <div className="space-y-2 border-t border-gray-200 pt-4">
                    <Label htmlFor="transfer-notes">Notes (optional)</Label>
                    <Textarea
                      id="transfer-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Reason or instructions for the receiving branch"
                      rows={3}
                      className="resize-none rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-white px-8 py-5 shadow-sm">
                  <Button type="button" variant="outline" onClick={onClose} className="h-12 rounded-xl px-8">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || lineItems.length === 0 || !peerBranchId}
                    className="h-12 rounded-xl bg-indigo-600 px-8 hover:bg-indigo-700"
                  >
                    {loading
                      ? "Submitting…"
                      : `Submit ${lineItems.length} request${lineItems.length !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>

        <div
          onMouseDown={(e) => {
            e.preventDefault()
            setIsResizing(true)
          }}
          className="absolute bottom-0 right-0 flex h-6 w-6 cursor-nwse-resize items-center justify-center bg-gray-100 transition-colors hover:bg-gray-200"
          style={{ clipPath: "polygon(100% 0, 0 100%, 100% 100%)" }}
        >
          <GripVertical className="absolute bottom-0.5 right-0.5 h-4 w-4 rotate-45 text-gray-400" />
        </div>
      </Card>
    </div>
  )
}
