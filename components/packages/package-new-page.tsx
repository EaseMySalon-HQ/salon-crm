"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Boxes, Loader2, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FormSkeleton, LoadingButton } from "@/components/loading"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { PackagesAPI, ServicesAPI } from "@/lib/api"

type ServiceOption = { _id?: string; id?: string; name: string; price?: number; duration?: number }

type ServiceLine = {
  id: string
  serviceId: string
  isOptional: boolean
}

function newServiceLine(serviceId = "", isOptional = false): ServiceLine {
  return {
    id: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    serviceId,
    isOptional,
  }
}

function resolveServiceId(serviceId: unknown): string {
  if (typeof serviceId === "object" && serviceId !== null && "_id" in serviceId) {
    return String((serviceId as { _id: unknown })._id)
  }
  return String(serviceId ?? "")
}

type PackageFormPageProps = {
  packageId?: string
}

export function PackageNewPage({ packageId }: PackageFormPageProps = {}) {
  const isEdit = Boolean(packageId)
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const isManager = user?.role === "admin" || user?.role === "manager"

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<"FIXED" | "CUSTOMIZED">("FIXED")
  const [totalPrice, setTotalPrice] = useState("")
  const [totalSittings, setTotalSittings] = useState("1")
  const [validityDays, setValidityDays] = useState("")
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([newServiceLine()])

  const [services, setServices] = useState<ServiceOption[]>([])
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingPackage, setLoadingPackage] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingServices(true)
      try {
        const res = await ServicesAPI.getAll({ limit: 500 })
        if (!cancelled && res.success && Array.isArray(res.data)) {
          setServices(res.data)
        }
      } catch {
        if (!cancelled) toast({ title: "Could not load services", variant: "destructive" })
      } finally {
        if (!cancelled) setLoadingServices(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  useEffect(() => {
    if (!isEdit || !packageId) return
    let cancelled = false
    ;(async () => {
      setLoadingPackage(true)
      try {
        const res = await PackagesAPI.getById(packageId)
        if (cancelled) return
        if (!res.success || !res.data) {
          toast({ title: "Package not found", variant: "destructive" })
          router.push("/settings?section=packages")
          return
        }
        const pkg = res.data
        setName(pkg.name ?? "")
        setDescription(pkg.description ?? "")
        setType(pkg.type === "CUSTOMIZED" ? "CUSTOMIZED" : "FIXED")
        setTotalPrice(String(pkg.total_price ?? ""))
        setTotalSittings(String(pkg.total_sittings ?? 1))
        setValidityDays(pkg.validity_days != null ? String(pkg.validity_days) : "")
        const lines = (pkg.services ?? [])
          .map((row) => {
            const serviceId = resolveServiceId(row.service_id)
            if (!serviceId) return null
            return newServiceLine(serviceId, !!row.is_optional)
          })
          .filter((line): line is ServiceLine => line != null)
        setServiceLines(lines.length > 0 ? lines : [newServiceLine()])
      } catch {
        if (!cancelled) {
          toast({ title: "Could not load package", variant: "destructive" })
          router.push("/settings?section=packages")
        }
      } finally {
        if (!cancelled) setLoadingPackage(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isEdit, packageId, router, toast])

  const catalogSum = useMemo(() => {
    let sum = 0
    for (const line of serviceLines) {
      if (!line.serviceId) continue
      const svc = services.find((s) => String(s._id || s.id) === line.serviceId)
      sum += svc?.price ?? 0
    }
    return sum
  }, [serviceLines, services])

  const updateLine = (id: string, patch: Partial<ServiceLine>) => {
    setServiceLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isManager) {
      toast({
        title: "Manager access required",
        description: isEdit ? "Only managers can edit packages." : "Only managers can create packages.",
        variant: "destructive",
      })
      return
    }
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast({ title: "Package name is required", variant: "destructive" })
      return
    }
    const price = parseFloat(totalPrice)
    const sittings = parseInt(totalSittings, 10)
    if (!Number.isFinite(price) || price < 0) {
      toast({ title: "Enter a valid package price", variant: "destructive" })
      return
    }
    if (!Number.isFinite(sittings) || sittings < 1) {
      toast({ title: "Total sittings must be at least 1", variant: "destructive" })
      return
    }
    const picked = serviceLines.filter((l) => l.serviceId)
    if (picked.length === 0) {
      toast({ title: "Add at least one service", variant: "destructive" })
      return
    }
    const unique = new Set(picked.map((l) => l.serviceId))
    if (unique.size !== picked.length) {
      toast({ title: "Each service can only be added once", variant: "destructive" })
      return
    }

    const validityRaw = validityDays.trim()
    const validity_days =
      validityRaw === "" ? null : parseInt(validityRaw, 10)

    setSubmitting(true)
    try {
      const payload = {
        name: trimmedName,
        description: description.trim() || undefined,
        type,
        total_price: price,
        total_sittings: sittings,
        validity_days: validity_days != null && Number.isFinite(validity_days) ? validity_days : null,
        min_service_count: type === "CUSTOMIZED" ? 1 : undefined,
        services: picked.map((l) => ({
          service_id: l.serviceId,
          is_optional: type === "CUSTOMIZED" ? l.isOptional : false,
        })),
      }
      const res =
        isEdit && packageId ? await PackagesAPI.update(packageId, payload) : await PackagesAPI.create(payload)
      if (!res.success) {
        toast({
          title: isEdit ? "Could not update package" : "Could not create package",
          description: res.message || "Try again.",
          variant: "destructive",
        })
        return
      }
      if (!isEdit && res.data && "warning" in res.data && res.data.warning) {
        toast({ title: "Package created", description: res.data.warning })
      } else {
        toast({
          title: isEdit ? "Package updated" : "Package created",
          description: isEdit
            ? "Changes apply to future purchases only."
            : `"${trimmedName}" is ready to sell.`,
        })
      }
      router.push("/settings?section=packages")
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  if (!isManager) {
    return (
      <div className="min-h-screen bg-slate-100/80 px-4 py-6">
        <div className="mx-auto max-w-lg text-center py-20 space-y-4">
          <p className="text-slate-600">
            Only managers and owners can {isEdit ? "edit" : "create"} packages.
          </p>
          <Button asChild variant="outline">
            <Link href="/settings?section=packages">Back to packages</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (loadingPackage) {
    return (
      <div className="min-h-screen bg-slate-100/80 px-4 py-6">
        <div className="mx-auto max-w-2xl">
          <FormSkeleton fields={8} columns={1} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100/80 px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings?section=packages" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Boxes className="h-6 w-6 text-violet-600" />
              {isEdit ? "Edit package" : "Create package"}
            </h1>
            <p className="text-sm text-slate-500">
              {isEdit
                ? "Update catalog details. Existing client packages are not changed."
                : "Define sittings, price, and included services."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-6">
          <div className="space-y-2">
            <Label htmlFor="pkg-name">Package name *</Label>
            <Input
              id="pkg-name"
              placeholder="e.g. Bridal glow — 6 sessions"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pkg-desc">Description</Label>
            <Textarea
              id="pkg-desc"
              rows={2}
              placeholder="Optional notes for staff"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Package type</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as "FIXED" | "CUSTOMIZED")}
              className="grid sm:grid-cols-2 gap-3"
            >
              <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer has-[:checked]:border-violet-500 has-[:checked]:bg-violet-50/50">
                <RadioGroupItem value="FIXED" className="mt-0.5" />
                <span>
                  <span className="font-medium text-sm block">Fixed</span>
                  <span className="text-xs text-slate-500">Same services every visit</span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer has-[:checked]:border-violet-500 has-[:checked]:bg-violet-50/50">
                <RadioGroupItem value="CUSTOMIZED" className="mt-0.5" />
                <span>
                  <span className="font-medium text-sm block">Customized</span>
                  <span className="text-xs text-slate-500">Client picks from included services</span>
                </span>
              </label>
            </RadioGroup>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pkg-price">Package price (₹) *</Label>
              <Input
                id="pkg-price"
                type="number"
                min={0}
                step={1}
                value={totalPrice}
                onChange={(e) => setTotalPrice(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-sittings">Total sittings *</Label>
              <Input
                id="pkg-sittings"
                type="number"
                min={1}
                step={1}
                value={totalSittings}
                onChange={(e) => setTotalSittings(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-validity">Validity (days)</Label>
              <Input
                id="pkg-validity"
                type="number"
                min={0}
                placeholder="Never expires"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
              />
            </div>
          </div>

          {catalogSum > 0 && totalPrice && (
            <p className="text-xs text-slate-500">
              Sum of selected service menu prices: ₹{catalogSum.toLocaleString("en-IN")}
              {parseFloat(totalPrice) > 0 && parseFloat(totalPrice) < catalogSum
                ? " · package is discounted vs à la carte"
                : ""}
            </p>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Services included *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setServiceLines((prev) => [...prev, newServiceLine()])}
                disabled={loadingServices}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add service
              </Button>
            </div>
            {loadingServices ? (
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading services…
              </p>
            ) : (
              <div className="space-y-2">
                {serviceLines.map((line) => (
                  <div key={line.id} className="flex flex-wrap items-center gap-2">
                    <Select value={line.serviceId || undefined} onValueChange={(v) => updateLine(line.id, { serviceId: v })}>
                      <SelectTrigger className="flex-1 min-w-[200px] h-9">
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => {
                          const id = String(s._id || s.id)
                          return (
                            <SelectItem key={id} value={id}>
                              {s.name}
                              {s.price != null ? ` · ₹${s.price}` : ""}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    {type === "CUSTOMIZED" && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 shrink-0">
                        <Checkbox
                          checked={line.isOptional}
                          onCheckedChange={(v) => updateLine(line.id, { isOptional: v === true })}
                        />
                        Optional pick
                      </label>
                    )}
                    {serviceLines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-slate-400"
                        onClick={() => setServiceLines((prev) => prev.filter((l) => l.id !== line.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500">
              Create services first under Settings → Services if the list is empty.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 justify-end pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" asChild disabled={submitting}>
              <Link href="/settings?section=packages">Cancel</Link>
            </Button>
            <LoadingButton type="submit" className="bg-violet-600 hover:bg-violet-700" loading={submitting} loadingText={isEdit ? "Saving…" : "Creating…"} disabled={loadingServices}>
              {isEdit ? "Save changes" : "Create package"}
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  )
}
