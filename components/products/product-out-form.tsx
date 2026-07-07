"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { ProductsAPI, InventoryAPI } from "@/lib/api"
import { X, Minus, Search, Plus, Trash2, Package, GripVertical } from "lucide-react"
import { useCurrency } from "@/hooks/use-currency"

interface ProductOutFormProps {
  onClose?: () => void
  onTransactionCreated?: () => void
}

interface ProductItem {
  id: string
  productId: string
  productName: string
  quantity: number
  stock: number
}

/** Radix Select portals to body at z-50 by default — must exceed the modal overlay (z-9999). */
const modalSelectContentClass = "!z-[10000]"

export function ProductOutForm({ onClose = () => {}, onTransactionCreated }: ProductOutFormProps) {
  const { toast } = useToast()
  const { formatAmount } = useCurrency()
  const [products, setProducts] = useState<any[]>([])
  const [productItems, setProductItems] = useState<ProductItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [productSearch, setProductSearch] = useState("")
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false)
  const productDropdownRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [modalSize, setModalSize] = useState({ width: '1400px', height: '800px' })
  const [formData, setFormData] = useState({
    transactionType: "service_usage",
    staffId: "",
    notes: ""
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Handle modal resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !modalRef.current) return

      const rect = modalRef.current.getBoundingClientRect()
      const newWidth = e.clientX - rect.left
      const newHeight = e.clientY - rect.top

      // Set minimum and maximum sizes
      const minWidth = 1200
      const maxWidth = window.innerWidth - 32
      const minHeight = 600
      const maxHeight = window.innerHeight - 32

      setModalSize({
        width: `${Math.min(Math.max(newWidth, minWidth), maxWidth)}px`,
        height: `${Math.min(Math.max(newHeight, minHeight), maxHeight)}px`
      })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = 'nwse-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  const fetchProducts = async () => {
    try {
      setLoadingProducts(true)
      const response = await ProductsAPI.getAll({ limit: 1000 }) // Fetch up to 1000 products
      if (response.success) {
        setProducts(response.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoadingProducts(false)
    }
  }

  // Filter products based on search
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(productSearch.toLowerCase())
  )

  // Add product to list
  const addProductToCart = (product: any) => {
    // Check if product already exists in cart
    const existingIndex = productItems.findIndex(item => item.productId === product._id)
    
    if (existingIndex >= 0) {
      // Update quantity if product already exists
      const updatedItems = [...productItems]
      updatedItems[existingIndex].quantity += 1
      setProductItems(updatedItems)
    } else {
      // Add new product
      const newItem: ProductItem = {
        id: Date.now().toString(),
        productId: product._id,
        productName: product.name,
        quantity: 1,
        stock: product.stock || 0
      }
      setProductItems([...productItems, newItem])
    }
    
    // Clear search and close dropdown
    setProductSearch("")
    setIsProductDropdownOpen(false)
  }

  // Remove product from list
  const removeProduct = (itemId: string) => {
    setProductItems(productItems.filter(item => item.id !== itemId))
  }

  // Update product quantity
  const updateProductQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return
    
    const updatedItems = productItems.map(item => {
      if (item.id === itemId) {
        return { ...item, quantity: newQuantity }
      }
      return item
    })
    setProductItems(updatedItems)
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (productItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one product to deduct",
        variant: "destructive"
      })
      return
    }

    if (!formData.transactionType || !formData.staffId) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields including Staff Name",
        variant: "destructive"
      })
      return
    }

    // Validate stock for all products
    for (const item of productItems) {
      const product = products.find(p => p._id === item.productId)
      if (!product) {
        toast({
          title: "Product Not Found",
          description: `Product ${item.productName} not found`,
          variant: "destructive"
        })
        return
      }

      if (product.stock < item.quantity) {
        toast({
          title: "Insufficient Stock",
          description: `${item.productName}: Only ${product.stock} units available`,
          variant: "destructive"
        })
        return
      }
    }

    try {
      setLoading(true)

      // Deduct all products
      const results = await Promise.all(
        productItems.map(async (item) => {
          const transactionData = {
            productId: item.productId,
            quantity: item.quantity,
            transactionType: formData.transactionType,
            reason: `Staff: ${formData.staffId}`,
            notes: formData.notes
          }
          return await InventoryAPI.deductProduct(transactionData)
        })
      )

      // Check if all succeeded
      const failedResults = results.filter(r => !r.success)
      if (failedResults.length > 0) {
        throw new Error(`Failed to deduct ${failedResults.length} product(s)`)
      }

      const totalItems = productItems.reduce((sum, item) => sum + item.quantity, 0)
      toast({
        title: "Success",
        description: `Successfully deducted ${totalItems} units from ${productItems.length} product(s)`,
      })
      
      // Reset form
      setProductItems([])
      setFormData({
        transactionType: "service_usage",
        staffId: "",
        notes: ""
      })
      
      onTransactionCreated?.()
      onClose()
    } catch (error: any) {
      console.error('Error deducting products:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to deduct products",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const getTransactionTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      'service_usage': 'Service Usage',
      'damage': 'Damage',
      'expiry': 'Expiry',
      'transfer': 'Transfer',
      'adjustment': 'Adjustment',
      'other': 'Other'
    }
    return labels[type] || type
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <Card 
        ref={modalRef}
        className="overflow-hidden flex flex-col shadow-2xl border-0 bg-white relative"
        style={{ 
          width: modalSize.width, 
          height: modalSize.height,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          minWidth: '1200px',
          minHeight: '600px'
        }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-5 px-8 pt-6 border-b bg-gradient-to-r from-red-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Minus className="h-5 w-5 text-red-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">Product Out</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 rounded-full hover:bg-gray-100">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0 bg-gray-50/50">
          <form onSubmit={handleSubmit} className="h-full flex flex-col">
            <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
              {/* Left Column - Product Search */}
              <div className="flex flex-col overflow-hidden bg-white border-r border-gray-200">
                <div className="px-8 py-6 border-b border-gray-200 bg-white">
                  <Label className="text-lg font-semibold text-gray-900">Search Products</Label>
                  <p className="text-sm text-gray-500 mt-1">Find and add products to deduct</p>
                </div>
                <div className="flex-1 overflow-y-auto px-8 py-6">
                  <div className="relative mb-6" ref={productDropdownRef}>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
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
                        className="pl-12 pr-12 h-14 text-base border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 shadow-sm"
                      />
                      {productSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setProductSearch("")
                            setIsProductDropdownOpen(false)
                          }}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                    {isProductDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 z-[9999] mt-3 bg-white border border-gray-200 rounded-xl shadow-xl max-h-96 overflow-auto">
                        {loadingProducts ? (
                          <div className="p-6 text-center text-sm text-gray-500">Loading products...</div>
                        ) : (
                          <>
                            {filteredProducts.length === 0 ? (
                              <div className="p-6 text-center text-sm text-gray-500">
                                {productSearch ? `No products found matching "${productSearch}"` : 'No products available'}
                              </div>
                            ) : (
                              filteredProducts.map((product) => (
                                <div
                                  key={product._id}
                                  className="p-4 hover:bg-red-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-all duration-150"
                                  onClick={() => addProductToCart(product)}
                                >
                                  <div className="font-semibold text-base text-gray-900">{product.name}</div>
                                  <div className="text-sm text-gray-600 mt-1.5 flex items-center gap-3">
                                    <span>Stock: <span className="font-medium">{product.stock}</span></span>
                                    <span className="text-gray-400">•</span>
                                    <span>{formatAmount(product.price || 0)}</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Selected Products & Details */}
              <div className="flex flex-col overflow-hidden bg-white">
                <div className="px-8 py-6 border-b border-gray-200 bg-white">
                  <Label className="text-lg font-semibold text-gray-900">
                    Selected Products {productItems.length > 0 && <span className="text-gray-500 font-normal">({productItems.length})</span>}
                  </Label>
                  <p className="text-sm text-gray-500 mt-1">Review and adjust quantities</p>
                </div>
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
                  {/* Selected Products List */}
                  {productItems.length > 0 ? (
                    <div className="space-y-3">
                      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                        {productItems.map((item) => {
                          const product = products.find(p => p._id === item.productId)
                          return (
                            <div key={item.id} className="p-5 bg-white hover:bg-gray-50 transition-all duration-150 border-b border-gray-100 last:border-b-0">
                              <div className="flex items-center justify-between gap-6">
                                <div className="flex-1 min-w-[200px] max-w-[60%]">
                                  <div className="font-semibold text-lg text-gray-900 mb-1.5 leading-tight break-words">{item.productName}</div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-600">Stock:</span>
                                    <span className="font-medium text-gray-900">{item.stock}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 border border-gray-200">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 w-9 p-0 hover:bg-gray-200 rounded-md flex-shrink-0"
                                      onClick={() => {
                                        if (item.quantity === 1) {
                                          removeProduct(item.id)
                                        } else {
                                          updateProductQuantity(item.id, item.quantity - 1)
                                        }
                                      }}
                                    >
                                      <Minus className="h-4 w-4" />
                                    </Button>
                                    <Input
                                      type="number"
                                      min="1"
                                      max={item.stock}
                                      value={item.quantity}
                                      onChange={(e) => {
                                        const newQty = parseInt(e.target.value) || 1
                                        if (newQty < 1) {
                                          removeProduct(item.id)
                                        } else {
                                          updateProductQuantity(item.id, Math.min(newQty, item.stock))
                                        }
                                      }}
                                      className="w-20 h-9 text-center text-base font-semibold border-0 bg-transparent focus-visible:ring-0 flex-shrink-0"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 w-9 p-0 hover:bg-gray-200 rounded-md flex-shrink-0"
                                      onClick={() => updateProductQuantity(item.id, Math.min(item.quantity + 1, item.stock))}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 w-9 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-md flex-shrink-0"
                                    onClick={() => removeProduct(item.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                      <div className="text-gray-400 mb-2">
                        <Package className="h-12 w-12 mx-auto" />
                      </div>
                      <p className="text-sm text-gray-500 font-medium">No products selected</p>
                      <p className="text-xs text-gray-400 mt-1">Search and add products from the left</p>
                    </div>
                  )}

                  {/* Transaction Details */}
                  <div className="space-y-5 pt-6 border-t border-gray-200">
                    <div className="space-y-2.5">
                      <Label htmlFor="transactionType" className="text-base font-semibold text-gray-900">Transaction Type *</Label>
                      <Select
                        value={formData.transactionType}
                        onValueChange={(value) => handleChange("transactionType", value)}
                        modal={false}
                      >
                        <SelectTrigger className="h-12 text-base border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 shadow-sm">
                          <SelectValue placeholder="Select transaction type" />
                        </SelectTrigger>
                        <SelectContent className={modalSelectContentClass}>
                          <SelectItem value="service_usage">Service Usage - Used in services</SelectItem>
                          <SelectItem value="damage">Damage - Product damaged</SelectItem>
                          <SelectItem value="expiry">Expiry - Product expired</SelectItem>
                          <SelectItem value="transfer">Transfer</SelectItem>
                          <SelectItem value="adjustment">Adjustment - Stock correction</SelectItem>
                          <SelectItem value="other">Other - Other reason</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2.5">
                      <Label htmlFor="staffName" className="text-base font-semibold text-gray-900">Staff Name *</Label>
                      <Input
                        id="staffName"
                        value={formData.staffId}
                        onChange={(e) => handleChange("staffId", e.target.value)}
                        placeholder="Enter staff name"
                        required
                        className="h-12 text-base border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 shadow-sm"
                      />
                    </div>

                    <div className="space-y-2.5">
                      <Label htmlFor="notes" className="text-base font-semibold text-gray-900">Notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => handleChange("notes", e.target.value)}
                        placeholder="Additional notes (optional)"
                        rows={4}
                        className="text-base min-h-[100px] border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 shadow-sm resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="px-8 py-5 border-t border-gray-200 flex justify-end gap-3 bg-white shadow-sm flex-shrink-0">
                  <Button type="button" variant="outline" onClick={onClose} className="h-12 px-8 text-base font-medium rounded-xl border-gray-300 hover:bg-gray-50 whitespace-nowrap">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading || productItems.length === 0} className="h-12 px-8 text-base font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                    {loading ? "Processing..." : `Deduct ${productItems.length} Product${productItems.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
        {/* Resize Handle */}
        <div
          onMouseDown={(e) => {
            e.preventDefault()
            setIsResizing(true)
          }}
          className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors group"
          style={{ 
            clipPath: 'polygon(100% 0, 0 100%, 100% 100%)'
          }}
        >
          <GripVertical className="h-4 w-4 text-gray-400 group-hover:text-gray-600 rotate-45 absolute bottom-0.5 right-0.5" />
        </div>
      </Card>
    </div>
  )
}
