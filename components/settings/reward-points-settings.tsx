"use client"

import { useEffect, useState } from "react"
import { Loader2, Gift } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RewardPointsAPI, type RewardPointsSettings } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

const defaults: RewardPointsSettings = {
  enabled: false,
  earnRupeeStep: 100,
  earnPointsStep: 10,
  redeemPointsStep: 100,
  redeemRupeeStep: 10,
  minRedeemPoints: 100,
  maxRedeemPercentOfBill: 20,
  earnOnWalletPurchaseLines: false,
  earnPointsOnServices: true,
  earnPointsOnProducts: true,
  earnPointsOnMembershipPurchases: true,
  earnPointsOnPrepaidPlan: false,
  earnPointsOnPackages: true,
  firstVisitBonusPoints: 0,
  birthdayBonusPoints: 0,
  birthdayBonusWindowDays: 0,
}

export function RewardPointsProgramSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<RewardPointsSettings>(defaults)

  const load = async () => {
    setLoading(true)
    try {
      const res = await RewardPointsAPI.getSettings()
      if (res.success && res.data) setSettings({ ...defaults, ...res.data })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await RewardPointsAPI.updateSettings(settings)
      if (res.success && res.data) {
        setSettings({ ...defaults, ...res.data })
        toast({ title: "Reward points settings saved" })
      } else {
        toast({ title: res.message || "Failed to save", variant: "destructive" })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" aria-hidden />
        <span>Loading reward points…</span>
      </div>
    )
  }

  return (
    <div className="w-full min-w-0 max-w-none space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-violet-100/90 bg-gradient-to-br from-violet-50/95 via-white to-indigo-50/40 p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-200/20 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25">
            <Gift className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Reward points</h2>
            <p className="max-w-none text-sm leading-relaxed text-slate-600 sm:text-[15px]">
              Customers earn points on completed bills and can redeem them at checkout. All changes are audited in the
              points ledger.
            </p>
          </div>
        </div>
      </div>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Program rules</CardTitle>
          <CardDescription>Configure earning, redemption caps, and optional visit bonuses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/50 p-4">
            <div>
              <Label className="text-base font-medium">Enable reward points</Label>
              <p className="text-xs text-muted-foreground mt-1">When off, bills cannot earn or redeem points.</p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: !!v }))}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-slate-100 bg-white p-4">
            <div>
              <Label className="text-base font-medium">Earn points on purchases</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Points are credited only from enabled line types on completed bills. Turning off a category excludes its
                totals from the earning calculation.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2">
                <Label className="text-sm font-normal cursor-pointer">Services</Label>
                <Switch
                  checked={settings.earnPointsOnServices !== false}
                  disabled={!settings.enabled}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, earnPointsOnServices: !!v }))}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2">
                <Label className="text-sm font-normal cursor-pointer">Products</Label>
                <Switch
                  checked={settings.earnPointsOnProducts !== false}
                  disabled={!settings.enabled}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, earnPointsOnProducts: !!v }))}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2">
                <Label className="text-sm font-normal cursor-pointer">Membership purchases</Label>
                <Switch
                  checked={settings.earnPointsOnMembershipPurchases !== false}
                  disabled={!settings.enabled}
                  onCheckedChange={(v) =>
                    setSettings((s) => ({ ...s, earnPointsOnMembershipPurchases: !!v }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2">
                <Label className="text-sm font-normal cursor-pointer">Prepaid wallet plans</Label>
                <Switch
                  checked={settings.earnPointsOnPrepaidPlan !== false}
                  disabled={!settings.enabled}
                  onCheckedChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      earnPointsOnPrepaidPlan: !!v,
                      earnOnWalletPurchaseLines: !!v,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Earn — rupees per step</Label>
              <Input
                type="number"
                min={1}
                value={settings.earnRupeeStep}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, earnRupeeStep: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Earn — points per step</Label>
              <Input
                type="number"
                min={0}
                value={settings.earnPointsStep}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, earnPointsStep: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Redeem — points per step</Label>
              <Input
                type="number"
                min={1}
                value={settings.redeemPointsStep}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, redeemPointsStep: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Redeem — rupee discount per step</Label>
              <Input
                type="number"
                min={0}
                value={settings.redeemRupeeStep}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, redeemRupeeStep: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Minimum points to redeem</Label>
              <Input
                type="number"
                min={0}
                value={settings.minRedeemPoints}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, minRedeemPoints: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Max % of bill redeemable</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={settings.maxRedeemPercentOfBill}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    maxRedeemPercentOfBill: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>First visit bonus (points)</Label>
              <Input
                type="number"
                min={0}
                value={settings.firstVisitBonusPoints}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    firstVisitBonusPoints: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Birthday bonus (points)</Label>
              <Input
                type="number"
                min={0}
                value={settings.birthdayBonusPoints}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    birthdayBonusPoints: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Birthday window (± days)</Label>
              <Input
                type="number"
                min={0}
                max={15}
                value={settings.birthdayBonusWindowDays}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    birthdayBonusWindowDays: Math.min(15, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
              />
            </div>
          </div>

          <Button onClick={() => void save()} disabled={saving} className="min-w-[140px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
