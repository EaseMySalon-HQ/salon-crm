"use client"

import * as React from "react"
import { Pencil, Trash2, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { CategoriesAPI, ProductsAPI, ServicesAPI } from "@/lib/api"
import { CategoryEditDialog } from "./category-edit-dialog"

interface Category {
  _id: string
  name: string
  description?: string
  isActive: boolean
  isManaged?: boolean // True if from Categories API, false if extracted from products/services
  createdAt?: string
  updatedAt?: string
}

interface CategoryManagementProps {
  title?: string
  description?: string
}

export function CategoryManagement({ 
  title = "Category Management",
  description = "Manage your product and service categories"
}: CategoryManagementProps) {
  const [categories, setCategories] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [editingCategory, setEditingCategory] = React.useState<Category | null>(null)
  const [deletingCategory, setDeletingCategory] = React.useState<Category | null>(null)
  const [showAddDialog, setShowAddDialog] = React.useState(false)
  const { toast } = useToast()

  // Load categories
  const loadCategories = React.useCallback(async () => {
    try {
      setLoading(true)
      const categoryMap = new Map<string, Category>()
      
      // Fetch from the Categories API
      try {
        const response = await CategoriesAPI.getAll({ 
          search: searchQuery || undefined,
          activeOnly: false 
        })
        
        if (response.success && response.data) {
          response.data.forEach((category: any) => {
            categoryMap.set(category._id, {
              ...category,
              _id: category._id,
              isManaged: true // Mark as managed (from Categories API)
            } as any)
          })
        }
      } catch (error) {
        console.log('Categories API returned no data, will extract from products/services')
      }
      
      // Also extract categories from existing products and services
      try {
        const response = await ProductsAPI.getAll({ limit: 10000 })
        if (response.success && response.data) {
          const products = Array.isArray(response.data) ? response.data : (response.data?.data || [])
          products.forEach((product: any) => {
            if (product.category && product.category.trim()) {
              const categoryName = product.category.trim()
              if (!Array.from(categoryMap.values()).some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
                categoryMap.set(`extracted-product-${categoryName}`, {
                  _id: `extracted-product-${categoryName}`,
                  name: categoryName,
                  isActive: true,
                  isManaged: false
                } as any)
              }
            }
          })
        }
      } catch (error) {
        console.log('Error fetching products for categories:', error)
      }
      
      try {
        const response = await ServicesAPI.getAll({ limit: 10000 })
        if (response.success && response.data) {
          const services = Array.isArray(response.data) ? response.data : (response.data?.data || [])
          services.forEach((service: any) => {
            if (service.category && service.category.trim()) {
              const categoryName = service.category.trim()
              if (!Array.from(categoryMap.values()).some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
                categoryMap.set(`extracted-service-${categoryName}`, {
                  _id: `extracted-service-${categoryName}`,
                  name: categoryName,
                  isActive: true,
                  isManaged: false
                } as any)
              }
            }
          })
        }
      } catch (error) {
        console.log('Error fetching services for categories:', error)
      }
      
      // Convert map to array and sort
      const categoriesArray = Array.from(categoryMap.values()).sort((a, b) => 
        a.name.localeCompare(b.name)
      )
      
      // Apply search filter
      const filteredArray = searchQuery 
        ? categoriesArray.filter(cat => 
            cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            cat.description?.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : categoriesArray
      
      setCategories(filteredArray)
    } catch (error) {
      console.error('Error loading categories:', error)
      toast({
        title: "Error",
        description: "Failed to load categories",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [searchQuery, toast])

  // Load categories on mount and when dependencies change
  React.useEffect(() => {
    loadCategories()
  }, [loadCategories])

  // Handle delete
  const handleDelete = async () => {
    if (!deletingCategory) return

    // Extracted categories (from products) have no API document - require product updates first
    if (!deletingCategory.isManaged) {
      toast({
        title: "Category used in products",
        description: "Update the category on your products/services to a different value to remove it from this list.",
        variant: "destructive",
      })
      setDeletingCategory(null)
      return
    }

    try {
      const response = await CategoriesAPI.delete(deletingCategory._id)
      
      if (response.success) {
        toast({
          title: "Success",
          description: "Category deleted successfully",
        })
        loadCategories()
      } else {
        throw new Error(response.error || 'Failed to delete category')
      }
    } catch (error: any) {
      console.error('Error deleting category:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to delete category",
        variant: "destructive",
      })
    } finally {
      setDeletingCategory(null)
    }
  }

  // Handle successful save
  const handleSaveSuccess = () => {
    setEditingCategory(null)
    setShowAddDialog(false)
    loadCategories()
  }

  // Edit: for extracted categories, create via API first so we can edit
  const handleEditClick = async (category: Category) => {
    if (category.isManaged) {
      setEditingCategory(category)
      return
    }
    try {
      const response = await CategoriesAPI.create({
        name: category.name,
        description: category.description || ''
      })
      if (response.success && response.data) {
        loadCategories()
        setEditingCategory({ ...response.data, isManaged: true } as Category)
      } else {
        throw new Error(response.error || 'Failed to create category')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.message || "Failed to create category",
        variant: "destructive",
      })
    }
  }

  // Filter categories based on search
  const filteredCategories = React.useMemo(() => {
    if (!searchQuery) return categories
    return categories.filter(category =>
      category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      category.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [categories, searchQuery])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  Loading categories...
                </TableCell>
              </TableRow>
            ) : filteredCategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  {searchQuery ? "No categories found matching your search." : "No categories yet. Create your first category to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filteredCategories.map((category) => (
                <TableRow key={category._id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {category.description || <span className="text-muted-foreground">No description</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={category.isActive ? 'default' : 'secondary'}>
                      {category.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditClick(category)}
                              className="h-8 w-8 p-0"
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit category</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeletingCategory(category)}
                              className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete category</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Category Dialog */}
      <CategoryEditDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={handleSaveSuccess}
      />

      {/* Edit Category Dialog */}
      <CategoryEditDialog
        open={!!editingCategory}
        onOpenChange={(open) => !open && setEditingCategory(null)}
        category={editingCategory || undefined}
        onSuccess={handleSaveSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingCategory} onOpenChange={(open) => !open && setDeletingCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the category "{deletingCategory?.name}". This action cannot be undone.
              Products or services using this category will need to be updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

