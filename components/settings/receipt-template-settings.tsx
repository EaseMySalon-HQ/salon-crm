"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { FileText, Lock } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { SettingsAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"

interface ReceiptTemplate {
  headerText: string
  footerText: string
  showLogo: boolean
  showGstNumber: boolean
  showStaffName: boolean
  showClientInfo: boolean
  accentColor: string
}

const DEFAULT_TEMPLATE: ReceiptTemplate = {
  headerText: "",
  footerText: "",
  showLogo: true,
  showGstNumber: true,
  showStaffName: true,
  showClientInfo: true,
  accentColor: "",
}

/**
 * Custom receipt template editor. Rendered behind a FeatureGate for the
 * `custom_receipt_templates` plan feature; the backend gates the same routes.
 */
export function ReceiptTemplateSettings() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission("pos_settings", "edit")
  const { toast } = useToast()
  const [template, setTemplate] = useState<ReceiptTemplate>(DEFAULT_TEMPLATE)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await SettingsAPI.getReceiptTemplate()
        if (active && res.success && res.data) {
          setTemplate({ ...DEFAULT_TEMPLATE, ...res.data })
        }
      } catch (error) {
        console.error("Error loading receipt template:", error)
      } finally {
        if (active) setIsLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const update = <K extends keyof ReceiptTemplate>(key: K, value: ReceiptTemplate[K]) => {
    setTemplate((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await SettingsAPI.updateReceiptTemplate(template)
      if (res.success) {
        toast({ title: "Saved", description: "Receipt template updated successfully." })
      } else {
        throw new Error(res.error || "Failed to save receipt template")
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to save receipt template.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <p className="text-slate-600">Loading receipt template...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg flex items-center justify-center">
            <FileText className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Custom Receipt Template</h3>
            <p className="text-slate-600 text-sm">
              Personalise the header, footer and sections shown on customer receipts
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="receipt-header" className="text-sm font-medium text-slate-700">
              Header text
            </Label>
            <Textarea
              id="receipt-header"
              value={template.headerText}
              onChange={(e) => update("headerText", e.target.value)}
              placeholder="e.g. Thank you for visiting Glamour Salon"
              maxLength={500}
              disabled={!canEdit}
              className="max-w-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="receipt-footer" className="text-sm font-medium text-slate-700">
              Footer text
            </Label>
            <Textarea
              id="receipt-footer"
              value={template.footerText}
              onChange={(e) => update("footerText", e.target.value)}
              placeholder="e.g. Follow us @glamoursalon for offers"
              maxLength={500}
              disabled={!canEdit}
              className="max-w-xl"
            />
          </div>

          <div className="space-y-2 max-w-xs">
            <Label htmlFor="receipt-accent" className="text-sm font-medium text-slate-700">
              Accent color (hex)
            </Label>
            <Input
              id="receipt-accent"
              value={template.accentColor}
              onChange={(e) => update("accentColor", e.target.value)}
              placeholder="#7c3aed"
              disabled={!canEdit}
            />
          </div>

          <Separator />

          {[
            { key: "showLogo" as const, label: "Show business logo" },
            { key: "showGstNumber" as const, label: "Show GST number" },
            { key: "showStaffName" as const, label: "Show staff name" },
            { key: "showClientInfo" as const, label: "Show client information" },
          ].map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between p-4 bg-slate-50 rounded-xl"
            >
              <span className="font-medium text-slate-800">{row.label}</span>
              <Switch
                checked={template[row.key]}
                onCheckedChange={(checked) => update(row.key, checked)}
                disabled={!canEdit}
              />
            </div>
          ))}

          <div className="flex items-center gap-3">
            {!canEdit && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> You don't have permission to edit receipt settings
              </span>
            )}
            <Button
              onClick={handleSave}
              disabled={isSaving || !canEdit}
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-2.5 rounded-lg font-medium disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
