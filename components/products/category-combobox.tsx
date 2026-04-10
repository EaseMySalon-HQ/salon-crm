"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus, Settings } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CategoriesAPI, ProductsAPI, ServicesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface Category {
  _id?: string
  name: string
  description?: string
  isActive?: boolean
}

interface CategoryComboboxProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  onManageCategories?: () => void // Optional callback to open category management
  /** 'product' = product categories only, 'service' = service categories only. Keeps them separate. */
  type?: "product" | "service"
}

export function CategoryCombobox({ value, onChange, disabled, onManageCategories, type }: CategoryComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [categories, setCategories] = React.useState<Category[]>([])
  const [loading, setLoading] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [showAddDialog, setShowAddDialog] = React.useState(false)
  const [newCategoryName, setNewCategoryName] = React.useState("")
  const [addingCategory, setAddingCategory] = React.useState(false)
  const { toast } = useToast()

  // Load categories on mount and when type changes
  React.useEffect(() => {
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  const loadCategories = async () => {
    try {
      setLoading(true)
      const uniqueCategories = new Set<string>()
      const categoryMap = new Map<string, Category>()
      
      // Fetch from Categories API (filter by type so product/service categories stay separate)
      try {
        const response = await CategoriesAPI.getAll({
          activeOnly: true,
          ...(type && { type }),
        })
        if (response.success && response.data) {
          response.data.forEach((category: any) => {
            if (category.name && category.name.trim()) {
              const categoryName = category.name.trim()
              uniqueCategories.add(categoryName)
              categoryMap.set(categoryName, {
                name: categoryName,
                _id: category._id || categoryName,
                isActive: category.isActive
              })
            }
          })
        }
      } catch (error) {
        console.log('Categories API not available or empty, will extract from products/services')
      }
      
      // Extract categories from products only (when type is product or unspecified)
      if (type !== "service") {
        try {
          const response = await ProductsAPI.getAll({ limit: 10000 })
          if (response.success && response.data) {
            const products = Array.isArray(response.data) ? response.data : (response.data?.data || [])
            products.forEach((product: any) => {
              if (product.category && product.category.trim()) {
                const categoryName = product.category.trim()
                if (!uniqueCategories.has(categoryName)) {
                  uniqueCategories.add(categoryName)
                  categoryMap.set(categoryName, {
                    name: categoryName,
                    _id: categoryName,
                    isActive: true
                  })
                }
              }
            })
          }
        } catch (error) {
          console.log('Error fetching products for categories:', error)
        }
      }
      
      // Extract categories from services only (when type is service or unspecified)
      if (type !== "product") {
        try {
          const response = await ServicesAPI.getAll({ limit: 10000 })
          if (response.success && response.data) {
            const services = Array.isArray(response.data) ? response.data : (response.data?.data || [])
            services.forEach((service: any) => {
              if (service.category && service.category.trim()) {
                const categoryName = service.category.trim()
                if (!uniqueCategories.has(categoryName)) {
                  uniqueCategories.add(categoryName)
                  categoryMap.set(categoryName, {
                    name: categoryName,
                    _id: categoryName,
                    isActive: true
                  })
                }
              }
            })
          }
        } catch (error) {
          console.log('Error fetching services for categories:', error)
        }
      }
      
      // Convert map to array and sort alphabetically
      const categoriesArray = Array.from(categoryMap.values()).sort((a, b) => 
        a.name.localeCompare(b.name)
      )
      
      setCategories(categoriesArray)
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
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      })
      return
    }

    try {
      setAddingCategory(true)
      
      // Create the category using the API (with type so product/service stay separate)
      const response = await CategoriesAPI.create({
        name: newCategoryName.trim(),
        description: '',
        ...(type && { type }),
      })
      
      if (response.success && response.data) {
        // Reload categories to get the updated list
        await loadCategories()
        
        // Select the new category
        onChange(response.data.name)
        
        toast({
          title: "Success",
          description: "Category created successfully",
        })
        
        // Close dialog and reset
        setShowAddDialog(false)
        setNewCategoryName("")
        setOpen(false)
      } else {
        throw new Error(response.error || 'Failed to create category')
      }
    } catch (error: any) {
      const responseData = error.response?.data || error.responseData
      const existingCategory = responseData?.existingCategory
      const isAlreadyExists =
        error.response?.status === 400 &&
        (responseData?.error?.includes('already exists') || existingCategory)

      // If category already exists (400 + existingCategory or "already exists" message), select it
      if (isAlreadyExists && existingCategory?.name) {
        await loadCategories()
        onChange(String(existingCategory.name))
        setShowAddDialog(false)
        setNewCategoryName("")
        setOpen(false)
        toast({
          title: "Category already exists",
          description: `"${existingCategory.name}" is already a category and has been selected.`,
        })
        return
      }

      console.error('Error adding category:', error)
      const message = responseData?.error || error.message || "Failed to add category"
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      })
    } finally {
      setAddingCategory(false)
    }
  }

  // Filter categories based on search query
  const filteredCategories = React.useMemo(() => {
    if (!searchQuery) return categories
    return categories.filter(category =>
      category.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [categories, searchQuery])

  // Check if the search query matches an existing category
  const exactMatch = categories.find(
    c => c.name.toLowerCase() === searchQuery.toLowerCase()
  )

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        modal
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled || loading}
          >
            {value || "Select or type category..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search categories..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList 
              className="category-scroll-container max-h-[240px] overflow-y-auto overflow-x-hidden"
              style={{ 
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e1 #f1f5f9'
              }}
            >
              <CommandEmpty>
                {searchQuery && !exactMatch ? (
                  <div className="p-2">
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-left"
                      onClick={() => {
                        setNewCategoryName(searchQuery)
                        setShowAddDialog(true)
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add "{searchQuery}"
                    </Button>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {categories.length === 0 ? "No categories yet." : "No categories found."}
                    </p>
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-left"
                      onClick={() => {
                        setNewCategoryName("")
                        setShowAddDialog(true)
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add new category
                    </Button>
                  </div>
                )}
              </CommandEmpty>
              <CommandGroup>
                {filteredCategories.map((category) => (
                  <CommandItem
                    key={category._id || category.name}
                    value={category.name}
                    onSelect={(currentValue) => {
                      onChange(currentValue === value ? "" : currentValue)
                      setOpen(false)
                      setSearchQuery("")
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === category.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {category.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              {searchQuery && !exactMatch && filteredCategories.length > 0 && (
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setNewCategoryName(searchQuery)
                      setShowAddDialog(true)
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add new category "{searchQuery}"
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setNewCategoryName(searchQuery.trim() || "")
                    setShowAddDialog(true)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add new category...
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <div className="p-2 text-center">
                <p className="text-xs text-muted-foreground">
                  <Settings className="inline h-3 w-3 mr-1" />
                  Go to <strong>Categories</strong> tab to edit/delete
                </p>
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Add Category Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
            <DialogDescription>
              Create a new category for your products and services.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="category-name">Category Name *</Label>
              <Input
                id="category-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter category name"
                disabled={addingCategory}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCategory()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false)
                setNewCategoryName("")
              }}
              disabled={addingCategory}
            >
              Cancel
            </Button>
            <Button onClick={handleAddCategory} disabled={addingCategory}>
              {addingCategory ? "Adding..." : "Add Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

