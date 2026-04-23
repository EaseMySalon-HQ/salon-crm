"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Save, RotateCcw, FileText } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"
import { InvoiceSettings } from "@/components/admin/admin-settings/invoice-settings"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

const PAGE_TITLE = "Invoice & GST"
const PAGE_DESC =
  "Tax-invoice issuer details and numbering controls for wallet recharges and plan billing"

export function FinanceInvoiceGstPage() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        credentials: "include",
        headers: adminRequestHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setSettings(data.data || {})
      }
    } catch (e) {
      console.error("Failed to load admin settings:", e)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleInvoiceChange = (invoice: object) => {
    setSettings((prev) => ({ ...prev, invoice }))
    setHasUnsavedChanges(true)
  }

  const handleSave = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}/admin/settings/invoice`, {
        method: "PUT",
        credentials: "include",
        headers: adminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(settings.invoice || {}),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          setSettings((prev) => ({ ...prev, invoice: data.data }))
        }
        setHasUnsavedChanges(false)
        toast({ title: "Settings saved", description: "Invoice & GST settings were updated." })
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Save failed")
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Please try again"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-8 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">Finance</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{PAGE_TITLE}</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-xl">{PAGE_DESC}</p>
        </div>
        <Badge
          variant="secondary"
          className="shrink-0 w-fit px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-800 border-0"
        >
          Global invoicing
        </Badge>
      </div>

      <Card className="rounded-xl border-slate-200/80 shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/30 px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-slate-900">
                <FileText className="h-5 w-5 text-emerald-600" />
                <CardTitle className="text-lg font-semibold">{PAGE_TITLE}</CardTitle>
              </div>
              <CardDescription className="text-sm text-slate-500 mt-1">{PAGE_DESC}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hasUnsavedChanges && (
                <Badge
                  variant="outline"
                  className="text-amber-600 border-amber-200 bg-amber-50"
                >
                  Unsaved changes
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm("Discard local edits and reload from server?")) {
                    setHasUnsavedChanges(false)
                    void loadSettings()
                  }
                }}
                disabled={isLoading}
                className="border-slate-200"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reload
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <InvoiceSettings
            settings={settings.invoice as object | undefined}
            onSettingsChange={handleInvoiceChange}
          />
        </CardContent>
        <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/30 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              loadSettings().then(() => setHasUnsavedChanges(false))
            }}
            disabled={isLoading}
            className="border-slate-200"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isLoading}
            className="bg-slate-900 hover:bg-slate-800 text-white"
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
