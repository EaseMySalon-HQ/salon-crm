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
import { Settings } from "lucide-react"

export function PaymentSettings() {
  const [settings, setSettings] = useState({
    processingFee: "2.9",
    enableProcessingFees: true,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()
  const invalidatePaymentSettings = useInvalidatePaymentSettings()

  // Load payment settings on component mount
  useEffect(() => {
    loadPaymentSettings()
  }, [])

  const loadPaymentSettings = async () => {
    setIsLoading(true)
    try {
      const response = await SettingsAPI.getPaymentSettings()
      if (response.success) {
        setSettings({
          processingFee: response.data.processingFee?.toString() || "2.9",
          enableProcessingFees: response.data.enableProcessingFees !== false,
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load payment settings. Please try again.",
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
        processingFee: parseFloat(settings.processingFee),
        enableProcessingFees: settings.enableProcessingFees,
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
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save payment settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

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
      {/* Header */}
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
        {/* Currency & Tax Card */}
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
                  <Label htmlFor="processingFee" className="text-sm font-medium text-slate-700">Processing Fee (%)</Label>
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

      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
