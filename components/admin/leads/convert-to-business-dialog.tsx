"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminLeadsAPI, type PlatformLeadRow } from "@/lib/admin-api"
import { adminRequestHeaders } from "@/lib/admin-request-headers"
import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus } from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

type BusinessOption = { _id: string; name?: string; businessName?: string }

type ConvertToBusinessDialogProps = {
  lead: PlatformLeadRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ConvertToBusinessDialog({
  lead,
  open,
  onOpenChange,
  onSuccess,
}: ConvertToBusinessDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState("")
  const [businessId, setBusinessId] = useState("")

  useEffect(() => {
    if (!open) return
    const load = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: "100", includeDeleted: "false" })
        const term = search.trim()
        if (term.length >= 3) params.set("search", term)
        const res = await fetch(`${API_URL}/admin/businesses?${params}`, {
          credentials: "include",
          headers: adminRequestHeaders(),
        })
        const payload = await res.json()
        let list: BusinessOption[] = Array.isArray(payload?.data) ? payload.data : []
        if (term.length > 0 && term.length < 3) {
          const lower = term.toLowerCase()
          list = list.filter((b) => {
            const label = (b.name || b.businessName || "").toLowerCase()
            return label.includes(lower)
          })
        }
        setBusinesses(list)
      } catch {
        toast({
          title: "Error",
          description: "Could not load businesses.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [open, search, toast])

  const handleConvert = async () => {
    if (!businessId) {
      toast({ title: "Select a business", variant: "destructive" })
      return
    }
    try {
      setSubmitting(true)
      await AdminLeadsAPI.convert(lead._id, businessId)
      toast({
        title: "Lead converted",
        description: "Lead linked to the selected business.",
      })
      onSuccess()
      onOpenChange(false)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Conversion failed."
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateBusiness = () => {
    const params = new URLSearchParams()
    if (lead.salonName) params.set("name", lead.salonName)
    else if (lead.name) params.set("name", lead.name)
    if (lead.phone) params.set("phone", lead.phone)
    if (lead.email) params.set("email", lead.email)
    params.set("leadId", lead._id)
    onOpenChange(false)
    router.push(`/admin/businesses/new?${params.toString()}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link to business</DialogTitle>
          <DialogDescription>
            Mark <strong>{lead.name}</strong> as converted by linking an existing tenant, or create a
            new business.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Search businesses</Label>
            <Input
              placeholder="Name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Business</Label>
            <Select value={businessId} onValueChange={setBusinessId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading…" : "Select business"} />
              </SelectTrigger>
              <SelectContent>
                {businesses.map((b) => (
                  <SelectItem key={b._id} value={b._id}>
                    {b.name || b.businessName || b._id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={handleCreateBusiness}>
            <Plus className="mr-2 h-4 w-4" />
            Create new business instead
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConvert} disabled={submitting || !businessId}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link & convert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
