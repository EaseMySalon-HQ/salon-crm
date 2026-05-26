"use client"

import { useEffect, useState } from "react"
import { Loader2, Gift } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RewardPointsAPI, type RewardPointsSettings } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { RewardPointsLogsTab } from "./reward-points-logs-tab"
import {
  mergePaymentConfiguration,
  type PaymentConfiguration,
} from "@/lib/payment-redemption-eligibility"
import { useInvalidatePaymentSettings } from "@/lib/queries/payment-settings"

const defaults: RewardPointsSettings = {
  enabled: false,
  earnRupeeStep: 100,
  earnPointsStep: 10,
  redeemPointsStep: 100,
  redeemRupeeStep: 10,
  minRedeemPoints: 100,
  minBillAmountForRedemption: 0,
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

const tabTriggerClass =
  "rounded-lg px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-violet-900 data-[state=active]:shadow-sm data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:text-slate-900"

type RewardRedemptionFlags = PaymentConfiguration["rewardPointRedemption"]

function ToggleRow({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm">
      <Label className="text-sm font-normal text-slate-700 cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

export function RewardPointsProgramSettings() {
  const { toast } = useToast()
  const invalidatePaymentSettings = useInvalidatePaymentSettings()
  const [loading, setLoading] = useState(true)
  const [savingProgram, setSavingProgram] = useState(false)
  const [savingRedemption, setSavingRedemption] = useState(false)
  const [settings, setSettings] = useState<RewardPointsSettings>(defaults)
  const [rewardPointRedemption, setRewardPointRedemption] = useState<RewardRedemptionFlags>(
    mergePaymentConfiguration(null).rewardPointRedemption
  )

  const load = async () => {
    setLoading(true)
    try {
      const res = await RewardPointsAPI.getSettings()
      if (res.success && res.data) {
        const { rewardPointRedemption: rp, ...rest } = res.data
        setSettings({ ...defaults, ...rest })
        if (rp) {
          setRewardPointRedemption(
            mergePaymentConfiguration({ rewardPointRedemption: rp }).rewardPointRedemption
          )
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const saveSettings = async (which: "program" | "redemption") => {
    const setSaving = which === "program" ? setSavingProgram : setSavingRedemption
    setSaving(true)
    try {
      const body =
        which === "program"
          ? {
              enabled: settings.enabled,
              earnRupeeStep: settings.earnRupeeStep,
              earnPointsStep: settings.earnPointsStep,
              earnOnWalletPurchaseLines: settings.earnOnWalletPurchaseLines,
              earnPointsOnServices: settings.earnPointsOnServices,
              earnPointsOnProducts: settings.earnPointsOnProducts,
              earnPointsOnMembershipPurchases: settings.earnPointsOnMembershipPurchases,
              earnPointsOnPrepaidPlan: settings.earnPointsOnPrepaidPlan,
              earnPointsOnPackages: settings.earnPointsOnPackages,
              firstVisitBonusPoints: settings.firstVisitBonusPoints,
              birthdayBonusPoints: settings.birthdayBonusPoints,
              birthdayBonusWindowDays: settings.birthdayBonusWindowDays,
            }
          : {
              redeemPointsStep: settings.redeemPointsStep,
              redeemRupeeStep: settings.redeemRupeeStep,
              minRedeemPoints: settings.minRedeemPoints,
              minBillAmountForRedemption: settings.minBillAmountForRedemption,
              maxRedeemPercentOfBill: settings.maxRedeemPercentOfBill,
              rewardPointRedemption,
            }

      const res = await RewardPointsAPI.updateSettings(body)
      if (res.success && res.data) {
        const { rewardPointRedemption: rp, ...rest } = res.data
        setSettings({ ...defaults, ...rest })
        if (rp) {
          setRewardPointRedemption(
            mergePaymentConfiguration({ rewardPointRedemption: rp }).rewardPointRedemption
          )
        }
        invalidatePaymentSettings()
        toast({
          title: which === "program" ? "Program rules saved" : "Redemption rules saved",
        })
      } else {
        toast({ title: res.message || "Failed to save", variant: "destructive" })
      }
    } finally {
      setSaving(false)
    }
  }

  const patchRewardRedemption = (patch: Partial<RewardRedemptionFlags>) => {
    setRewardPointRedemption((prev) => ({ ...prev, ...patch }))
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

      <Tabs defaultValue="program" className="w-full">
        <TabsList className="grid h-auto w-full max-w-none grid-cols-3 gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1.5 shadow-inner">
          <TabsTrigger value="program" className={tabTriggerClass}>
            Program rules
          </TabsTrigger>
          <TabsTrigger value="redemption" className={tabTriggerClass}>
            Redemption rules
          </TabsTrigger>
          <TabsTrigger value="logs" className={tabTriggerClass}>
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="program" className="mt-8 focus-visible:outline-none">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Program rules</CardTitle>
              <CardDescription>Configure earning rates, eligible line types, and optional visit bonuses.</CardDescription>
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
                    Points are credited only from enabled line types on completed bills. Turning off a category excludes
                    its totals from the earning calculation.
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

              <Button
                onClick={() => void saveSettings("program")}
                disabled={savingProgram}
                className="min-w-[140px]"
              >
                {savingProgram ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save program rules"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="redemption" className="mt-8 focus-visible:outline-none">
          <Card className="border-slate-200/90 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/40 pb-4">
              <CardTitle className="text-lg text-slate-900">Redemption rules</CardTitle>
              <CardDescription>
                Configure how points convert to discounts, checkout limits, and which bill line types accept
                redemption.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-3">
                <div>
                  <Label className="text-base font-medium">Eligible line types</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Control which bill categories reward points can reduce at checkout.
                  </p>
                </div>
                <ToggleRow
                  label="Allow reward point redemption (master)"
                  checked={rewardPointRedemption.enabled !== false}
                  onCheckedChange={(v) => patchRewardRedemption({ enabled: v })}
                />
                <div
                  className={
                    rewardPointRedemption.enabled === false ? "opacity-50 pointer-events-none space-y-3" : "space-y-3"
                  }
                >
                  <ToggleRow
                    label="Allow reward point redemption for Services"
                    checked={rewardPointRedemption.services !== false}
                    onCheckedChange={(v) => patchRewardRedemption({ services: v })}
                  />
                  <ToggleRow
                    label="Allow reward point redemption for Products"
                    checked={rewardPointRedemption.products !== false}
                    onCheckedChange={(v) => patchRewardRedemption({ products: v })}
                  />
                  <ToggleRow
                    label="Allow reward point redemption for Packages"
                    checked={rewardPointRedemption.packages !== false}
                    onCheckedChange={(v) => patchRewardRedemption({ packages: v })}
                  />
                  <ToggleRow
                    label="Allow reward point redemption for Memberships"
                    checked={rewardPointRedemption.memberships !== false}
                    onCheckedChange={(v) => patchRewardRedemption({ memberships: v })}
                  />
                  <ToggleRow
                    label="Allow redemption on discounted items"
                    checked={rewardPointRedemption.allowOnDiscountedItems !== false}
                    onCheckedChange={(v) => patchRewardRedemption({ allowOnDiscountedItems: v })}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <Label className="text-base font-medium">Conversion &amp; thresholds</Label>
                <p className="mt-1 mb-4 text-xs text-muted-foreground">
                  Points-to-rupee rate and caps applied when staff redeem at billing.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
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
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
                    <Label>Minimum bill amount for redemption (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={settings.minBillAmountForRedemption}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          minBillAmountForRedemption: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">0 = no minimum.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Maximum redemption percentage (%)</Label>
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
                    <p className="text-xs text-muted-foreground">e.g. 20 = max 20% of bill.</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => void saveSettings("redemption")}
                disabled={savingRedemption}
                className="min-w-[140px]"
              >
                {savingRedemption ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save redemption rules"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-8 focus-visible:outline-none">
          <RewardPointsLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
