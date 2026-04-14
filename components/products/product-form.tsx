"use client"

import type React from "react"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { ProductsAPI } from "@/lib/api"
import { usePaymentSettingsQuery } from "@/lib/queries/payment-settings"
import { CategoryCombobox } from "./category-combobox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Search, CheckCircle, AlertCircle, HelpCircle } from "lucide-react"

interface TaxCategory {
  id: string
  name: string
  rate: number
  description?: string
}

interface ProductFormProps {
  onClose: () => void
  product?: any // For edit mode
  onProductUpdated?: () => void // Callback to refresh the products list
  onSwitchToEdit?: (product: any) => void // Callback to switch to edit mode
}

export function ProductForm({ onClose, product, onProductUpdated, onSwitchToEdit }: ProductFormProps) {
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    name: product?.name || "",
    category: product?.category || "",
    price: product?.price || "",
    cost: product?.cost || "",
    offerPrice: product?.offerPrice ?? "",
    stock: product?.stock || "",
    minStock: product?.minimumStock || product?.minStock || "5",
    sku: product?.sku || "",
    hsnSacCode: product?.hsnSacCode ?? "",
    volume: product?.volume ?? "",
    volumeUnit: product?.volumeUnit || "pcs",
    description: product?.description || "",
    barcode: product?.barcode || "",
    taxCategory: product?.taxCategory || "standard",
    productType: product?.productType || "retail",
  })

  // Search functionality states
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'found' | 'not-found'>('idle')

  // Tax categories from settings (shared React Query cache with `useCurrency` / other consumers)
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([])
  const { data: paymentRes, isPending: isLoadingTaxCategories } = usePaymentSettingsQuery()

  const defaultTaxCategories: TaxCategory[] = useMemo(
    () => [
      { id: "essential", name: "Essential Products", rate: 5 },
      { id: "intermediate", name: "Intermediate Products", rate: 12 },
      { id: "standard", name: "Standard Products", rate: 18 },
      { id: "luxury", name: "Luxury Products", rate: 28 },
      { id: "exempt", name: "Exempt Products", rate: 0 },
    ],
    []
  )

  useEffect(() => {
    if (!paymentRes) return
    if (paymentRes.success && paymentRes.data) {
      const response = paymentRes
      const data = response.data
      if (data.taxCategories && Array.isArray(data.taxCategories)) {
        setTaxCategories(data.taxCategories)
        return
      }
      const built: TaxCategory[] = []
      if (data.essentialProductRate !== undefined) {
        built.push({ id: "essential", name: "Essential Products", rate: data.essentialProductRate || 5 })
      }
      if (data.intermediateProductRate !== undefined) {
        built.push({ id: "intermediate", name: "Intermediate Products", rate: data.intermediateProductRate || 12 })
      }
      if (data.standardProductRate !== undefined) {
        built.push({ id: "standard", name: "Standard Products", rate: data.standardProductRate || 18 })
      }
      if (data.luxuryProductRate !== undefined) {
        built.push({ id: "luxury", name: "Luxury Products", rate: data.luxuryProductRate || 28 })
      }
      if (data.exemptProductRate !== undefined) {
        built.push({ id: "exempt", name: "Exempt Products", rate: data.exemptProductRate || 0 })
      }
      setTaxCategories(built.length > 0 ? built : defaultTaxCategories)
      return
    }
    setTaxCategories(defaultTaxCategories)
  }, [paymentRes, defaultTaxCategories])

  // Update form data when product prop changes (for edit mode)
  useEffect(() => {
    if (product) {
      const isService = product.productType === "service"
      const costVal = product.cost != null && product.cost !== "" ? String(product.cost) : ""
      const priceVal = product.price != null && product.price !== "" ? String(product.price) : ""
      // For service products: selling price = cost price (use cost when price is 0/empty)
      const displayPrice = isService && (!priceVal || Number(priceVal) === 0) && costVal ? costVal : priceVal
      setFormData({
        name: product.name || "",
        category: product.category || "",
        price: displayPrice,
        cost: costVal,
        offerPrice: product.offerPrice ?? "",
        stock: product.stock || "",
        minStock: product.minimumStock || product.minStock || "5",
        sku: product.sku || "",
        hsnSacCode: product.hsnSacCode ?? "",
        volume: product.volume ?? "",
        volumeUnit: product.volumeUnit || "pcs",
        description: product.description || "",
        barcode: product.barcode || "",
        taxCategory: product.taxCategory || "standard",
        productType: product.productType || "retail",
      })
      setSearchQuery(product.name || "")
    }
  }, [product])

  // Debounced search function
  const searchProducts = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([])
      setSearchStatus('idle')
      setShowSearchResults(false)
      return
    }

    setIsSearching(true)
    setSearchStatus('searching')

    try {
      const response = await ProductsAPI.getAll({ search: query, limit: 5 })
      if (response.success && response.data) {
        setSearchResults(response.data)
        setSearchStatus(response.data.length > 0 ? 'found' : 'not-found')
        setShowSearchResults(true)
      } else {
        setSearchResults([])
        setSearchStatus('not-found')
        setShowSearchResults(true)
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
      setSearchStatus('not-found')
      setShowSearchResults(true)
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Debounce search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchProducts(searchQuery)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, searchProducts])

  // Handle product selection from search results
  const handleProductSelect = (selectedProduct: any) => {
    setFormData({
      name: selectedProduct.name || "",
      category: selectedProduct.category || "",
      price: selectedProduct.price || "",
      cost: selectedProduct.cost || "",
      offerPrice: selectedProduct.offerPrice ?? "",
      stock: selectedProduct.stock || "",
      minStock: selectedProduct.minimumStock || selectedProduct.minStock || "",
      sku: selectedProduct.sku || "",
      hsnSacCode: selectedProduct.hsnSacCode ?? "",
      volume: selectedProduct.volume ?? "",
      volumeUnit: selectedProduct.volumeUnit || "pcs",
      description: selectedProduct.description || "",
      barcode: selectedProduct.barcode || "",
      taxCategory: selectedProduct.taxCategory || "standard",
      productType: selectedProduct.productType || "retail",
    })
    
    setSearchQuery(selectedProduct.name)
    setShowSearchResults(false)
    setSearchStatus('found')
    
    // Switch to edit mode if callback is provided
    if (onSwitchToEdit) {
      onSwitchToEdit(selectedProduct)
    }
    
    toast({
      title: "Product Found",
      description: `Switched to edit mode for "${selectedProduct.name}". You can modify the details and save changes.`,
    })
  }

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setFormData(prev => ({ ...prev, name: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const costVal = formData.cost !== undefined && formData.cost !== null && formData.cost !== '' ? parseFloat(formData.cost) : undefined
      const isServiceProduct = formData.productType === "service"
      const productData: any = {
        name: formData.name,
        category: formData.category,
        price: isServiceProduct ? (costVal ?? (parseFloat(formData.price) || 0)) : (parseFloat(formData.price) || 0),
        cost: costVal,
        offerPrice: formData.offerPrice !== undefined && formData.offerPrice !== null && formData.offerPrice !== '' ? parseFloat(formData.offerPrice) : undefined,
        stock: parseInt(formData.stock),
        sku: formData.sku || `SKU-${Date.now()}`,
        barcode: formData.barcode || undefined,
        hsnSacCode: formData.hsnSacCode || undefined,
        volume: formData.volume !== undefined && formData.volume !== null && formData.volume !== '' ? parseFloat(formData.volume) : undefined,
        volumeUnit: formData.volumeUnit || undefined,
        description: formData.description,
        taxCategory: formData.taxCategory,
        productType: formData.productType,
        isActive: true
      }
      
      // Add minimumStock - default to 5 if not provided
      if (formData.minStock !== undefined && formData.minStock !== null && formData.minStock !== '') {
        productData.minimumStock = parseInt(formData.minStock.toString())
      } else {
        productData.minimumStock = 5 // Default value
      }

      console.log('Submitting product data:', productData)
      console.log('Tax category being sent:', formData.taxCategory)

      let response
      if (product) {
        // Edit mode
        console.log('🔍 EDIT MODE - Product object:', product)
        console.log('🔍 EDIT MODE - Product ID:', product._id || product.id)
        console.log('🔍 EDIT MODE - Product name:', product.name)
        console.log('🔍 EDIT MODE - Form data:', formData)
        console.log('🔍 EDIT MODE - Product data to send:', productData)
        
        try {
          response = await ProductsAPI.update(product._id || product.id, productData)
          console.log('✅ Update response:', response)
          
          if (response.success) {
            toast({
              title: "Product updated",
              description: `${formData.name} has been updated successfully.`,
            })
          } else {
            console.error('❌ Update failed:', response)
            toast({
              title: "Update failed",
              description: response.error || "Failed to update product",
              variant: "destructive",
            })
          }
        } catch (error) {
          console.error('❌ Update error:', error)
          toast({
            title: "Update error",
            description: "An error occurred while updating the product",
            variant: "destructive",
          })
          return
        }
      } else {
        // Create mode
        console.log('Creating new product')
        response = await ProductsAPI.create(productData)
        console.log('Create response:', response)
        if (response.success) {
          toast({
            title: "Product created",
            description: `${formData.name} has been added to your inventory.`,
          })
        }
      }
      
      if (response.success) {
        onClose()
        
        // Call the refresh callback if provided
        if (onProductUpdated) {
          onProductUpdated()
        }
        
        // Dispatch custom event to refresh products list
        window.dispatchEvent(new CustomEvent('product-added'))
        console.log('Product update successful, dispatching refresh event')
      } else {
        throw new Error(response.error || `Failed to ${product ? 'update' : 'create'} product`)
      }
    } catch (error) {
      console.error(`Error ${product ? 'updating' : 'creating'} product:`, error)
      toast({
        title: "Error",
        description: `Failed to ${product ? 'update' : 'create'} product. Please try again.`,
        variant: "destructive",
      })
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value }
      // For service products: selling price = cost price
      if (prev.productType === "service" && field === "cost") {
        next.price = value
      }
      // When switching to service type, sync price = cost
      if (field === "productType" && value === "service" && prev.cost) {
        next.price = prev.cost
      }
      return next
    })
  }

  return (
    <TooltipProvider delayDuration={300}>
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Product Name *</Label>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                id="name"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search or enter product name..."
                required
                className="pl-10"
                onFocus={() => setShowSearchResults(true)}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                </div>
              )}
              {searchStatus === 'found' && !isSearching && (
                <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500 h-4 w-4" />
              )}
              {searchStatus === 'not-found' && !isSearching && searchQuery.length > 2 && (
                <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-orange-500 h-4 w-4" />
              )}
            </div>
            
            {/* Search Results Dropdown */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((product) => (
                  <div
                    key={product._id || product.id}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    onClick={() => handleProductSelect(product)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{product.name}</p>
                        <p className="text-sm text-gray-500">
                          {product.category} • Stock: {product.stock} • ₹{product.offerPrice != null && product.offerPrice !== '' ? product.offerPrice : product.price}
                        </p>
                      </div>
                      <div className="text-xs text-gray-400">
                        {product.barcode || product.sku || '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* No Results Message */}
            {showSearchResults && searchStatus === 'not-found' && searchQuery.length > 2 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                <div className="px-4 py-3 text-center text-gray-500">
                  <AlertCircle className="mx-auto h-6 w-6 text-orange-500 mb-2" />
                  <p>No products found matching "{searchQuery}"</p>
                  <p className="text-sm">You can create a new product with this name</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <CategoryCombobox
            type="product"
            value={formData.category}
            onChange={(value) => handleChange("category", value)}
          />
        </div>

        {formData.productType === 'service' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 min-h-[22px]">
                <Label htmlFor="cost">Cost Price</Label>
              </div>
              <Input
                id="cost"
                type="number"
                step="0.01"
                min="0"
                value={formData.cost}
                onChange={(e) => handleChange("cost", e.target.value)}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 min-h-[22px]">
                <Label htmlFor="price">Selling Price</Label>
                <span className="text-xs text-muted-foreground font-normal">(same as cost)</span>
              </div>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                readOnly
                placeholder="0.00"
                className="h-9 bg-muted"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:col-span-2">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 min-h-[22px]">
                <Label htmlFor="cost">Cost Price</Label>
              </div>
              <Input
                id="cost"
                type="number"
                step="0.01"
                value={formData.cost}
                onChange={(e) => handleChange("cost", e.target.value)}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 min-h-[22px]">
                <Label htmlFor="price">Selling Price *</Label>
              </div>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => handleChange("price", e.target.value)}
                placeholder="0.00"
                required
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 min-h-[22px]">
                <Label htmlFor="offerPrice">Offer Price</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none">
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p>If empty, Selling Price is used.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="offerPrice"
                type="number"
                step="0.01"
                value={formData.offerPrice}
                onChange={(e) => handleChange("offerPrice", e.target.value)}
                placeholder="Optional – else Selling Price"
                className="h-9"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
          <div className="space-y-2">
            <Label htmlFor="stock">Current Stock *</Label>
            <Input
              id="stock"
              type="number"
              value={formData.stock}
              onChange={(e) => handleChange("stock", e.target.value)}
              placeholder="0"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minStock">Minimum Stock Level (Default 5)</Label>
            <Input
              id="minStock"
              type="number"
              value={formData.minStock}
              onChange={(e) => handleChange("minStock", e.target.value)}
              placeholder="5"
              min="0"
            />
          </div>
        </div>

        {/* Row 4: Volume and Tax Category */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 min-h-[22px]">
              <Label htmlFor="volume">Volume</Label>
            </div>
            <div className="flex rounded-md border border-input overflow-hidden h-9">
              <Select
                value={formData.volumeUnit}
                onValueChange={(value) => handleChange("volumeUnit", value)}
              >
                <SelectTrigger className="h-9 flex-1 rounded-none border-0 border-r border-input bg-muted/30 focus:ring-0 focus:ring-offset-0 min-w-0">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mg">Milligram (mg)</SelectItem>
                  <SelectItem value="g">Gram (g)</SelectItem>
                  <SelectItem value="kg">Kilogram (kg)</SelectItem>
                  <SelectItem value="ml">Milliliters (ml)</SelectItem>
                  <SelectItem value="l">Liters (l)</SelectItem>
                  <SelectItem value="oz">Ounce (oz)</SelectItem>
                  <SelectItem value="pcs">Pieces (pcs)</SelectItem>
                  <SelectItem value="pkt">Packets (pkt)</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="volume"
                type="number"
                step="any"
                min="0"
                value={formData.volume}
                onChange={(e) => handleChange("volume", e.target.value)}
                placeholder="0"
                className="h-9 flex-1 rounded-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 min-w-0"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 min-h-[22px]">
              <Label htmlFor="taxCategory">Tax Category *</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p>Select the appropriate tax category for this product as per Indian GST law.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={formData.taxCategory}
              onValueChange={(value) => handleChange("taxCategory", value)}
              disabled={isLoadingTaxCategories}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={isLoadingTaxCategories ? "Loading categories..." : "Select tax category"} />
              </SelectTrigger>
              <SelectContent>
                {taxCategories.length > 0 ? (
                  taxCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name} ({category.rate}% GST)
                    </SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="essential">Essential Products (5% GST)</SelectItem>
                    <SelectItem value="intermediate">Intermediate Products (12% GST)</SelectItem>
                    <SelectItem value="standard">Standard Products (18% GST)</SelectItem>
                    <SelectItem value="luxury">Luxury Products (28% GST)</SelectItem>
                    <SelectItem value="exempt">Exempt Products (0% GST)</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 5: Product Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 min-h-[22px]">
              <Label htmlFor="productType">Product Type *</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p>How this product will be used in your business.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={formData.productType}
              onValueChange={(value) => handleChange("productType", value)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select product type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Retail - Sold to customers</SelectItem>
                <SelectItem value="service">Service - Used in services only</SelectItem>
                <SelectItem value="both">Both - Retail & Service</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Row 6: Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Product description..."
          rows={3}
        />
      </div>

      {/* Row 7: SKU/Barcode and HSN/SAC Code */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="barcode">SKU/Barcode</Label>
          <Input
            id="barcode"
            value={formData.barcode}
            onChange={(e) => handleChange("barcode", e.target.value)}
            placeholder="SKU or Barcode number"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hsnSacCode">HSN/SAC Code</Label>
          <Input
            id="hsnSacCode"
            value={formData.hsnSacCode}
            onChange={(e) => handleChange("hsnSacCode", e.target.value)}
            placeholder="e.g. 998313"
          />
        </div>
      </div>

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{product ? "Update Product" : "Create Product"}</Button>
      </div>
    </form>
    </TooltipProvider>
  )
}
