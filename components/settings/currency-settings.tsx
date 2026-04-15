"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { SettingsAPI } from "@/lib/api"
import { useInvalidatePaymentSettings } from "@/lib/queries/payment-settings"
import { DollarSign } from "lucide-react"

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD ($)", symbol: "$" },
  { value: "EUR", label: "EUR (€)", symbol: "€" },
  { value: "GBP", label: "GBP (£)", symbol: "£" },
  { value: "INR", label: "INR (₹)", symbol: "₹" },
  { value: "JPY", label: "JPY (¥)", symbol: "¥" },
  { value: "CAD", label: "CAD (C$)", symbol: "C$" },
  { value: "AUD", label: "AUD (A$)", symbol: "A$" },
  { value: "CHF", label: "CHF (CHF)", symbol: "CHF" },
  { value: "CNY", label: "CNY (¥)", symbol: "¥" },
  { value: "SGD", label: "SGD (S$)", symbol: "S$" },
  { value: "HKD", label: "HKD (HK$)", symbol: "HK$" },
  { value: "NZD", label: "NZD (NZ$)", symbol: "NZ$" },
  { value: "KRW", label: "KRW (₩)", symbol: "₩" },
  { value: "MXN", label: "MXN (MX$)", symbol: "MX$" },
  { value: "BRL", label: "BRL (R$)", symbol: "R$" },
  { value: "RUB", label: "RUB (₽)", symbol: "₽" },
  { value: "ZAR", label: "ZAR (R)", symbol: "R" },
  { value: "SEK", label: "SEK (kr)", symbol: "kr" },
  { value: "NOK", label: "NOK (kr)", symbol: "kr" },
  { value: "DKK", label: "DKK (kr)", symbol: "kr" },
  { value: "PLN", label: "PLN (zł)", symbol: "zł" },
  { value: "CZK", label: "CZK (Kč)", symbol: "Kč" },
  { value: "HUF", label: "HUF (Ft)", symbol: "Ft" },
  { value: "ILS", label: "ILS (₪)", symbol: "₪" },
  { value: "AED", label: "AED (د.إ)", symbol: "د.إ" },
  { value: "SAR", label: "SAR (﷼)", symbol: "﷼" },
  { value: "QAR", label: "QAR (﷼)", symbol: "﷼" },
  { value: "KWD", label: "KWD (د.ك)", symbol: "د.ك" },
  { value: "BHD", label: "BHD (د.ب)", symbol: "د.ب" },
  { value: "OMR", label: "OMR (﷼)", symbol: "﷼" },
  { value: "JOD", label: "JOD (د.ا)", symbol: "د.ا" },
  { value: "LBP", label: "LBP (ل.ل)", symbol: "ل.ل" },
  { value: "EGP", label: "EGP (£)", symbol: "£" },
  { value: "TRY", label: "TRY (₺)", symbol: "₺" },
  { value: "THB", label: "THB (฿)", symbol: "฿" },
  { value: "MYR", label: "MYR (RM)", symbol: "RM" },
  { value: "IDR", label: "IDR (Rp)", symbol: "Rp" },
  { value: "PHP", label: "PHP (₱)", symbol: "₱" },
  { value: "VND", label: "VND (₫)", symbol: "₫" },
  { value: "TWD", label: "TWD (NT$)", symbol: "NT$" },
  { value: "PKR", label: "PKR (₨)", symbol: "₨" },
  { value: "BDT", label: "BDT (৳)", symbol: "৳" },
  { value: "LKR", label: "LKR (₨)", symbol: "₨" },
  { value: "NPR", label: "NPR (₨)", symbol: "₨" },
  { value: "MMK", label: "MMK (K)", symbol: "K" },
  { value: "KHR", label: "KHR (៛)", symbol: "៛" },
  { value: "LAK", label: "LAK (₭)", symbol: "₭" },
  { value: "BND", label: "BND (B$)", symbol: "B$" },
  { value: "FJD", label: "FJD (FJ$)", symbol: "FJ$" },
  { value: "PGK", label: "PGK (K)", symbol: "K" },
  { value: "SBD", label: "SBD (SI$)", symbol: "SI$" },
  { value: "VUV", label: "VUV (Vt)", symbol: "Vt" },
  { value: "WST", label: "WST (WS$)", symbol: "WS$" },
  { value: "TOP", label: "TOP (T$)", symbol: "T$" },
  { value: "XPF", label: "XPF (₣)", symbol: "₣" }
]

export function CurrencySettings() {
  const [settings, setSettings] = useState({
    currency: "INR",
    enableCurrency: true,
  })

  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()
  const invalidatePaymentSettings = useInvalidatePaymentSettings()

  // Load currency settings on component mount
  useEffect(() => {
    loadCurrencySettings()
  }, [])

  const loadCurrencySettings = async () => {
    setIsLoading(true)
    try {
      const response = await SettingsAPI.getPaymentSettings()
      if (response.success) {
        setSettings({
          currency: response.data.currency || "INR",
          enableCurrency: response.data.enableCurrency !== false,
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load currency settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await SettingsAPI.updatePaymentSettings({
        currency: settings.currency,
        enableCurrency: settings.enableCurrency,
      })

      if (response.success) {
        invalidatePaymentSettings()
        toast({
          title: "Success",
          description: "Currency settings updated successfully!",
        })
      } else {
        throw new Error(response.error || "Failed to update currency settings")
      }
    } catch (error) {
      console.error("Error updating currency settings:", error)
      toast({
        title: "Error",
        description: "Failed to update currency settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const selectedCurrency = CURRENCY_OPTIONS.find(option => option.value === settings.currency)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading currency settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Currency Settings</h3>
              <p className="text-slate-600 text-sm">Configure your default currency and formatting</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-slate-700">Enable Currency</Label>
                <p className="text-sm text-slate-600">Show currency symbols and formatting throughout the application</p>
              </div>
              <Switch
                checked={settings.enableCurrency}
                onCheckedChange={(checked) => setSettings({ ...settings, enableCurrency: checked })}
              />
            </div>
            
            {settings.enableCurrency && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currency" className="text-sm font-medium text-slate-700">
                    Default Currency
                  </Label>
                  <Select
                    value={settings.currency}
                    onValueChange={(value) => setSettings({ ...settings, currency: value })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-slate-500">
                    Selected: {selectedCurrency?.label} - Symbol: {selectedCurrency?.symbol}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="px-8"
        >
          {isSaving ? "Saving..." : "Save Currency Settings"}
        </Button>
      </div>
    </div>
  )
}
