"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Save } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/use-toast"
import {
  BranchManagementAPI,
  type BranchConfig,
  type DayHours,
  type UpdateBranchPayload,
  type WeekDay,
} from "@/lib/api"
import { STALE_TIME } from "@/lib/queries/staleness"

const DAYS: { key: WeekDay; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
]

type FormState = {
  name: string
  phone: string
  email: string
  address: { street: string; city: string; state: string; zipCode: string }
  allowOnlineBooking: boolean
  cancellationWindowHours: number
  revenueTargetMonthly: number
  operatingHours: Record<WeekDay, DayHours>
}

function toForm(config: BranchConfig): FormState {
  return {
    name: config.name,
    phone: config.phone,
    email: config.email,
    address: { ...config.address },
    allowOnlineBooking: config.allowOnlineBooking,
    cancellationWindowHours: config.cancellationWindowHours ?? 24,
    revenueTargetMonthly: config.revenueTargetMonthly ?? 0,
    operatingHours: config.operatingHours,
  }
}

export function BranchConfigPanel({
  branchId,
  onDirtyChange,
  onSaved,
}: {
  branchId: string
  onDirtyChange?: (dirty: boolean) => void
  onSaved?: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState | null>(null)
  const [baseline, setBaseline] = useState<string>("")
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["branch-management", "branch-config", branchId],
    queryFn: async () => {
      const res = await BranchManagementAPI.getBranchConfig(branchId)
      if (!res.success) throw new Error(res.error || "Failed to load branch settings")
      return res.data.config
    },
    enabled: !!branchId,
    staleTime: STALE_TIME.businessSettings,
  })

  useEffect(() => {
    if (data) {
      const f = toForm(data)
      setForm(f)
      setBaseline(JSON.stringify(f))
    }
  }, [data])

  const dirty = useMemo(() => form != null && JSON.stringify(form) !== baseline, [form, baseline])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const update = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f))
  const updateAddress = (patch: Partial<FormState["address"]>) =>
    setForm((f) => (f ? { ...f, address: { ...f.address, ...patch } } : f))
  const updateDay = (day: WeekDay, patch: Partial<DayHours>) =>
    setForm((f) =>
      f ? { ...f, operatingHours: { ...f.operatingHours, [day]: { ...f.operatingHours[day], ...patch } } } : f
    )

  const handleSave = async () => {
    if (!form || !dirty) return
    setSaving(true)
    try {
      const payload: UpdateBranchPayload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: { ...form.address },
        allowOnlineBooking: form.allowOnlineBooking,
        cancellationWindowHours: form.cancellationWindowHours,
        revenueTargetMonthly: form.revenueTargetMonthly,
        operatingHours: form.operatingHours,
      }
      const res = await BranchManagementAPI.updateBranch(branchId, payload)
      if (!res.success) {
        toast({ title: "Couldn't save", description: res.error || "Try again.", variant: "destructive" })
        return
      }
      const f = toForm(res.data.config)
      setForm(f)
      setBaseline(JSON.stringify(f))
      toast({ title: "Settings saved", description: res.data.config.name })
      queryClient.setQueryData(["branch-management", "branch-config", branchId], res.data.config)
      onSaved?.()
    } catch (err: any) {
      toast({
        title: "Couldn't save",
        description: err?.response?.data?.error || err?.message || "Try again.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !form) {
    return <Skeleton className="h-96 w-full rounded-xl" />
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800">Branch details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Branch name">
            <Input value={form.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => update({ phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} />
          </Field>
          <Field label="Street address">
            <Input value={form.address.street} onChange={(e) => updateAddress({ street: e.target.value })} />
          </Field>
          <Field label="City">
            <Input value={form.address.city} onChange={(e) => updateAddress({ city: e.target.value })} />
          </Field>
          <Field label="State">
            <Input value={form.address.state} onChange={(e) => updateAddress({ state: e.target.value })} />
          </Field>
          <Field label="PIN code">
            <Input value={form.address.zipCode} onChange={(e) => updateAddress({ zipCode: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800">Online booking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-600">
              Allow clients to book appointments online for this branch.
            </span>
            <Switch
              checked={form.allowOnlineBooking}
              onCheckedChange={(v) => update({ allowOnlineBooking: v })}
            />
          </label>
          <Field label="Cancellation window (hours before appointment)">
            <Input
              type="number"
              min={0}
              value={form.cancellationWindowHours}
              onChange={(e) => update({ cancellationWindowHours: Number(e.target.value) || 0 })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800">Revenue target</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="Monthly revenue target (INR)">
            <Input
              type="number"
              min={0}
              value={form.revenueTargetMonthly}
              onChange={(e) => update({ revenueTargetMonthly: Number(e.target.value) || 0 })}
            />
          </Field>
          <p className="mt-2 text-xs text-slate-500">
            Used on the branch management overview to show revenue vs target.
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-800">Operating hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAYS.map(({ key, label }) => {
            const day = form.operatingHours[key]
            return (
              <div key={key} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm font-medium text-slate-700">{label}</span>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <Switch checked={!day.closed} onCheckedChange={(v) => updateDay(key, { closed: !v })} />
                  {day.closed ? "Closed" : "Open"}
                </label>
                {!day.closed && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={day.open}
                      onChange={(e) => updateDay(key, { open: e.target.value })}
                      className="h-8 w-28 text-xs"
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <Input
                      type="time"
                      value={day.close}
                      onChange={(e) => updateDay(key, { close: e.target.value })}
                      className="h-8 w-28 text-xs"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-500">{label}</Label>
      {children}
    </div>
  )
}
