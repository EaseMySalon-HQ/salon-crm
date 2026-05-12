"use client"

import type React from "react"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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
import { cn } from "@/lib/utils"
import {
  Search,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  ShoppingBag,
  Store,
  UserRound,
  Layers,
  Tag,
  Package,
  Shield,
  FileText,
  Plus,
  Save,
  Barcode,
  CloudUpload,
  X,
} from "lucide-react"

const PRODUCT_PHOTO_MAX_BYTES = 2 * 1024 * 1024

interface TaxCategory {
  id: string
  name: string
  rate: number
  description?: string
}

interface ProductFormProps {
  onClose: () => void
  product?: any // For edit mode
  /** When creating, seed fields (e.g. name from purchase invoice search). */
  createPrefill?: Partial<{
    name: string
    sku: string
    hsnSacCode: string
  }>
  onProductUpdated?: () => void // Callback to refresh the products list
  /** Called on successful create with `response.data` before `onClose`. */
  onProductCreated?: (product: any) => void
  onSwitchToEdit?: (product: any) => void // Callback to switch to edit mode
}

export function ProductForm({
  onClose,
  product,
  createPrefill,
  onProductUpdated,
  onProductCreated,
  onSwitchToEdit,
}: ProductFormProps) {
  const { toast } = useToast()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [productImageUrl, setProductImageUrl] = useState(() =>
    typeof product?.imageUrl === "string" ? product.imageUrl : "",
  )
  const [formData, setFormData] = useState({
    name: product?.name || createPrefill?.name || "",
    category: product?.category || "",
    price: product?.price || "",
    cost: product?.cost || "",
    offerPrice: product?.offerPrice ?? "",
    stock: product?.stock || "",
    minStock: product?.minimumStock || product?.minStock || "5",
    sku: product?.sku || createPrefill?.sku || "",
    hsnSacCode: product?.hsnSacCode ?? createPrefill?.hsnSacCode ?? "",
    volume: product?.volume ?? "",
    volumeUnit: product?.volumeUnit || "pcs",
    description: product?.description || "",
    barcode: product?.barcode || "",
    taxCategory: product?.taxCategory || "standard",
    productType: product?.productType || "retail",
  })

  const [isSearching, setIsSearching] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
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

  // Update form when editing a different product only (avoid resetting while typing if `product` reference changes each render)
  const editProductId =
    product && (product._id != null || product.id != null) ? String(product._id ?? product.id) : null

  useEffect(() => {
    if (!editProductId || !product) return
    const isService = product.productType === "service"
    const costVal = product.cost != null && product.cost !== "" ? String(product.cost) : ""
    const priceVal = product.price != null && product.price !== "" ? String(product.price) : ""
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
    setProductImageUrl(typeof product.imageUrl === "string" ? product.imageUrl : "")
  }, [editProductId]) // eslint-disable-line react-hooks/exhaustive-deps -- sync only when edit product id changes

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

  // Debounce search (edit only — new products are typed without inventory lookup)
  useEffect(() => {
    if (!product) return
    const timeoutId = setTimeout(() => {
      searchProducts(formData.name)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [formData.name, searchProducts, product])

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

    setProductImageUrl(typeof selectedProduct.imageUrl === "string" ? selectedProduct.imageUrl : "")

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
    setFormData((prev) => ({ ...prev, name: value }))
  }

  const processPhotoFile = (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PNG, JPG, or WebP image.",
        variant: "destructive",
      })
      return
    }
    if (file.size > PRODUCT_PHOTO_MAX_BYTES) {
      toast({
        title: "File too large",
        description: "Maximum size is 2MB.",
        variant: "destructive",
      })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === "string") setProductImageUrl(result)
    }
    reader.readAsDataURL(file)
  }

  const clearProductPhoto = () => {
    setProductImageUrl("")
    if (photoInputRef.current) photoInputRef.current.value = ""
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

      productData.imageUrl = productImageUrl.trim()

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
        if (!product && response.data && onProductCreated) {
          onProductCreated(response.data)
        }

        onClose()

        // Call the refresh callback if provided
        if (onProductUpdated) {
          onProductUpdated()
        }

        // Dispatch custom event to refresh products list
        window.dispatchEvent(new CustomEvent("product-added"))
        console.log("Product update successful, dispatching refresh event")
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

  const isEdit = Boolean(product)
  const isAddMode = !product

  const labelInfo = (body: React.ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex text-slate-400 transition-colors hover:text-slate-600 focus:outline-none">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs text-xs">
        {body}
      </TooltipContent>
    </Tooltip>
  )

  return (
    <TooltipProvider delayDuration={300}>
      <form onSubmit={handleSubmit} className="flex max-h-[92vh] min-h-0 flex-col bg-white">
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200/90 bg-white px-6 py-5">
          <div className="flex gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600 shadow-sm shadow-violet-600/20"
              aria-hidden
            >
              <ShoppingBag className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                {isEdit ? "Edit Product" : "Add New Product"}
              </h2>
              <p className="text-sm text-slate-500">
                {isEdit ? "Update details for this inventory item." : "Add a new product to your inventory."}
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Product information */}
          <section className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-5 shadow-sm">
            <div className="mb-5 flex gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600"
                aria-hidden
              >
                <Package className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Product Information</h3>
                <p className="text-xs text-slate-500">Name, category, identifiers, and how this item is used.</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,240px)] lg:items-start">
              <div className="grid min-w-0 gap-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name" className="text-slate-700">
                  Product Name <span className="text-red-500">*</span>
                </Label>
                {isAddMode ? (
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Enter product name..."
                    required
                    autoComplete="off"
                    className="h-10 border-slate-200 bg-white shadow-none focus-visible:ring-violet-500/25"
                  />
                ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Search or enter product name..."
                      required
                      className="h-10 border-slate-200 bg-white pl-10 shadow-none focus-visible:ring-violet-500/25"
                      onFocus={() => setShowSearchResults(true)}
                      onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                    />
                    {isSearching && (
                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                      </div>
                    )}
                    {searchStatus === "found" && !isSearching && (
                      <CheckCircle className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
                    )}
                    {searchStatus === "not-found" && !isSearching && formData.name.length > 2 && (
                      <AlertCircle className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
                    )}
                  </div>

                  {showSearchResults && searchResults.length > 0 && (
                    <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {searchResults.map((p) => (
                        <div
                          key={p._id || p.id}
                          className="cursor-pointer border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50"
                          onClick={() => handleProductSelect(p)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">{p.name}</p>
                              <p className="truncate text-xs text-slate-500">
                                {p.category} • Stock: {p.stock} • ₹
                                {p.offerPrice != null && p.offerPrice !== "" ? p.offerPrice : p.price}
                              </p>
                            </div>
                            <div className="shrink-0 text-xs text-slate-400">{p.barcode || p.sku || "—"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {showSearchResults && searchStatus === "not-found" && formData.name.length > 2 && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                      <div className="px-4 py-4 text-center text-slate-500">
                        <AlertCircle className="mx-auto mb-2 h-6 w-6 text-amber-500" />
                        <p className="text-sm">No products found matching &quot;{formData.name}&quot;</p>
                        <p className="mt-1 text-xs text-slate-400">You can create a new product with this name</p>
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-slate-700">
                  Category <span className="text-red-500">*</span>
                </Label>
                <CategoryCombobox
                  type="product"
                  value={formData.category}
                  onChange={(value) => handleChange("category", value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="barcode" className="text-slate-700">
                    SKU / Barcode
                  </Label>
                </div>
                <div className="relative">
                  <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="barcode"
                    value={formData.barcode}
                    onChange={(e) => handleChange("barcode", e.target.value)}
                    placeholder="Enter SKU or scan barcode"
                    className="h-10 border-slate-200 bg-white pl-10 shadow-none focus-visible:ring-violet-500/25"
                  />
                </div>
              </div>

              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    Product Type <span className="text-red-500">*</span>
                  </span>
                  {labelInfo(<p>How this product will be used in your business.</p>)}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(
                    [
                      { value: "retail" as const, title: "Retail", desc: "Sold to customers.", Icon: Store },
                      { value: "service" as const, title: "Service", desc: "Used in services.", Icon: UserRound },
                      { value: "both" as const, title: "Both", desc: "Retail & service.", Icon: Layers },
                    ] as const
                  ).map(({ value, title, desc, Icon }) => {
                    const selected = formData.productType === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleChange("productType", value)}
                        className={cn(
                          "flex flex-col items-start gap-2 rounded-xl border bg-white p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2",
                          selected
                            ? "border-violet-500 bg-violet-50/50 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.35)]"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80",
                        )}
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <Icon className={cn("h-5 w-5", selected ? "text-violet-600" : "text-slate-500")} />
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                              selected ? "border-violet-600 bg-violet-600" : "border-slate-300 bg-white",
                            )}
                          >
                            {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{title}</div>
                          <div className="text-xs text-slate-500">{desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

              <div className="space-y-2">
                <Label className="text-slate-700">Upload Product Photo</Label>
                <input
                  ref={photoInputRef}
                  id="product-photo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) processPhotoFile(f)
                  }}
                />
                <div
                  className={cn(
                    "relative rounded-xl border-2 border-dashed bg-white transition-colors",
                    productImageUrl ? "border-violet-200 p-2" : "border-slate-200 p-6 hover:border-violet-300/80 hover:bg-violet-50/30",
                  )}
                  onDragOver={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                  }}
                  onDrop={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    const f = ev.dataTransfer.files?.[0]
                    if (f) processPhotoFile(f)
                  }}
                >
                  {productImageUrl ? (
                    <div className="space-y-3">
                      <div className="relative overflow-hidden rounded-lg bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={productImageUrl}
                          alt=""
                          className="mx-auto max-h-44 w-full object-cover"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 border-slate-200 text-xs sm:flex-none"
                          onClick={() => photoInputRef.current?.click()}
                        >
                          Replace photo
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={clearProductPhoto}
                        >
                          <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="product-photo-input"
                      className="flex cursor-pointer flex-col items-center justify-center gap-2 text-center"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                        <CloudUpload className="h-6 w-6" aria-hidden />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-violet-700">Drag &amp; drop or click to upload</span>
                        <p className="mt-1 text-xs text-slate-500">PNG, JPG, WebP up to 2MB</p>
                      </div>
                      <p className="text-[11px] text-slate-400">Recommended: square image (1:1)</p>
                    </label>
                  )}
                </div>
              </div>
          </div>
          </section>

          {/* Pricing & Inventory row on large screens */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
              <div className="mb-5 flex gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600"
                  aria-hidden
                >
                  <Tag className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Pricing</h3>
                  <p className="text-xs text-slate-500">Set cost and selling prices for this product.</p>
                </div>
              </div>

              {formData.productType === "service" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="cost">Cost Price (₹)</Label>
                      {labelInfo(<p>Internal cost for this service line item.</p>)}
                    </div>
                    <Input
                      id="cost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.cost}
                      onChange={(e) => handleChange("cost", e.target.value)}
                      placeholder="0.00"
                      className="h-10 border-slate-200 shadow-none focus-visible:ring-emerald-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="price">Selling Price (₹)</Label>
                      <span className="text-xs font-normal text-slate-400">(same as cost)</span>
                    </div>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      readOnly
                      placeholder="0.00"
                      className="h-10 border-slate-200 bg-slate-50 shadow-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="cost">Cost Price (₹)</Label>
                        {labelInfo(<p>Your purchase or landed cost.</p>)}
                      </div>
                      <Input
                        id="cost"
                        type="number"
                        step="0.01"
                        value={formData.cost}
                        onChange={(e) => handleChange("cost", e.target.value)}
                        placeholder="0.00"
                        className="h-10 border-slate-200 shadow-none focus-visible:ring-emerald-500/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="price">
                          Selling Price (₹) <span className="text-red-500">*</span>
                      </Label>
                      {labelInfo(<p>Default price shown at checkout.</p>)}
                      </div>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => handleChange("price", e.target.value)}
                        placeholder="0.00"
                        required
                        className="h-10 border-slate-200 shadow-none focus-visible:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="offerPrice">Discounted Price (₹)</Label>
                      {labelInfo(<p>If empty, Selling Price is used at checkout.</p>)}
                    </div>
                    <Input
                      id="offerPrice"
                      type="number"
                      step="0.01"
                      value={formData.offerPrice}
                      onChange={(e) => handleChange("offerPrice", e.target.value)}
                      placeholder="Optional — else Selling Price"
                      className="h-10 border-slate-200 shadow-none focus-visible:ring-emerald-500/20"
                    />
                    <p className="text-xs text-slate-500">Optional — else Selling Price will be used.</p>
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs text-emerald-900">
                Offer Price is optional; billing uses Selling Price when Discounted Price is empty.
              </div>
            </section>

            <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
              <div className="mb-5 flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-600" aria-hidden>
                  <Package className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Inventory</h3>
                  <p className="text-xs text-slate-500">Stock levels and sellable unit.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="stock">
                      Current Stock <span className="text-red-500">*</span>
                    </Label>
                    {labelInfo(<p>On-hand quantity for this product.</p>)}
                  </div>
                  <Input
                    id="stock"
                    type="number"
                    value={formData.stock}
                    onChange={(e) => handleChange("stock", e.target.value)}
                    placeholder="0"
                    required
                    className="h-10 border-slate-200 shadow-none focus-visible:ring-sky-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="minStock">Minimum Stock Level</Label>
                    {labelInfo(<p>Low-stock alerts use this threshold (default 5).</p>)}
                  </div>
                  <Input
                    id="minStock"
                    type="number"
                    value={formData.minStock}
                    onChange={(e) => handleChange("minStock", e.target.value)}
                    placeholder="5"
                    min="0"
                    className="h-10 border-slate-200 shadow-none focus-visible:ring-sky-500/20"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="volume">Unit / Volume</Label>
                  {labelInfo(<p>Optional pack size or volume for display.</p>)}
                </div>
                <div className="flex h-10 overflow-hidden rounded-md border border-slate-200 bg-white">
                  <Select
                    modal={false}
                    value={formData.volumeUnit}
                    onValueChange={(value) => handleChange("volumeUnit", value)}
                  >
                    <SelectTrigger className="h-10 flex-1 min-w-[44%] rounded-none border-0 border-r border-slate-200 bg-slate-50/80 shadow-none focus:ring-0 focus:ring-offset-0">
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
                    className="h-10 flex-1 rounded-none border-0 shadow-none focus-visible:ring-sky-500/15"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Tax */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <div className="mb-5 flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500" aria-hidden>
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Tax &amp; compliance</h3>
                <p className="text-xs text-slate-500">GST category and HSN/SAC for invoicing.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="taxCategory">
                    Tax Category <span className="text-red-500">*</span>
                  </Label>
                  {labelInfo(<p>Select the appropriate tax category for this product as per Indian GST law.</p>)}
                </div>
                <Select
                  modal={false}
                  value={formData.taxCategory}
                  onValueChange={(value) => handleChange("taxCategory", value)}
                  disabled={isLoadingTaxCategories}
                >
                  <SelectTrigger id="taxCategory" className="h-10 border-slate-200 shadow-none focus:ring-orange-500/20">
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
              <div className="space-y-2">
                <Label htmlFor="hsnSacCode" className="text-slate-700">
                  HSN / SAC Code
                </Label>
                <Input
                  id="hsnSacCode"
                  value={formData.hsnSacCode}
                  onChange={(e) => handleChange("hsnSacCode", e.target.value)}
                  placeholder="e.g. 998313"
                  className="h-10 border-slate-200 shadow-none focus-visible:ring-orange-500/20"
                />
              </div>
            </div>
          </section>

          {/* Description */}
          <section className="rounded-xl border border-slate-200/90 bg-violet-50/30 p-5 shadow-sm">
            <div className="mb-4 flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600" aria-hidden>
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Description (optional)</h3>
                <p className="text-xs text-slate-500">Shown internally and on receipts where configured.</p>
              </div>
            </div>
            <div className="relative">
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Enter product description..."
                rows={4}
                className="min-h-[100px] resize-y border-slate-200 bg-white pb-8 shadow-none focus-visible:ring-violet-500/20"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-xs tabular-nums text-slate-400">
                {formData.description.length} / 500
              </span>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200/90 bg-slate-50/80 px-6 py-4">
          <Button type="button" variant="outline" className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="gap-2 bg-slate-900 text-white shadow-sm hover:bg-slate-800"
          >
            {isEdit ? (
              <>
                <Save className="h-4 w-4" aria-hidden />
                Update Product
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden />
                Create Product
              </>
            )}
          </Button>
        </div>
      </form>
    </TooltipProvider>
  )
}
