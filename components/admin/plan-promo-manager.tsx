"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Pencil, Plus, Ticket } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import {
  AdminPlanPromosAPI,
  type AdminPlanPromoCode,
  type AdminPlanPromoInput,
  type PlanPromoDiscountType,
} from "@/lib/admin-api"

const PLAN_OPTIONS = [
  { id: "starter", label: "Starter" },
  { id: "growth", label: "Growth" },
  { id: "pro", label: "Pro" },
] as const

const PERIOD_OPTIONS = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
] as const

type FormState = {
  code: string
  description: string
  discountType: PlanPromoDiscountType
  discountValue: string
  planIds: ("starter" | "growth" | "pro")[]
  billingPeriods: ("monthly" | "yearly")[]
  validFrom: string
  validUntil: string
  maxRedemptions: string
  onePerBusiness: boolean
  active: boolean
}

const emptyForm = (): FormState => ({
  code: "",
  description: "",
  discountType: "percent",
  discountValue: "",
  planIds: [],
  billingPeriods: [],
  validFrom: "",
  validUntil: "",
  maxRedemptions: "",
  onePerBusiness: true,
  active: true,
})

function toDateInput(value: string | null | undefined) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

function formFromPromo(promo: AdminPlanPromoCode): FormState {
  return {
    code: promo.code,
    description: promo.description || "",
    discountType: promo.discountType,
    discountValue: String(promo.discountValue),
    planIds: [...promo.planIds],
    billingPeriods: [...promo.billingPeriods],
    validFrom: toDateInput(promo.validFrom),
    validUntil: toDateInput(promo.validUntil),
    maxRedemptions: promo.maxRedemptions != null ? String(promo.maxRedemptions) : "",
    onePerBusiness: promo.onePerBusiness,
    active: promo.active,
  }
}

function formatDiscount(promo: AdminPlanPromoCode) {
  if (promo.discountType === "percent") return `${promo.discountValue}% off`
  return `₹${promo.discountValue.toLocaleString("en-IN")} off`
}

function promoStatus(promo: AdminPlanPromoCode): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (!promo.active) return { label: "Inactive", variant: "secondary" }
  const now = new Date()
  if (promo.validFrom && new Date(promo.validFrom) > now) {
    return { label: "Scheduled", variant: "outline" }
  }
  if (promo.validUntil && new Date(promo.validUntil) < now) {
    return { label: "Expired", variant: "destructive" }
  }
  if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) {
    return { label: "Limit reached", variant: "destructive" }
  }
  return { label: "Active", variant: "default" }
}

function buildPayload(form: FormState): AdminPlanPromoInput {
  const maxRaw = form.maxRedemptions.trim()
  return {
    code: form.code.trim().toUpperCase(),
    description: form.description.trim(),
    discountType: form.discountType,
    discountValue: Number(form.discountValue),
    planIds: form.planIds,
    billingPeriods: form.billingPeriods,
    validFrom: form.validFrom ? form.validFrom : null,
    validUntil: form.validUntil ? form.validUntil : null,
    maxRedemptions: maxRaw ? Number(maxRaw) : null,
    onePerBusiness: form.onePerBusiness,
    active: form.active,
  }
}

