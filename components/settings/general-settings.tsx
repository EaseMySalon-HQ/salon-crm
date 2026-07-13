"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { SettingsAPI } from "@/lib/api"
import {
  DEFAULT_RECEIPT_PAPER_SIZE,
  RECEIPT_PAPER_SIZE_OPTIONS,
  type ReceiptPaperSize,
  isReceiptPaperSize,
} from "@/lib/receipt-paper-size"
import { Settings, Lock, Printer, Eye } from "lucide-react"
import { cn } from "@/lib/utils"
import { ReceiptTemplatePreviewDialog } from "./receipt-template-preview"

export function GeneralSettings() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission("general_settings", "edit")
  const [settings, setSettings] = useState({
    language: "en",
    timezone: "Asia/Kolkata",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "12h",
    currency: "INR",
    receiptPaperSize: DEFAULT_RECEIPT_PAPER_SIZE as ReceiptPaperSize,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false
    async function loadSettings() {
      setIsFetching(true)
      try {
        const response = await SettingsAPI.getGeneralSettings()
        if (cancelled) return
        const data = response?.data || {}
        setSettings((prev) => ({
          ...prev,
          receiptPaperSize: isReceiptPaperSize(data.receiptPaperSize)
            ? data.receiptPaperSize
            : DEFAULT_RECEIPT_PAPER_SIZE,
        }))
      } catch {
        if (!cancelled) {
          toast({
            title: "Could not load settings",
            description: "Using default receipt template.",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setIsFetching(false)
      }
    }
    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [toast])

  const handleSave = async () => {
    setIsLoading(true)
    try {
      const response = await SettingsAPI.updateGeneralSettings({
        receiptPaperSize: settings.receiptPaperSize,
      })
      if (!response?.success) {
        throw new Error(response?.error || "Failed to save settings")
      }
      toast({
        title: "Settings saved",
        description: "Receipt template updated successfully.",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to save settings. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Settings className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">General Settings</h2>
              <p className="text-slate-600">Basic application preferences and configurations</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center">
                <Settings className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Localization</h3>
                <p className="text-slate-600 text-sm">Configure language, timezone, and format preferences</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="language" className="text-sm font-medium text-slate-700">
                    Language
                  </Label>
                  <Select
                    value={settings.language}
                    onValueChange={(value) => setSettings({ ...settings, language: value })}
                  >
                    <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="timezone" className="text-sm font-medium text-slate-700">
                    Timezone
                  </Label>
                  <div
                    id="timezone"
                    className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-muted/40 px-3 text-sm text-slate-700"
                  >
                    IST (India Standard Time — Asia/Kolkata)
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="dateFormat" className="text-sm font-medium text-slate-700">
                    Date Format
                  </Label>
                  <Select
                    value={settings.dateFormat}
                    onValueChange={(value) => setSettings({ ...settings, dateFormat: value })}
                  >
                    <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="timeFormat" className="text-sm font-medium text-slate-700">
                    Time Format
                  </Label>
                  <Select
                    value={settings.timeFormat}
                    onValueChange={(value) => setSettings({ ...settings, timeFormat: value })}
                  >
                    <SelectTrigger className="border-slate-200 focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12h">12-hour</SelectItem>
                      <SelectItem value="24h">24-hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border">
          <div className="p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-gradient-to-r from-emerald-100 to-teal-100 rounded-lg flex items-center justify-center shrink-0">
                  <Printer className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-slate-800">Receipt Templates</h3>
                  <p className="text-slate-600 text-sm">
                    Choose one template for public receipts and printing. Only one can be active.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreviewOpen(true)}
                disabled={isFetching}
                className="shrink-0 border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Eye className="h-4 w-4 mr-2" />
                Show Preview
              </Button>
            </div>

            <RadioGroup
              value={settings.receiptPaperSize}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  receiptPaperSize: value as ReceiptPaperSize,
                })
              }
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              disabled={!canEdit || isFetching}
            >
              {RECEIPT_PAPER_SIZE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  htmlFor={`receipt-template-${option.value}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                    settings.receiptPaperSize === option.value
                      ? "border-blue-500 bg-blue-50/60"
                      : "border-slate-200 hover:border-slate-300",
                    (!canEdit || isFetching) && "cursor-not-allowed opacity-60"
                  )}
                >
                  <RadioGroupItem
                    value={option.value}
                    id={`receipt-template-${option.value}`}
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <div className="font-medium text-slate-800">{option.label}</div>
                    <div className="text-sm text-slate-600">{option.description}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      {option.category === "thermal" ? "Thermal printer" : "Normal printer"}
                    </div>
                  </div>
                </label>
              ))}
            </RadioGroup>

            <ReceiptTemplatePreviewDialog
              open={previewOpen}
              onOpenChange={setPreviewOpen}
              paperSize={settings.receiptPaperSize}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end items-center gap-3">
        {!canEdit && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> You don&apos;t have permission to edit general settings
          </span>
        )}
        <Button
          onClick={handleSave}
          disabled={isLoading || isFetching || !canEdit}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium disabled:opacity-60"
        >
          {isLoading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
