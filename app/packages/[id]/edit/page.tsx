"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PackageServiceSelector, SelectedService } from "@/components/packages/PackageServiceSelector"
import { PackagePricePreview } from "@/components/packages/PackagePricePreview"
import { PackagesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { computePackagePriceFromDiscount } from "@/lib/package-pricing"

export default function EditPackagePage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: "",
    description: "",
    type: "FIXED" as "FIXED" | "CUSTOMIZED",
    total_price: "",
    discount_amount: "",
    discount_type: "FLAT" as "FLAT" | "PERCENT",
    total_sittings: "",
    min_service_count: "1",
    validity_days: "",
    never_expires: false,
    cross_branch_redemption: false,
    sittings_enabled: false,
  })
  const [services, setServices] = useState<SelectedService[]>([])
  const [pricingMode, setPricingMode] = useState<"manual" | "discount">("manual")

  const set = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }))

  const serviceSum = useMemo(
    () => services.reduce((sum, s) => sum + (Number(s.price) || 0), 0),
    [services]
  )
  const discountNum = parseFloat(form.discount_amount) || 0
  const priceFromDiscount = computePackagePriceFromDiscount(
    serviceSum,
    discountNum,
    form.discount_type
  )
  const manualPrice = parseFloat(form.total_price) || 0
  const effectiveTotalPrice = pricingMode === "manual" ? manualPrice : priceFromDiscount

  useEffect(() => {
    PackagesAPI.getById(id).then(res => {
      if (!res.success) { toast({ title: "Package not found", variant: "destructive" }); router.push("/packages"); return }
      const p = res.data
      const discAmt = Number(p.discount_amount) || 0
      setPricingMode(discAmt > 0 ? "discount" : "manual")
      setForm({
        name: p.name || "",
        description: p.description || "",
        type: p.type || "FIXED",
        total_price: String(p.total_price ?? ""),
        discount_amount: String(p.discount_amount ?? ""),
        discount_type: (p.discount_type === "PERCENT" ? "PERCENT" : "FLAT") as "FLAT" | "PERCENT",
        total_sittings: String(p.total_sittings ?? ""),
        min_service_count: String(p.min_service_count ?? "1"),
        validity_days: p.validity_days ? String(p.validity_days) : "",
        never_expires: p.validity_days === null || p.validity_days === undefined,
        cross_branch_redemption: !!p.cross_branch_redemption,
        sittings_enabled: (Number(p.total_sittings) || 1) > 1,
      })
      if (p.services) {
        setServices(p.services.map((s: any) => ({
          _id: s.service_id?._id || s.service_id,
          name: s.service_id?.name || "",
          price: s.service_id?.price || 0,
          is_optional: s.is_optional || false,
          tag: s.tag || ""
        })))
      }
    }).finally(() => setLoading(false))
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (services.length === 0) { toast({ title: "Add at least one service", variant: "destructive" }); return }
    if (pricingMode === "discount" && serviceSum <= 0) {
      toast({
        title: "Add services with prices",
        description: "Discount pricing needs a non-zero sum of service prices.",
        variant: "destructive"
      })
      return
    }
    if (form.sittings_enabled) {
      const ts = parseInt(form.total_sittings, 10)
      if (!form.total_sittings.trim() || Number.isNaN(ts) || ts < 1) {
        toast({
          title: "Enter total sittings",
          description: "Set how many visits are included, or turn off multi-visit sittings.",
          variant: "destructive"
        })
        return
      }
    }
    setSaving(true)
    try {
      const totalPrice =
        pricingMode === "manual"
          ? parseFloat(form.total_price)
          : priceFromDiscount
      const totalSittings = form.sittings_enabled
        ? parseInt(form.total_sittings, 10)
        : 1
      const minServiceCount = form.sittings_enabled
        ? parseInt(form.min_service_count, 10) || 1
        : 1
      const payload = {
        name: form.name,
        description: form.description,
        type: form.type,
        total_price: totalPrice,
        discount_amount: pricingMode === "discount" ? discountNum : 0,
        discount_type: pricingMode === "discount" ? form.discount_type : null,
        total_sittings: totalSittings,
        min_service_count: minServiceCount,
        validity_days: form.never_expires ? null : (parseInt(form.validity_days) || null),
        cross_branch_redemption: form.cross_branch_redemption,
        services: services.map(s => ({ service_id: s._id, is_optional: s.is_optional, tag: s.tag }))
      }
      const res = await PackagesAPI.update(id, payload)
      if (res.success) {
        toast({ title: "Package updated. Changes apply to future purchases only." })
        router.push("/packages")
      } else {
        toast({ title: res.message || "Failed", variant: "destructive" })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading…</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Edit Package</h1>
          <p className="text-xs text-amber-600">Changes apply to future purchases only — existing client packages are not affected.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white border rounded-xl p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">Basic Details</h2>
              <div className="space-y-1">
                <Label>Package Name *</Label>
                <Input required value={form.name} onChange={e => set("name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} />
              </div>
              <div className="space-y-1">
                <Label>Package Type *</Label>
                <div className="flex gap-3">
                  {(["FIXED", "CUSTOMIZED"] as const).map(t => (
                    <button key={t} type="button" onClick={() => set("type", t)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        form.type === t ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600"
                      }`}>
                      {t === "FIXED" ? "Fixed" : "Customized"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Services *</h2>
                <span className="text-xs text-gray-400">{services.length} selected</span>
              </div>
              <PackageServiceSelector selected={services} onChange={setServices} packageType={form.type} />
            </div>

            <div className="bg-white border rounded-xl p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">Pricing</h2>
              <div className="space-y-1">
                <Label>Pricing method</Label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (pricingMode === "discount") {
                        const p = computePackagePriceFromDiscount(
                          serviceSum,
                          discountNum,
                          form.discount_type
                        )
                        set("total_price", p > 0 ? String(p) : "")
                      }
                      setPricingMode("manual")
                    }}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      pricingMode === "manual"
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Enter price manually
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pricingMode === "manual") {
                        set("total_price", "")
                      }
                      setPricingMode("discount")
                    }}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      pricingMode === "discount"
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Discount from services
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  {pricingMode === "manual"
                    ? "Set the selling price directly. Discount fields are not used."
                    : "Selling price = sum of included service prices minus your discount."}
                </p>
              </div>

              {pricingMode === "manual" ? (
                <div className="space-y-1">
                  <Label>Package Price (₹) *</Label>
                  <Input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={form.total_price}
                    onChange={e => set("total_price", e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                    <div className="space-y-1">
                      <Label>Discount {form.discount_type === "PERCENT" ? "(%)" : "(₹)"}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={form.discount_type === "PERCENT" ? 100 : undefined}
                        step={form.discount_type === "PERCENT" ? 1 : "0.01"}
                        value={form.discount_amount}
                        onChange={e => set("discount_amount", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1 sm:pb-0">
                      <Label className="max-sm:sr-only">Type</Label>
                      <div className="flex h-10 rounded-md border border-input bg-background p-1 gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => set("discount_type", "FLAT")}
                          className={`flex-1 min-w-[2.5rem] rounded px-2 text-sm font-medium transition-colors ${
                            form.discount_type === "FLAT"
                              ? "bg-indigo-600 text-white"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          ₹
                        </button>
                        <button
                          type="button"
                          onClick={() => set("discount_type", "PERCENT")}
                          className={`flex-1 min-w-[2.5rem] rounded px-2 text-sm font-medium transition-colors ${
                            form.discount_type === "PERCENT"
                              ? "bg-indigo-600 text-white"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          %
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Sum of services</span>
                      <span className="tabular-nums">₹{serviceSum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-slate-200/80">
                      <span>Final package price</span>
                      <span className="tabular-nums">₹{priceFromDiscount.toFixed(2)}</span>
                    </div>
                  </div>
                  {serviceSum <= 0 && (
                    <p className="text-xs text-amber-700">
                      Select services with prices so the discounted total can be calculated.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white border rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-gray-800 pt-0.5">Sittings</h2>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-500 hidden sm:inline">Multi-visit</span>
                  <Switch
                    checked={form.sittings_enabled}
                    onCheckedChange={v => set("sittings_enabled", v)}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 -mt-1">
                {form.sittings_enabled
                  ? "Clients redeem this package across multiple visits."
                  : "Single visit — the package is used in one go (one sitting). Turn on for bundles with multiple visits."}
              </p>
              {form.sittings_enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Total Sittings *</Label>
                  <Input
                    type="number"
                    required={form.sittings_enabled}
                    min={1}
                    value={form.total_sittings}
                    onChange={e => set("total_sittings", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Min Services / Sitting</Label>
                  <Input type="number" min={1} value={form.min_service_count} onChange={e => set("min_service_count", e.target.value)} />
                </div>
              </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Validity (days)</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Never expires</span>
                    <Switch checked={form.never_expires} onCheckedChange={v => set("never_expires", v)} />
                  </div>
                </div>
                {!form.never_expires && (
                  <Input type="number" min={1} value={form.validity_days} onChange={e => set("validity_days", e.target.value)} placeholder="e.g. 90" />
                )}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Cross-branch redemption</p>
                  <p className="text-xs text-gray-400">Allow clients to redeem at any branch</p>
                </div>
                <Switch checked={form.cross_branch_redemption} onCheckedChange={v => set("cross_branch_redemption", v)} />
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>

          <div className="lg:col-span-1">
            <PackagePricePreview
              name={form.name}
              type={form.type}
              totalPrice={effectiveTotalPrice}
              discountAmount={pricingMode === "discount" ? discountNum : 0}
              discountType={pricingMode === "discount" ? form.discount_type : "FLAT"}
              totalSittings={
                form.sittings_enabled
                  ? parseInt(form.total_sittings, 10) || 0
                  : 1
              }
              validityDays={form.never_expires ? null : (parseInt(form.validity_days) || null)}
              services={services}
              minServiceCount={
                form.sittings_enabled
                  ? parseInt(form.min_service_count, 10) || 1
                  : 1
              }
              sittingsEnabled={form.sittings_enabled}
            />
          </div>
        </div>
      </form>
    </div>
  )
}
