"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Receipt, Settings, Lock } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { SettingsAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"

export function POSSettings() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission("pos_settings", "edit")
  const canManage = hasPermission("pos_settings", "manage")
  const { toast } = useToast()
  const [invoicePrefix, setInvoicePrefix] = useState("INV")
  const [autoReset, setAutoReset] = useState(false)
  const [currentReceiptNumber, setCurrentReceiptNumber] = useState(1)
  const [isResetting, setIsResetting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Load POS settings on component mount
  useEffect(() => {
    loadPOSSettings()
  }, [])

  const loadPOSSettings = async () => {
    try {
      const response = await SettingsAPI.getPOSSettings()
      if (response.success) {
        setInvoicePrefix(response.data.invoicePrefix || "INV")
        setAutoReset(response.data.autoResetReceipt || false)
        setCurrentReceiptNumber(response.data.receiptNumber || 1)
      }
    } catch (error) {
      console.error('Error loading POS settings:', error)
      toast({
        title: "Error",
        description: "Failed to load POS settings",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetSequence = async () => {
    setIsResetting(true)
    try {
      const response = await SettingsAPI.resetReceiptSequence()
      if (response.success) {
        setCurrentReceiptNumber(1)
        toast({
          title: "Success",
          description: "Invoice sequence has been reset to 1.",
        })
      } else {
        throw new Error(response.error || 'Failed to reset sequence')
      }
    } catch (error: any) {
      console.error('Error resetting sequence:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to reset invoice sequence. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsResetting(false)
    }
  }

  const handleSavePrefix = async () => {
    setIsSaving(true)
    try {
      const response = await SettingsAPI.updatePOSSettings({
        invoicePrefix,
        autoResetReceipt: autoReset
      })
      
      if (response.success) {
        toast({
          title: "Success",
          description: "POS settings have been saved successfully.",
        })
      } else {
        throw new Error(response.error || 'Failed to save settings')
      }
    } catch (error: any) {
      console.error('Error saving POS settings:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to save POS settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleAutoResetChange = async (checked: boolean) => {
    setAutoReset(checked)
    try {
      const response = await SettingsAPI.updatePOSSettings({
        invoicePrefix,
        autoResetReceipt: checked
      })
      
      if (response.success) {
        toast({
          title: "Success",
          description: `Auto reset has been ${checked ? "enabled" : "disabled"}.`,
        })
      } else {
        throw new Error(response.error || 'Failed to update auto reset')
      }
    } catch (error: any) {
      console.error('Error updating auto reset:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to update auto reset setting. Please try again.",
        variant: "destructive",
      })
      // Revert the change if API call fails
      setAutoReset(!checked)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Receipt className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">POS Settings</h2>
                <p className="text-slate-600">Loading POS settings...</p>
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
              <Receipt className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">POS Settings</h2>
              <p className="text-slate-600">Configure point of sale settings and invoice management</p>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Sequence Management */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center">
              <Receipt className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Invoice Sequence</h3>
              <p className="text-slate-600 text-sm">Configure invoice sequence number</p>
            </div>
          </div>
          
          <div className="space-y-6">
            {/* Current Receipt Number */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div className="space-y-1">
                <h3 className="font-semibold text-slate-800">Current receipt number</h3>
                <p className="text-sm text-slate-600">
                  Next receipt will be: {invoicePrefix}-{currentReceiptNumber.toString().padStart(6, '0')}
                </p>
              </div>
            </div>

            <Separator />

            {/* Reset Invoice Sequence Instantly */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div className="space-y-1">
                <h3 className="font-semibold text-slate-800">Reset invoice sequence instantly</h3>
                <p className="text-sm text-slate-600">
                  Instantly reset the invoice sequence number to 1.
                </p>
              </div>
              <Button
                onClick={handleResetSequence}
                disabled={isResetting || !canManage}
                title={!canManage ? "You don't have permission to reset the invoice sequence" : undefined}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium disabled:opacity-60"
              >
                {isResetting ? "Resetting..." : "Reset Now"}
              </Button>
            </div>

            <Separator />

            {/* Reset Invoice Sequence Automatically */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div className="space-y-1">
                <h3 className="font-semibold text-slate-800">Reset invoice sequence automatically</h3>
                <p className="text-sm text-slate-600">
                  Automatically reset the invoice sequence number to 1 at the beginning of each month or year.
                </p>
              </div>
              <Switch
                checked={autoReset}
                onCheckedChange={handleAutoResetChange}
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Custom Prefix Configuration */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-lg flex items-center justify-center">
              <Settings className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Custom Prefix</h3>
              <p className="text-slate-600 text-sm">Configure custom prefix on the invoice number</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="invoice-prefix" className="text-sm font-medium text-slate-700">Invoice prefix</Label>
              <Input
                id="invoice-prefix"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                placeholder="Enter invoice prefix"
                disabled={!canEdit}
                className="max-w-md border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-sm text-slate-600">
                Example: Using "{invoicePrefix}" as the prefix will display as "{invoicePrefix}-000001" for the first receipt.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!canEdit && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" /> You don't have permission to edit POS settings
                </span>
              )}
              <Button
                onClick={handleSavePrefix}
                disabled={isSaving || !canEdit}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 