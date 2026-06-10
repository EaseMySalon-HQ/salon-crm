"use client"

import { useState } from "react"
import { Loader2, Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { BranchManagementAPI, type AddBranchPayload } from "@/lib/api"

const EMPTY = { branchName: "", city: "", phone: "", address: "", state: "", zipCode: "", email: "" }

export function AddBranchDialog({ onCreated }: { onCreated: (newBranchId?: string) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [submitting, setSubmitting] = useState(false)

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const reset = () => setForm({ ...EMPTY })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.branchName.trim() || !form.city.trim() || !form.phone.trim() || !form.address.trim()) {
      toast({ title: "Missing details", description: "Branch name, city, phone and address are required.", variant: "destructive" })
      return
    }
    setSubmitting(true)
    try {
      const payload: AddBranchPayload = {
        branchName: form.branchName.trim(),
        city: form.city.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        state: form.state.trim() || undefined,
        zipCode: form.zipCode.trim() || undefined,
        email: form.email.trim() || undefined,
      }
      const res = await BranchManagementAPI.addBranch(payload)
      if (!res.success) {
        toast({ title: "Couldn't add branch", description: res.error || res.message || "Please try again.", variant: "destructive" })
        return
      }
      toast({ title: "Branch created", description: `${res.data.branch.name} (${res.data.branch.code}) is ready.` })
      reset()
      setOpen(false)
      onCreated(res.data.branch.id)
    } catch (err: any) {
      toast({
        title: "Couldn't add branch",
        description: err?.response?.data?.error || err?.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Add Branch
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a new branch</DialogTitle>
            <DialogDescription>
              Creates a new branch with its own database. You can switch to it once created.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="branchName">Branch Name *</Label>
              <Input id="branchName" value={form.branchName} onChange={set("branchName")} placeholder="e.g. Andheri West" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City *</Label>
              <Input id="city" value={form.city} onChange={set("city")} placeholder="Mumbai" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="9876543210" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Address *</Label>
              <Input id="address" value={form.address} onChange={set("address")} placeholder="Street address" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">State</Label>
              <Input id="state" value={form.state} onChange={set("state")} placeholder="Maharashtra" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zipCode">PIN code</Label>
              <Input id="zipCode" value={form.zipCode} onChange={set("zipCode")} placeholder="400058" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="branch@salon.com" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Branch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