export function PlanPromoManager() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [promos, setPromos] = useState<AdminPlanPromoCode[]>([])
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AdminPlanPromoCode | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await AdminPlanPromosAPI.list(
        search.trim() ? { search: search.trim() } : undefined
      )
      setPromos(data)
    } catch (err) {
      toast({
        title: "Could not load promo codes",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [search, toast])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const openEdit = (promo: AdminPlanPromoCode) => {
    setEditing(promo)
    setForm(formFromPromo(promo))
    setDialogOpen(true)
  }

  const togglePlan = (id: "starter" | "growth" | "pro", checked: boolean) => {
    setForm((f) => ({
      ...f,
      planIds: checked ? [...f.planIds, id] : f.planIds.filter((p) => p !== id),
    }))
  }

  const togglePeriod = (id: "monthly" | "yearly", checked: boolean) => {
    setForm((f) => ({
      ...f,
      billingPeriods: checked ? [...f.billingPeriods, id] : f.billingPeriods.filter((p) => p !== id),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = buildPayload(form)
      if (editing) {
        await AdminPlanPromosAPI.update(editing.id, payload)
        toast({ title: "Promo code updated", description: payload.code })
      } else {
        await AdminPlanPromosAPI.create(payload)
        toast({ title: "Promo code created", description: payload.code })
      }
      setDialogOpen(false)
      await load()
    } catch (err) {
      toast({
        title: editing ? "Update failed" : "Create failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (promo: AdminPlanPromoCode) => {
    try {
      await AdminPlanPromosAPI.setActive(promo.id, !promo.active)
      toast({
        title: promo.active ? "Promo deactivated" : "Promo activated",
        description: promo.code,
      })
      await load()
    } catch (err) {
      toast({
        title: "Could not update status",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground" asChild>
            <Link href="/admin/plans">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Plan Templates
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">Plan promo codes</h1>
          <p className="text-gray-600 mt-1">
            Create coupons for self-service plan checkout (Settings → Plan &amp; Billing).
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New promo code
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">All codes</CardTitle>
              <CardDescription>Tenants apply these at checkout before paying from their wallet.</CardDescription>
            </div>
            <Input
              placeholder="Search by code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : promos.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Ticket className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No promo codes yet.</p>
              <Button variant="outline" className="mt-4" onClick={openCreate}>
                Create your first code
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promos.map((promo) => {
                  const status = promoStatus(promo)
                  return (
                    <TableRow key={promo.id}>
                      <TableCell>
                        <div className="font-mono font-semibold">{promo.code}</div>
                        {promo.description ? (
                          <div className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">
                            {promo.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatDiscount(promo)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>
                          Plans:{" "}
                          {promo.planIds.length === 0
                            ? "All"
                            : promo.planIds.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}
                        </div>
                        <div>
                          Billing:{" "}
                          {promo.billingPeriods.length === 0
                            ? "All"
                            : promo.billingPeriods.join(", ")}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {promo.redemptionCount}
                        {promo.maxRedemptions != null ? ` / ${promo.maxRedemptions}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(promo)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleToggleActive(promo)}
                        >
                          {promo.active ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit promo code" : "New promo code"}</DialogTitle>
            <DialogDescription>
              Codes are case-insensitive. Leave plan or billing empty to allow all.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="promo-code">Code *</Label>
              <Input
                id="promo-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. PRO10"
                className="font-mono uppercase"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="promo-desc">Description</Label>
              <Textarea
                id="promo-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Internal note or customer-facing label"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Discount type *</Label>
                <Select
                  value={form.discountType}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, discountType: v as PlanPromoDiscountType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="fixed">Fixed (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-value">Value *</Label>
                <Input
                  id="promo-value"
                  type="number"
                  min={0}
                  max={form.discountType === "percent" ? 100 : undefined}
                  value={form.discountValue}
                  onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                  placeholder={form.discountType === "percent" ? "10" : "200"}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Plans (empty = all)</Label>
              <div className="flex flex-wrap gap-4">
                {PLAN_OPTIONS.map((plan) => (
                  <label key={plan.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.planIds.includes(plan.id)}
                      onCheckedChange={(c) => togglePlan(plan.id, c === true)}
                    />
                    {plan.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Billing period (empty = all)</Label>
              <div className="flex flex-wrap gap-4">
                {PERIOD_OPTIONS.map((period) => (
                  <label key={period.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.billingPeriods.includes(period.id)}
                      onCheckedChange={(c) => togglePeriod(period.id, c === true)}
                    />
                    {period.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="valid-from">Valid from</Label>
                <Input
                  id="valid-from"
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valid-until">Valid until</Label>
                <Input
                  id="valid-until"
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-redemptions">Max redemptions (optional)</Label>
              <Input
                id="max-redemptions"
                type="number"
                min={1}
                value={form.maxRedemptions}
                onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                placeholder="Unlimited if empty"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <Label htmlFor="one-per-business" className="text-sm font-medium">
                  One use per salon
                </Label>
                <p className="text-xs text-muted-foreground">Each business can redeem this code once.</p>
              </div>
              <Switch
                id="one-per-business"
                checked={form.onePerBusiness}
                onCheckedChange={(c) => setForm((f) => ({ ...f, onePerBusiness: c }))}
              />
            </div>

            {editing ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <Label htmlFor="promo-active" className="text-sm font-medium">
                  Active
                </Label>
                <Switch
                  id="promo-active"
                  checked={form.active}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, active: c }))}
                />
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || !form.code.trim() || !form.discountValue}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? "Save changes" : "Create code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
