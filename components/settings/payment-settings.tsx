"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { SettingsAPI } from "@/lib/api"
import { useInvalidatePaymentSettings } from "@/lib/queries/payment-settings"
import {
  mergePaymentConfiguration,
  type PaymentConfiguration,
} from "@/lib/payment-redemption-eligibility"
import { Settings, Wallet, Gift, Receipt } from "lucide-react"

type WalletFlags = PaymentConfiguration["walletRedemption"]

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
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <Label className="text-sm text-slate-700 font-normal cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

export function PaymentSettings() {
  const [settings, setSettings] = useState({
    processingFee: "2.9",
    enableProcessingFees: true,
    paymentConfiguration: mergePaymentConfiguration(null),
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()
  const invalidatePaymentSettings = useInvalidatePaymentSettings()

  useEffect(() => {
    void loadPaymentSettings()
  }, [])

  const loadPaymentSettings = async () => {
    setIsLoading(true)
    try {
      const response = await SettingsAPI.getPaymentSettings()
      if (response.success && response.data) {
        setSettings({
          processingFee: response.data.processingFee?.toString() || "2.9",
          enableProcessingFees: response.data.enableProcessingFees !== false,
          paymentConfiguration: mergePaymentConfiguration(response.data.paymentConfiguration),
        })
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to load payment settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const patchPaymentConfig = (patch: Partial<PaymentConfiguration>) => {
    setSettings((s) => ({
      ...s,
      paymentConfiguration: mergePaymentConfiguration({ ...s.paymentConfiguration, ...patch }),
    }))
  }

  const patchWallet = (patch: Partial<WalletFlags>) => {
    setSettings((s) => ({
      ...s,
      paymentConfiguration: mergePaymentConfiguration({
        ...s.paymentConfiguration,
        walletRedemption: { ...s.paymentConfiguration.walletRedemption, ...patch },
      }),
    }))
  }

  const patchReward = (patch: Partial<WalletFlags>) => {
    setSettings((s) => ({
      ...s,
      paymentConfiguration: mergePaymentConfiguration({
        ...s.paymentConfiguration,
        rewardPointRedemption: { ...s.paymentConfiguration.rewardPointRedemption, ...patch },
      }),
    }))
  }

  const patchBilling = (patch: Partial<PaymentConfiguration["billingRedemption"]>) => {
    setSettings((s) => ({
      ...s,
      paymentConfiguration: mergePaymentConfiguration({
        ...s.paymentConfiguration,
        billingRedemption: { ...s.paymentConfiguration.billingRedemption, ...patch },
      }),
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await SettingsAPI.updatePaymentSettings({
        processingFee: parseFloat(settings.processingFee),
        enableProcessingFees: settings.enableProcessingFees,
        paymentConfiguration: settings.paymentConfiguration,
      })

      if (response.success) {
        invalidatePaymentSettings()
        toast({
          title: "Payment settings saved",
          description: "Your payment configuration has been updated.",
        })
      } else {
        throw new Error(response.error || "Failed to save settings")
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to save payment settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const pc = settings.paymentConfiguration

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Settings className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Payment Configuration</h2>
                <p className="text-slate-600">Loading payment settings...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Settings className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Payment Configuration</h2>
              <p className="text-slate-600">Configure payment methods, tax settings, and billing options</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center">
                <Settings className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Payment Processing</h3>
                <p className="text-slate-600 text-sm">Configure payment processing fees and methods</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-slate-700">Enable Processing Fees</Label>
                  <p className="text-sm text-slate-600">Add processing fees to card payments</p>
                </div>
                <Switch
                  checked={settings.enableProcessingFees}
                  onCheckedChange={(checked) => setSettings({ ...settings, enableProcessingFees: checked })}
                />
              </div>

              {settings.enableProcessingFees && (
                <div className="space-y-3">
                  <Label htmlFor="processingFee" className="text-sm font-medium text-slate-700">
                    Processing Fee (%)
                  </Label>
                  <Input
                    id="processingFee"
                    type="number"
                    step="0.01"
                    value={settings.processingFee}
                    onChange={(e) => setSettings({ ...settings, processingFee: e.target.value })}
                    className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="text-sm text-slate-500">
                    This fee will be added to card payments to cover processing costs
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Redemption Rules */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-to-r from-violet-100 to-indigo-100 rounded-lg flex items-center justify-center">
                <Receipt className="h-5 w-5 text-violet-700" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Redemption Rules</h3>
                <p className="text-slate-600 text-sm">
                  Control where prepaid wallet and reward points can reduce the bill. Applies per salon.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <Receipt className="h-4 w-4 text-slate-600" />
                  <h4 className="text-sm font-semibold text-slate-800">Billing redemption</h4>
                </div>
                <ToggleRow
                  label="Allow redemption during billing"
                  checked={pc.billingRedemption.allowRedemptionInBilling !== false}
                  onCheckedChange={(v) => patchBilling({ allowRedemptionInBilling: v })}
                />
                <ToggleRow
                  label="Allow wallet and reward points both to be redeemed while billing"
                  checked={pc.billingRedemption.allowWalletAndPointsTogether !== false}
                  disabled={pc.billingRedemption.allowRedemptionInBilling === false}
                  onCheckedChange={(v) => patchBilling({ allowWalletAndPointsTogether: v })}
                />
                <p className="text-xs text-slate-500 mt-2">
                  When the second option is off, staff must choose either wallet or reward points per bill at
                  checkout (Quick Sale).
                </p>
              </div>

              <div className="rounded-xl border border-amber-200/80 p-4 bg-amber-50/20">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="h-4 w-4 text-amber-800" />
                  <h4 className="text-sm font-semibold text-slate-800">Prepaid wallet redemption</h4>
                </div>
                <ToggleRow
                  label="Allow wallet redemption (master)"
                  checked={pc.walletRedemption.enabled !== false}
                  onCheckedChange={(v) => patchWallet({ enabled: v })}
                />
                <div className={pc.walletRedemption.enabled === false ? "opacity-50 pointer-events-none" : ""}>
                  <ToggleRow
                    label="Allow wallet redemption for Services"
                    checked={pc.walletRedemption.services !== false}
                    onCheckedChange={(v) => patchWallet({ services: v })}
                  />
                  <ToggleRow
                    label="Allow wallet redemption for Products"
                    checked={pc.walletRedemption.products !== false}
                    onCheckedChange={(v) => patchWallet({ products: v })}
                  />
                  <ToggleRow
                    label="Allow wallet redemption for Packages"
                    checked={pc.walletRedemption.packages !== false}
                    onCheckedChange={(v) => patchWallet({ packages: v })}
                  />
                  <ToggleRow
                    label="Allow wallet redemption for Memberships"
                    checked={pc.walletRedemption.memberships !== false}
                    onCheckedChange={(v) => patchWallet({ memberships: v })}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-violet-200/80 p-4 bg-violet-50/20">
                <div className="flex items-center gap-2 mb-3">
                  <Gift className="h-4 w-4 text-violet-800" />
                  <h4 className="text-sm font-semibold text-slate-800">Reward points redemption</h4>
                </div>
                <ToggleRow
                  label="Allow reward point redemption (master)"
                  checked={pc.rewardPointRedemption.enabled !== false}
                  onCheckedChange={(v) => patchReward({ enabled: v })}
                />
                <div
                  className={
                    pc.rewardPointRedemption.enabled === false ? "opacity-50 pointer-events-none" : ""
                  }
                >
                  <ToggleRow
                    label="Allow reward point redemption for Services"
                    checked={pc.rewardPointRedemption.services !== false}
                    onCheckedChange={(v) => patchReward({ services: v })}
                  />
                  <ToggleRow
                    label="Allow reward point redemption for Products"
                    checked={pc.rewardPointRedemption.products !== false}
                    onCheckedChange={(v) => patchReward({ products: v })}
                  />
                  <ToggleRow
                    label="Allow reward point redemption for Packages"
                    checked={pc.rewardPointRedemption.packages !== false}
                    onCheckedChange={(v) => patchReward({ packages: v })}
                  />
                  <ToggleRow
                    label="Allow reward point redemption for Memberships"
                    checked={pc.rewardPointRedemption.memberships !== false}
                    onCheckedChange={(v) => patchReward({ memberships: v })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
