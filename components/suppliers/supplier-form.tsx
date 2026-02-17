"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { Switch } from "@/components/ui/switch"
import { SuppliersAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import { MultiCategorySelect } from "./multi-category-select"

const PAYMENT_TERMS = ["7", "15", "30", "45", "60", "custom"]

interface SupplierFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier?: any
  onSaved?: () => void
}

export function SupplierForm({ open, onOpenChange, supplier, onSaved }: SupplierFormProps) {
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState({
    name: "",
    contactPerson: "",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    gstNumber: "",
    paymentTerms: "30",
    bankDetails: "",
    categories: [] as string[],
    notes: "",
    isActive: true,
  })

  React.useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name || "",
        contactPerson: supplier.contactPerson || "",
        phone: supplier.phone || "",
        whatsapp: supplier.whatsapp || "",
        email: supplier.email || "",
        address: supplier.address || "",
        gstNumber: supplier.gstNumber || "",
        paymentTerms: supplier.paymentTerms || "30",
        bankDetails: supplier.bankDetails || "",
        categories: Array.isArray(supplier.categories) ? supplier.categories : (supplier.category ? [supplier.category] : []),
        notes: supplier.notes || "",
        isActive: supplier.isActive !== false,
      })
    } else {
      setForm({
        name: "",
        contactPerson: "",
        phone: "",
        whatsapp: "",
        email: "",
        address: "",
        gstNumber: "",
        paymentTerms: "30",
        bankDetails: "",
        categories: [] as string[],
        notes: "",
        isActive: true,
      })
    }
  }, [supplier, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast({ title: "Error", description: "Supplier name is required", variant: "destructive" })
      return
    }
    try {
      setSaving(true)
      if (supplier?._id) {
        const res = await SuppliersAPI.update(supplier._id, form)
        if (res.success) {
          toast({ title: "Success", description: "Supplier updated" })
          onSaved?.()
          onOpenChange(false)
        } else {
          toast({ title: "Error", description: res.error || "Update failed", variant: "destructive" })
        }
      } else {
        const res = await SuppliersAPI.create(form)
        if (res.success) {
          toast({ title: "Success", description: "Supplier created" })
          onSaved?.()
          onOpenChange(false)
        } else {
          toast({ title: "Error", description: res.error || "Create failed", variant: "destructive" })
        }
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{supplier ? "Edit Supplier" : "Add Supplier"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Supplier Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Supplier name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPerson">Contact Person</Label>
              <Input
                id="contactPerson"
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                placeholder="Contact person"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                value={form.whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                placeholder="WhatsApp number"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Address"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="gstNumber">GST Number</Label>
              <Input
                id="gstNumber"
                value={form.gstNumber}
                onChange={(e) => setForm((f) => ({ ...f, gstNumber: e.target.value }))}
                placeholder="GST number"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Terms (days)</Label>
              <Select
                value={form.paymentTerms}
                onValueChange={(v) => setForm((f) => ({ ...f, paymentTerms: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === "custom" ? "Custom" : `${t} days`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categories</Label>
              <MultiCategorySelect
                value={form.categories}
                onChange={(v) => setForm((f) => ({ ...f, categories: v }))}
              />
            </div>
            {supplier && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankDetails">Bank Details (optional)</Label>
            <Textarea
              id="bankDetails"
              value={form.bankDetails}
              onChange={(e) => setForm((f) => ({ ...f, bankDetails: e.target.value }))}
              placeholder="Account name, number, IFSC, bank name"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notes"
              rows={2}
            />
          </div>

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {supplier ? "Update" : "Create"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
