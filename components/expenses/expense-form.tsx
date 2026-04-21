"use client"

import { useState } from "react"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { ExpensesAPI } from "@/lib/api"

interface ExpenseFormProps {
  onClose: () => void
  expense?: any // For edit mode
  isEditMode?: boolean
}

const expenseCategories = [
  "Supplies",
  "Equipment",
  "Utilities",
  "Marketing",
  "Rent",
  "Insurance",
  "Maintenance",
  "Professional Services",
  "Travel",
  "Other"
]

const paymentModes = [
  "Cash",
  "Card",
  "Bank Transfer",
  "UPI",
  "Cheque",
  "Petty Cash Wallet"
]

export function ExpenseForm({ onClose, expense, isEditMode = false }: ExpenseFormProps) {
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    category: expense?.category || "",
    paymentMode: expense?.paymentMode || expense?.paymentMethod || "",
    description: expense?.description || "",
    amount: expense?.amount?.toString() || "",
    date: expense?.date ? new Date(expense.date) : new Date(),
    vendor: expense?.vendor || "",
    notes: expense?.notes || "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const showTransactionId = ["Card", "UPI", "Bank Transfer", "Cheque"].includes(formData.paymentMode)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedDescription = (formData.description || "").trim()
    if (!formData.category || !formData.paymentMode || !formData.amount || !trimmedDescription) {
      toast({
        title: "Validation Error",
        description: "Please fill in Category, Payment Mode, Amount, and Description.",
        variant: "destructive",
      })
      return
    }
    setIsSubmitting(true)

    try {
      const expenseData: Record<string, unknown> = {
        category: formData.category,
        paymentMode: formData.paymentMode,
        description: trimmedDescription,
        amount: parseFloat(formData.amount),
        date: format(formData.date, "yyyy-MM-dd"),
        status: expense?.status || "pending",
        vendor: (formData.vendor || "").trim(),
        notes: (formData.notes || "").trim(),
        approvedBy: expense?.approvedBy || "",
      }
      if (isEditMode && expense?.createdAt) {
        expenseData.createdAt = expense.createdAt
      }

      let response
      if (isEditMode && expense?.id) {
        // Update existing expense
        response = await ExpensesAPI.update(expense.id, expenseData)
        if (!response.success) {
          throw new Error(response.error || 'Failed to update expense')
        }
        toast({
          title: "Expense updated",
          description: `${formData.category} expense has been updated successfully.`,
        })
      } else {
        // Create new expense
        response = await ExpensesAPI.create(expenseData)
        if (!response.success) {
          throw new Error(response.error || 'Failed to create expense')
        }
        toast({
          title: "Expense added",
          description: `${formData.category} expense has been added successfully.`,
        })
      }

      onClose()
      
      // Dispatch custom event to refresh stats
      window.dispatchEvent(new CustomEvent('expense-added'))
    } catch (error: unknown) {
      console.error('Error submitting expense:', error)
      const err = error as { response?: { data?: { error?: string } }; message?: string }
      const errMsg = err?.response?.data?.error || err?.message || (isEditMode ? "Failed to update expense. Please try again." : "Failed to create expense. Please try again.")
      toast({
        title: "Error",
        description: typeof errMsg === "string" ? errMsg : "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (field: string, value: string | Date) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const remainingChars = 200 - formData.description.length

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Row 1: Date and Expense Category */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Date *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !formData.date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formData.date ? format(formData.date, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={formData.date}
                onSelect={(date) => date && handleChange("date", date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Expense Category *</Label>
          <Select value={formData.category} onValueChange={(value) => handleChange("category", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose expense name" />
            </SelectTrigger>
            <SelectContent>
              {expenseCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Vendor, Amount and Payment Mode */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="vendor">Vendor</Label>
          <Input
            id="vendor"
            value={formData.vendor}
            onChange={(e) => handleChange("vendor", e.target.value)}
            placeholder="Enter vendor name..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Amount *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
              placeholder="0.00"
              className="pl-8"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="paymentMode">Payment Mode *</Label>
          <Select value={formData.paymentMode} onValueChange={(value) => handleChange("paymentMode", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose payment mode" />
            </SelectTrigger>
            <SelectContent>
              {paymentModes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {mode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: Transaction ID (only for Card, UPI, Bank Transfer, Cheque) */}
      {showTransactionId && (
        <div className="space-y-2">
          <Label htmlFor="notes">Transaction Id</Label>
          <Input
            id="notes"
            value={formData.notes}
            onChange={(e) => handleChange("notes", e.target.value)}
            placeholder="Enter transaction ID..."
          />
        </div>
      )}

      {/* Row 4: Description (required) */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Enter expense description..."
          rows={3}
          maxLength={200}
          required
        />
        <div className="text-right text-sm text-muted-foreground">
          Approx. chars. left: {remainingChars}
        </div>
      </div>

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (isEditMode ? "Updating..." : "Saving...") : (isEditMode ? "Update" : "Save")}
        </Button>
      </div>
    </form>
  )
}
