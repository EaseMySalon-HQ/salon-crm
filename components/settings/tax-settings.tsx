"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"
import { SettingsAPI, ServicesAPI } from "@/lib/api"
import { Receipt, Plus, Pencil, Trash2 } from "lucide-react"

const TAX_TYPES = [
  { value: "gst", label: "GST (Goods & Services Tax)" },
]

const GST_RATES = [
  { value: "0", label: "0% - Exempt" },
  { value: "5", label: "5% - Essential Goods" },
  { value: "12", label: "12% - Standard" },
  { value: "18", label: "18% - Standard" },
  { value: "28", label: "28% - Luxury Goods" },
]

interface TaxCategory {
  id: string
  name: string
  rate: number
  description?: string
}

export function TaxSettings() {
  const [settings, setSettings] = useState({
    enableTax: true,
    taxType: "gst",
    priceInclusiveOfTax: true, // true = Included (price has GST), false = Excluded (GST added on top)
    taxRate: "18",
    cgstRate: "9",
    sgstRate: "9",
    igstRate: "18",
    serviceTaxRate: "5",
    membershipTaxRate: "5",
    packageTaxRate: "5",
    productTaxRate: "18",
  })

  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([
    { id: "essential", name: "Essential Products", rate: 5, description: "Basic hair care products, soaps, etc." },
    { id: "intermediate", name: "Intermediate Products", rate: 12, description: "Mid-range hair care products" },
    { id: "standard", name: "Standard Products", rate: 18, description: "Styling products, conditioners, etc." },
    { id: "luxury", name: "Luxury Products", rate: 28, description: "Premium brands, luxury hair care" },
    { id: "exempt", name: "Exempt Products", rate: 0, description: "Medical products, basic necessities" },
  ])

  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isEnablingTaxForAll, setIsEnablingTaxForAll] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<TaxCategory | null>(null)
  const [categoryForm, setCategoryForm] = useState({ name: "", rate: "", description: "" })
  const { toast } = useToast()

  // Load tax settings on component mount
  useEffect(() => {
    loadTaxSettings()
  }, [])

  const loadTaxSettings = async () => {
    setIsLoading(true)
    try {
      const response = await SettingsAPI.getPaymentSettings()
      if (response.success) {
        setSettings({
          enableTax: response.data.enableTax !== false,
          taxType: response.data.taxType || "gst",
          priceInclusiveOfTax: response.data.priceInclusiveOfTax !== false,
          taxRate: response.data.taxRate?.toString() || "18",
          cgstRate: response.data.cgstRate?.toString() || "9",
          sgstRate: response.data.sgstRate?.toString() || "9",
          igstRate: response.data.igstRate?.toString() || "18",
          serviceTaxRate: response.data.serviceTaxRate?.toString() || "5",
          membershipTaxRate: String(
            response.data.membershipTaxRate ?? response.data.serviceTaxRate ?? 5
          ),
          packageTaxRate: String(
            response.data.packageTaxRate ?? response.data.serviceTaxRate ?? 5
          ),
          productTaxRate: response.data.productTaxRate?.toString() || "18",
        })
        
        // Load tax categories if available
        if (response.data.taxCategories && Array.isArray(response.data.taxCategories)) {
          setTaxCategories(response.data.taxCategories)
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load tax settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Convert tax categories to the old format for backward compatibility
      const categoryRates: any = {}
      taxCategories.forEach(cat => {
        categoryRates[`${cat.id}ProductRate`] = cat.rate
      })

      const response = await SettingsAPI.updatePaymentSettings({
        enableTax: settings.enableTax,
        taxType: settings.taxType,
        priceInclusiveOfTax: settings.priceInclusiveOfTax,
        taxRate: parseFloat(settings.taxRate),
        cgstRate: parseFloat(settings.cgstRate),
        sgstRate: parseFloat(settings.sgstRate),
        igstRate: parseFloat(settings.igstRate),
        serviceTaxRate: parseFloat(settings.serviceTaxRate),
        membershipTaxRate: parseFloat(settings.membershipTaxRate),
        packageTaxRate: parseFloat(settings.packageTaxRate),
        productTaxRate: parseFloat(settings.productTaxRate),
        taxCategories: taxCategories,
        ...categoryRates,
      })

      if (response.success) {
        toast({
          title: "Success",
          description: "Tax settings updated successfully!",
        })
      } else {
        throw new Error(response.error || "Failed to update tax settings")
      }
    } catch (error) {
      console.error("Error updating tax settings:", error)
      toast({
        title: "Error",
        description: "Failed to update tax settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddCategory = () => {
    setCategoryForm({ name: "", rate: "", description: "" })
    setShowAddDialog(true)
  }

  const handleEditCategory = (category: TaxCategory) => {
    setEditingCategory(category)
    setCategoryForm({
      name: category.name,
      rate: category.rate.toString(),
      description: category.description || "",
    })
    setShowEditDialog(true)
  }

  const handleDeleteCategory = (categoryId: string) => {
    setDeletingCategoryId(categoryId)
    setShowDeleteDialog(true)
  }

  const confirmDeleteCategory = () => {
    if (deletingCategoryId) {
      setTaxCategories(taxCategories.filter(cat => cat.id !== deletingCategoryId))
      toast({
        title: "Success",
        description: "Tax category deleted successfully!",
      })
      setDeletingCategoryId(null)
      setShowDeleteDialog(false)
    }
  }

  const handleSaveCategory = () => {
    if (!categoryForm.name.trim() || !categoryForm.rate) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      })
      return
    }

    const rate = parseFloat(categoryForm.rate)
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast({
        title: "Error",
        description: "Please enter a valid tax rate between 0 and 100.",
        variant: "destructive",
      })
      return
    }

    if (showAddDialog) {
      // Generate a unique ID for new category
      const newId = categoryForm.name.toLowerCase().replace(/\s+/g, "-")
      if (taxCategories.some(cat => cat.id === newId)) {
        toast({
          title: "Error",
          description: "A category with this name already exists.",
          variant: "destructive",
        })
        return
      }

      setTaxCategories([
        ...taxCategories,
        {
          id: newId,
          name: categoryForm.name.trim(),
          rate: rate,
          description: categoryForm.description.trim() || undefined,
        },
      ])
      setShowAddDialog(false)
      toast({
        title: "Success",
        description: "Tax category added successfully!",
      })
    } else if (showEditDialog && editingCategory) {
      setTaxCategories(
        taxCategories.map(cat =>
          cat.id === editingCategory.id
            ? {
                ...cat,
                name: categoryForm.name.trim(),
                rate: rate,
                description: categoryForm.description.trim() || undefined,
              }
            : cat
        )
      )
      setShowEditDialog(false)
      setEditingCategory(null)
      toast({
        title: "Success",
        description: "Tax category updated successfully!",
      })
    }

    setCategoryForm({ name: "", rate: "", description: "" })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading tax settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-orange-100 to-red-100 rounded-lg flex items-center justify-center">
              <Receipt className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Tax Settings</h3>
              <p className="text-slate-600 text-sm">Configure tax rates and calculation methods</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-slate-700">Enable Tax</Label>
                <p className="text-sm text-slate-600">Apply tax calculations to bills and invoices</p>
              </div>
              <Switch
                checked={settings.enableTax}
                onCheckedChange={(checked) => setSettings({ ...settings, enableTax: checked })}
              />
            </div>
            
            {settings.enableTax && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="taxType" className="text-sm font-medium text-slate-700">
                      Tax Category
                    </Label>
                    <Select
                      value={settings.taxType}
                      onValueChange={(value) => setSettings({ ...settings, taxType: value })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select tax category" />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">Tax Type</Label>
                    <RadioGroup
                      value={settings.priceInclusiveOfTax ? "included" : "excluded"}
                      onValueChange={(value) => setSettings({ ...settings, priceInclusiveOfTax: value === "included" })}
                      className="flex gap-6 mt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="included" id="included" />
                        <Label htmlFor="included" className="text-sm font-normal cursor-pointer">
                          Included
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="excluded" id="excluded" />
                        <Label htmlFor="excluded" className="text-sm font-normal cursor-pointer">
                          Excluded
                        </Label>
                      </div>
                    </RadioGroup>
                    <p className="text-sm text-slate-500 mt-1">
                      {settings.priceInclusiveOfTax
                        ? "Price includes GST"
                        : "GST will be added on top of price"}
                    </p>
                  </div>
                </div>

                {/* Service and Product specific tax rates */}
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-4">Item-Specific Tax Rates</h4>
                  
                  {/* Service Tax Rate */}
                  <div className="mb-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="serviceTaxRate" className="text-sm font-medium text-slate-700">
                          Service Tax Rate (%)
                        </Label>
                        <Input
                          id="serviceTaxRate"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={settings.serviceTaxRate}
                          onChange={(e) => setSettings({ ...settings, serviceTaxRate: e.target.value })}
                          placeholder="Service tax rate"
                          className="mt-2"
                        />
                        <p className="text-sm text-slate-500 mt-1">Applied to all salon services (haircuts, styling, treatments)</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 pt-6">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="enableTaxForAll"
                            disabled={isEnablingTaxForAll}
                            onCheckedChange={async (checked) => {
                              setIsEnablingTaxForAll(true)
                              try {
                                const response = await ServicesAPI.bulkUpdateTaxApplicable(checked)
                                if (response.success) {
                                  toast({
                                    title: "Success",
                                    description: response.message || `Tax Applicable ${checked ? "enabled" : "disabled"} for ${response.modifiedCount ?? 0} services`,
                                  })
                                } else {
                                  throw new Error(response.error)
                                }
                              } catch (error) {
                                toast({
                                  title: "Error",
                                  description: "Failed to update services. Please try again.",
                                  variant: "destructive",
                                })
                              } finally {
                                setIsEnablingTaxForAll(false)
                              }
                            }}
                          />
                          <Label htmlFor="enableTaxForAll" className="text-sm font-medium text-slate-700 cursor-pointer">
                            Enable Tax for all services
                          </Label>
                        </div>
                        <p className="text-xs text-slate-500 text-right">Turn ON &quot;Tax Applicable&quot; for all services</p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="space-y-2 max-w-md">
                      <Label htmlFor="membershipTaxRate" className="text-sm font-medium text-slate-700">
                        Membership Tax Rate (%)
                      </Label>
                      <Input
                        id="membershipTaxRate"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={settings.membershipTaxRate ?? ""}
                        onChange={(e) => setSettings({ ...settings, membershipTaxRate: e.target.value })}
                        placeholder="Membership plan GST"
                        className="mt-2"
                      />
                      <p className="text-sm text-slate-500 mt-1">
                        Applied when selling membership plans on Quick Sale (uses the same Included / Excluded price mode as above)
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="space-y-2 max-w-md">
                      <Label htmlFor="packageTaxRate" className="text-sm font-medium text-slate-700">
                        Package Tax Rate (%)
                      </Label>
                      <Input
                        id="packageTaxRate"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={settings.packageTaxRate ?? ""}
                        onChange={(e) => setSettings({ ...settings, packageTaxRate: e.target.value })}
                        placeholder="Package GST"
                        className="mt-2"
                      />
                      <p className="text-sm text-slate-500 mt-1">
                        Applied when selling packages on Quick Sale (uses the same Included / Excluded price mode as above)
                      </p>
                    </div>
                  </div>

                  {/* Product Category Tax Rates */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="text-sm font-medium text-slate-700">Product Category Tax Rates</h5>
                        <p className="text-sm text-slate-500">Different GST rates for different product categories as per Indian tax law</p>
                      </div>
                      <Button
                        type="button"
                        onClick={handleAddCategory}
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        Add Tax Category
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {taxCategories.map((category) => (
                        <Card key={category.id} className="border-slate-200">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h6 className="text-sm font-semibold text-slate-800">
                                    {category.name}
                                  </h6>
                                  <span className="text-sm font-medium text-blue-600">
                                    {category.rate}% GST
                                  </span>
                                </div>
                                {category.description && (
                                  <p className="text-xs text-slate-500 mt-1">
                                    {category.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditCategory(category)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteCategory(category.id)}
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="px-8"
        >
          {isSaving ? "Saving..." : "Save Tax Settings"}
        </Button>
      </div>

      {/* Add Tax Category Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Tax Category</DialogTitle>
            <DialogDescription>
              Add a new product tax category with its GST rate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="categoryName">Category Name *</Label>
              <Input
                id="categoryName"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="e.g., Essential Products"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryRate">GST Rate (%) *</Label>
              <Input
                id="categoryRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={categoryForm.rate}
                onChange={(e) => setCategoryForm({ ...categoryForm, rate: e.target.value })}
                placeholder="e.g., 5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryDescription">Description (Optional)</Label>
              <Input
                id="categoryDescription"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="e.g., Basic hair care products, soaps, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCategory}>
              Add Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tax Category Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tax Category</DialogTitle>
            <DialogDescription>
              Update the tax category details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editCategoryName">Category Name *</Label>
              <Input
                id="editCategoryName"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="e.g., Essential Products"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editCategoryRate">GST Rate (%) *</Label>
              <Input
                id="editCategoryRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={categoryForm.rate}
                onChange={(e) => setCategoryForm({ ...categoryForm, rate: e.target.value })}
                placeholder="e.g., 5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editCategoryDescription">Description (Optional)</Label>
              <Input
                id="editCategoryDescription"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="e.g., Basic hair care products, soaps, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditDialog(false)
              setEditingCategory(null)
            }}>
              Cancel
            </Button>
            <Button onClick={handleSaveCategory}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Tax Category Alert Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tax Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tax category? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteDialog(false)
              setDeletingCategoryId(null)
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCategory}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
