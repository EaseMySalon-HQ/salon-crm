"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { CategoriesAPI } from "@/lib/api"

interface Category {
  _id: string
  name: string
  description?: string
  isActive: boolean
}

interface CategoryEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category
  onSuccess: () => void
  /** When creating, use this type so product/service categories stay separate */
  type?: "product" | "service"
}

export function CategoryEditDialog({
  open,
  onOpenChange,
  category,
  onSuccess,
  type
}: CategoryEditDialogProps) {
  const [formData, setFormData] = React.useState({
    name: '',
    description: '',
    isActive: true
  })
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const { toast } = useToast()

  // Reset/edit form when dialog opens or category changes
  React.useEffect(() => {
    if (!open) return
    if (category) {
      setFormData({
        name: category.name,
        description: category.description || '',
        isActive: category.isActive
      })
    } else {
      setFormData({
        name: '',
        description: '',
        isActive: true
      })
    }
  }, [open, category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      
      const categoryData: { name: string; description?: string; isActive?: boolean; type?: "product" | "service" | "both" } = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        isActive: formData.isActive
      }

      let response
      if (category) {
        // Update existing category
        response = await CategoriesAPI.update(category._id, categoryData)
      } else {
        // Create new category (with type so product/service stay separate)
        response = await CategoriesAPI.create({
          ...categoryData,
          ...(type && { type }),
        })
      }

      if (response.success) {
        toast({
          title: "Success",
          description: category ? "Category updated successfully" : "Category created successfully",
        })
        onSuccess()
      } else {
        throw new Error(response.error || `Failed to ${category ? 'update' : 'create'} category`)
      }
    } catch (error: any) {
      console.error(`Error ${category ? 'updating' : 'creating'} category:`, error)
      const message =
        error?.response?.data?.error ||
        error?.responseData?.error ||
        error?.message ||
        `Failed to ${category ? 'update' : 'create'} category`
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{category ? 'Edit Category' : 'Add New Category'}</DialogTitle>
            <DialogDescription>
              {category 
                ? 'Update the category details below.' 
                : 'Create a new category for your products or services.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Category Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter category name"
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter category description (optional)"
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">Active Status</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive categories won't appear in dropdowns
                </p>
              </div>
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting 
                ? (category ? 'Updating...' : 'Creating...') 
                : (category ? 'Update Category' : 'Create Category')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

