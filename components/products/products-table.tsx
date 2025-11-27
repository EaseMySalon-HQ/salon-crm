"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Search, MoreHorizontal, Edit, Trash2, Package, Download, FileText, FileSpreadsheet, ChevronDown, Filter, Minus, Upload } from "lucide-react"
import { ProductsAPI } from "@/lib/api"
import { ProductForm } from "@/components/products/product-form"
import { ProductOutForm } from "@/components/products/product-out-form"
import { InventoryLogs } from "@/components/products/inventory-logs"
import { ProductImportModal } from "@/components/products/product-import-modal"
import { useAuth } from "@/lib/auth-context"
import { useCurrency } from "@/hooks/use-currency"
import { useToast } from "@/hooks/use-toast"
import { useFeature } from "@/hooks/use-entitlements"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"
import { format } from "date-fns"

interface ProductsTableProps {
  productTypeFilter?: string
  onProductTypeFilterChange?: (filter: string) => void
  lowStockFilter?: boolean
}

export function ProductsTable({ productTypeFilter: externalFilter, onProductTypeFilterChange, lowStockFilter = false }: ProductsTableProps = {}) {
  const { formatAmount } = useCurrency()
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  const { hasAccess: canAccessInventoryLogs } = useFeature("advanced_inventory")
  const [searchTerm, setSearchTerm] = useState("")
  const [internalFilter, setInternalFilter] = useState<string>("all")
  
  // Use external filter if provided, otherwise use internal state
  const productTypeFilter = externalFilter !== undefined ? externalFilter : internalFilter
  const setProductTypeFilter = (filter: string) => {
    if (onProductTypeFilterChange) {
      onProductTypeFilterChange(filter)
    } else {
      setInternalFilter(filter)
    }
  }
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isProductOutDialogOpen, setIsProductOutDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const canManageProducts = user?.role === "admin" || user?.role === "manager"

  // Handle switching from add to edit mode
  const handleSwitchToEdit = (product: any) => {
    setSelectedProduct(product)
    setIsAddDialogOpen(false)
    setIsEditDialogOpen(true)
  }

  const fetchProducts = async () => {
    try {
      const response = await ProductsAPI.getAll({ limit: 1000 }) // Fetch up to 1000 products
      if (response.success) {
        setProducts(response.data || [])
      }
    } catch (error) {
      console.error("Failed to fetch products:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  // Listen for custom events to refresh products
  useEffect(() => {
    const handleProductAdded = () => {
      console.log('Product added/updated event received, refreshing products...')
      fetchProducts()
    }

    window.addEventListener('product-added', handleProductAdded)
    return () => window.removeEventListener('product-added', handleProductAdded)
  }, [])

  const handleEditProduct = (product: any) => {
    setSelectedProduct(product)
    setIsEditDialogOpen(true)
  }

  const handleDeleteProduct = async (productId: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      try {
        console.log('Deleting product with ID:', productId)
        const response = await ProductsAPI.delete(productId)
        console.log('Delete response:', response)
        if (response.success) {
          // Refresh the products list
          fetchProducts()
          // Dispatch event to refresh stats
          window.dispatchEvent(new CustomEvent('product-added'))
        } else {
          console.error('Delete failed:', response.error)
        }
      } catch (error) {
        console.error('Failed to delete product:', error)
      }
    }
  }

  const filteredProducts = products.filter(
    (product) => {
      // Search filter
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.supplier && product.supplier.toLowerCase().includes(searchTerm.toLowerCase()))
      
      // Product type filter
      const matchesType = productTypeFilter === "all" || 
        (product.productType || 'retail') === productTypeFilter
      
      // Low stock filter - use product's minimumStock or default to 10
      const minimumStock = product.minimumStock || 10
      const matchesLowStock = !lowStockFilter || (product.stock !== undefined && product.stock < minimumStock)
      
      return matchesSearch && matchesType && matchesLowStock
    }
  )

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF()
      
      // Add title
      doc.setFontSize(20)
      doc.text("Products Inventory Report", 14, 22)
      
      // Add generation date
      doc.setFontSize(12)
      doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy 'at' h:mm a")}`, 14, 32)
      
      // Add summary stats
      doc.setFontSize(14)
      doc.text("Summary", 14, 50)
      doc.setFontSize(10)
      doc.text(`Total Products: ${products.length}`, 14, 60)
      doc.text(`Filtered Products: ${filteredProducts.length}`, 14, 70)
      doc.text(`Search Query: ${searchTerm || "All products"}`, 14, 80)
      
      let yPosition = 100
      
      if (filteredProducts.length === 0) {
        doc.setFontSize(14)
        doc.text("No product data available", 14, yPosition)
      } else {
        // Product table headers
        const headers = [
          "Product Name",
          "Category",
          "Product Type",
          "Price",
          "Stock",
          "Supplier",
          "Description",
          "Status"
        ]
        
        const data = filteredProducts.map(product => [
          product.name,
          product.category,
          product.productType || "retail",
          `₹${product.price.toFixed(2)}`,
          product.stock || 0,
          product.supplier || "N/A",
          product.description ? (product.description.length > 30 ? product.description.substring(0, 30) + "..." : product.description) : "N/A",
          product.status || "active"
        ])
        
        autoTable(doc, {
          head: [headers],
          body: data,
          startY: yPosition,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [16, 185, 129] }
        })
      }
      
      // Save the PDF
      const fileName = `products-report-${format(new Date(), "yyyy-MM-dd")}.pdf`
      doc.save(fileName)
      
      toast({
        title: "Export Successful",
        description: `PDF exported as ${fileName}`,
      })
    } catch (error) {
      console.error("PDF export error:", error)
      toast({
        title: "Export Failed",
        description: "Failed to export PDF. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleExportXLS = () => {
    try {
      const data = filteredProducts.map(product => ({
        "Product Name": product.name,
        "Category": product.category,
        "Product Type": product.productType || "retail",
        "Price": product.price,
        "Stock": product.stock || 0,
        "Supplier": product.supplier || "",
        "Description": product.description || "",
        "Status": product.status || "active"
      }))
      
      // Create workbook and worksheet
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Products Report")
      
      // Add summary sheet
      const summaryData = [
        { Metric: "Total Products", Value: products.length },
        { Metric: "Filtered Products", Value: filteredProducts.length },
        { Metric: "Search Query", Value: searchTerm || "All products" },
        { Metric: "Generated Date", Value: format(new Date(), "MMM dd, yyyy 'at' h:mm a") }
      ]
      
      const summaryWs = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")
      
      // Save the file
      const fileName = `products-report-${format(new Date(), "yyyy-MM-dd")}.xlsx`
      XLSX.writeFile(wb, fileName)
      
      toast({
        title: "Export Successful",
        description: `Excel file exported as ${fileName}`,
      })
    } catch (error) {
      console.error("XLS export error:", error)
      toast({
        title: "Export Failed",
        description: "Failed to export Excel file. Please try again.",
        variant: "destructive"
      })
    }
  }

  const getStockBadge = (stock: number, minStock: number) => {
    if (stock <= minStock) {
      return <Badge variant="destructive" className="bg-red-500 text-white">Low</Badge>
    }
    return null
  }

  return (
    <div className="space-y-4 p-4">
      {/* Enhanced Search and Add Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 transition-all duration-300"
            />
            {searchTerm && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                  {filteredProducts.length} results
                </div>
              </div>
            )}
          </div>
          
          {/* Product Type Filter */}
          <Select value={productTypeFilter} onValueChange={setProductTypeFilter}>
            <SelectTrigger className="w-[180px] h-10 border-gray-200">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <SelectValue placeholder="Filter by type" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="retail">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  Retail
                </div>
              </SelectItem>
              <SelectItem value="service">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  Service
                </div>
              </SelectItem>
              <SelectItem value="both">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                  Both
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-3">
          {canExport ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 px-4 bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-md hover:shadow-lg transition-all duration-300"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                  <FileText className="h-4 w-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportXLS} className="cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              className="h-10 px-4 bg-gray-100 cursor-not-allowed text-gray-500 border-gray-200"
              disabled
              title="Data export requires Professional or Enterprise plan"
            >
              <Download className="h-4 w-4 mr-2" />
              Export (Upgrade Required)
            </Button>
          )}
          
          {canAccessInventoryLogs ? (
            <InventoryLogs />
          ) : (
            <Button
              variant="outline"
              className="h-10 px-4 bg-gray-100 cursor-not-allowed text-gray-500 border-gray-200"
              disabled
              title="Advanced inventory management requires Professional or Enterprise plan"
            >
              <Package className="h-4 w-4 mr-2" />
              Inventory Logs (Upgrade Required)
            </Button>
          )}
          
          {canManageProducts && (
            <>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="h-10 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md hover:shadow-lg transition-all duration-300">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add New Product</DialogTitle>
                  </DialogHeader>
                  <ProductForm 
                    onClose={() => setIsAddDialogOpen(false)} 
                    onProductUpdated={fetchProducts}
                    onSwitchToEdit={handleSwitchToEdit}
                  />
                </DialogContent>
              </Dialog>

              <Dialog open={isProductOutDialogOpen} onOpenChange={setIsProductOutDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="h-10 px-4 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300">
                    <Minus className="mr-2 h-4 w-4" />
                    Product Out
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Product Out - Deduct Stock</DialogTitle>
                  </DialogHeader>
                  <ProductOutForm 
                    onClose={() => setIsProductOutDialogOpen(false)} 
                    onTransactionCreated={() => {
                      fetchProducts()
                      // Refresh inventory logs if the component is mounted
                      window.dispatchEvent(new CustomEvent('inventoryTransactionCreated'))
                    }}
                  />
                </DialogContent>
              </Dialog>
              
              <Button 
                onClick={() => setIsImportDialogOpen(true)}
                variant="outline"
                className="h-10 px-4 border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 transition-all duration-300"
              >
                <Upload className="mr-2 h-4 w-4" />
                Import Products
              </Button>
            </>
          )}
        </div>

        {/* Edit Product Dialog */}
        {canManageProducts && (
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Product</DialogTitle>
              </DialogHeader>
              <ProductForm 
                product={selectedProduct} 
                onClose={() => {
                  setIsEditDialogOpen(false)
                  setSelectedProduct(null)
                }}
                onProductUpdated={fetchProducts}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Enhanced Products Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-800">Product Directory</h3>
            <div className="text-sm text-gray-600">
              {filteredProducts.length} of {products.length} products
            </div>
          </div>
        </div>

        {/* Enhanced Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50 hover:bg-gray-50">
                <TableHead className="px-4 py-3 text-left font-semibold text-gray-700">Product Name</TableHead>
                <TableHead className="px-4 py-3 text-left font-semibold text-gray-700">Category</TableHead>
                <TableHead className="px-4 py-3 text-left font-semibold text-gray-700">Product Type</TableHead>
                <TableHead className="px-4 py-3 text-left font-semibold text-gray-700">Tax Category</TableHead>
                <TableHead className="px-4 py-3 text-left font-semibold text-gray-700">Stock</TableHead>
                <TableHead className="px-4 py-3 text-left font-semibold text-gray-700">Price</TableHead>
                <TableHead className="px-4 py-3 text-left font-semibold text-gray-700">Supplier</TableHead>
                <TableHead className="px-4 py-3 text-left font-semibold text-gray-700">SKU</TableHead>
                {canManageProducts && <TableHead className="px-4 py-3 text-center font-semibold text-gray-700 w-[70px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow key="loading">
                  <TableCell colSpan={canManageProducts ? 9 : 8} className="text-center py-8">
                    <div className="flex flex-col items-center space-y-2">
                      <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-gray-600 text-sm">Loading products...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredProducts.length === 0 ? (
                <TableRow key="empty">
                  <TableCell colSpan={canManageProducts ? 9 : 8} className="text-center py-8">
                    <div className="flex flex-col items-center space-y-2">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                        <Package className="h-6 w-6 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-base font-medium text-gray-900">No products found</p>
                        <p className="text-sm text-gray-500">Try adjusting your search criteria</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product, index) => (
                  <TableRow 
                    key={product._id || product.id}
                    className={`hover:bg-gray-50/50 transition-colors duration-200 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                    }`}
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                          <Package className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{product.name}</div>
                          <div className="text-xs text-gray-500">ID: {product._id?.slice(-6) || product.id}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge variant="outline" className="px-2 py-1 bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                        {product.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {(() => {
                        const getProductTypeBadge = (type: string) => {
                          switch (type) {
                            case 'retail':
                              return <Badge variant="outline" className="px-2 py-1 bg-blue-50 text-blue-700 border-blue-200 text-xs">Retail</Badge>
                            case 'service':
                              return <Badge variant="outline" className="px-2 py-1 bg-purple-50 text-purple-700 border-purple-200 text-xs">Service</Badge>
                            case 'both':
                              return <Badge variant="outline" className="px-2 py-1 bg-orange-50 text-orange-700 border-orange-200 text-xs">Both</Badge>
                            default:
                              return <Badge variant="outline" className="px-2 py-1 bg-gray-50 text-gray-700 border-gray-200 text-xs">Retail</Badge>
                          }
                        }
                        return getProductTypeBadge(product.productType || 'retail')
                      })()}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {(() => {
                        const getTaxCategoryBadge = (category: string) => {
                          switch (category) {
                            case 'essential':
                              return <Badge variant="outline" className="px-2 py-1 bg-blue-50 text-blue-700 border-blue-200 text-xs">Essential (5%)</Badge>
                            case 'intermediate':
                              return <Badge variant="outline" className="px-2 py-1 bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">Intermediate (12%)</Badge>
                            case 'standard':
                              return <Badge variant="outline" className="px-2 py-1 bg-green-50 text-green-700 border-green-200 text-xs">Standard (18%)</Badge>
                            case 'luxury':
                              return <Badge variant="outline" className="px-2 py-1 bg-purple-50 text-purple-700 border-purple-200 text-xs">Luxury (28%)</Badge>
                            case 'exempt':
                              return <Badge variant="outline" className="px-2 py-1 bg-gray-50 text-gray-700 border-gray-200 text-xs">Exempt (0%)</Badge>
                            default:
                              return <Badge variant="outline" className="px-2 py-1 bg-gray-50 text-gray-700 border-gray-200 text-xs">Standard (18%)</Badge>
                          }
                        }
                        return getTaxCategoryBadge(product.taxCategory || 'standard')
                      })()}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <div className="text-base font-medium text-gray-700">{product.stock}</div>
                        {getStockBadge(product.stock, product.minimumStock ?? product.minStock ?? 10)}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="font-semibold text-emerald-600">{formatAmount(product.price)}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="text-sm text-gray-600">
                        {product.supplier || (
                          <span className="text-gray-400 italic">Not specified</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                        {product.sku}
                      </div>
                    </TableCell>
                    {canManageProducts && (
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center justify-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-gray-100 transition-colors duration-200">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem 
                                onClick={() => handleEditProduct(product)}
                                className="cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition-colors duration-200"
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-red-600 cursor-pointer hover:bg-red-50 hover:text-red-700 transition-colors duration-200"
                                onClick={() => handleDeleteProduct(product._id || product.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Product Import Modal */}
      <ProductImportModal
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImportComplete={() => {
          fetchProducts()
          setIsImportDialogOpen(false)
        }}
      />
    </div>
  )
}
