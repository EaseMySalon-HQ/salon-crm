"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  FileText,
  Building,
  Hash,
  RefreshCw,
  Send,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

interface InvoiceSeller {
  name: string
  address: string
  gstin: string
  state: string
  stateCode: string
  email: string
  phone: string
  website: string
}

interface InvoiceSettingsShape {
  seller: InvoiceSeller
  invoicePrefix: string
  gstRate: number
}

interface InvoiceCounter {
  key: string
  seq: number
  updatedAt?: string
  createdAt?: string
}

interface InvoiceSettingsProps {
  settings?: Partial<InvoiceSettingsShape>
  onSettingsChange: (settings: InvoiceSettingsShape) => void
}

// ──────────────────────────────────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: InvoiceSettingsShape = {
  seller: {
    name: "EaseMySalon",
    address: "",
    gstin: "",
    state: "",
    stateCode: "",
    email: "billing@easemysalon.in",
    phone: "",
    website: "https://easemysalon.in",
  },
  invoicePrefix: "EMS/WLT",
  gstRate: 0.18,
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export function InvoiceSettings({
  settings: propSettings,
  onSettingsChange,
}: InvoiceSettingsProps) {
  const { toast } = useToast()

  const [settings, setSettings] = useState<InvoiceSettingsShape>(() =>
    mergeWithDefaults(propSettings)
  )

  // Keep local state in sync when parent reloads (e.g. after save)
  useEffect(() => {
    if (propSettings) {
      setSettings(mergeWithDefaults(propSettings))
    }
  }, [propSettings])

  const updateSeller = (field: keyof InvoiceSeller, value: string) => {
    const next: InvoiceSettingsShape = {
      ...settings,
      seller: { ...settings.seller, [field]: value },
    }
    setSettings(next)
    onSettingsChange(next)
  }

  const updateTopLevel = <K extends keyof InvoiceSettingsShape>(
    field: K,
    value: InvoiceSettingsShape[K]
  ) => {
    const next: InvoiceSettingsShape = { ...settings, [field]: value }
    setSettings(next)
    onSettingsChange(next)
  }

  // ─── Counters ─────────────────────────────────────────────────────────
  const [counters, setCounters] = useState<InvoiceCounter[]>([])
  const [countersLoading, setCountersLoading] = useState(false)
  const [resetTarget, setResetTarget] = useState<InvoiceCounter | null>(null)
  const [resetSeq, setResetSeq] = useState("0")
  const [resetBusy, setResetBusy] = useState(false)

  const loadCounters = useCallback(async () => {
    setCountersLoading(true)
    try {
      const res = await fetch(
        `${API_URL}/admin/settings/invoice/counters`,
        {
          credentials: "include",
          headers: adminRequestHeaders(),
        }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json?.success && Array.isArray(json.data)) {
        setCounters(json.data)
      }
    } catch (err) {
      toast({
        title: "Couldn't load counters",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setCountersLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadCounters()
  }, [loadCounters])

  const handleResetConfirm = async () => {
    if (!resetTarget) return
    const seqNum = Number(resetSeq)
    if (!Number.isFinite(seqNum) || seqNum < 0 || !Number.isInteger(seqNum)) {
      toast({
        title: "Invalid sequence",
        description: "Sequence must be a non-negative integer.",
        variant: "destructive",
      })
      return
    }
    setResetBusy(true)
    try {
      const res = await fetch(
        `${API_URL}/admin/settings/invoice/counters/reset`,
        {
          method: "POST",
          credentials: "include",
          headers: adminRequestHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ key: resetTarget.key, seq: seqNum }),
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      toast({
        title: "Counter updated",
        description: `${resetTarget.key} now at ${seqNum}. Next invoice will use ${seqNum + 1}.`,
      })
      setResetTarget(null)
      setResetSeq("0")
      await loadCounters()
    } catch (err) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setResetBusy(false)
    }
  }

  // ─── Test send ────────────────────────────────────────────────────────
  const [testEmail, setTestEmail] = useState("")
  const [testBusy, setTestBusy] = useState(false)

  const handleTestSend = async () => {
    const email = testEmail.trim()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Enter a valid email address to receive the sample.",
        variant: "destructive",
      })
      return
    }
    setTestBusy(true)
    try {
      const res = await fetch(
        `${API_URL}/admin/settings/invoice/test-send`,
        {
          method: "POST",
          credentials: "include",
          headers: adminRequestHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ email }),
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      toast({
        title: "Sample invoice sent",
        description: `Delivered to ${email}. Check the inbox shortly.`,
      })
    } catch (err) {
      toast({
        title: "Couldn't send sample",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setTestBusy(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────

  const gstRatePercent = Math.round((settings.gstRate ?? 0) * 10000) / 100

  return (
    <div className="space-y-6">
      {/* Seller details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5 text-indigo-600" />
            <span>Invoice issuer (seller)</span>
          </CardTitle>
          <CardDescription>
            Appears as the seller on every GST invoice generated for wallet
            recharges. Save changes above; they apply to all invoices issued
            from that point forward.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-seller-name">Legal name</Label>
              <Input
                id="invoice-seller-name"
                value={settings.seller.name}
                placeholder="EaseMySalon"
                onChange={(e) => updateSeller("name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-seller-gstin">GSTIN</Label>
              <Input
                id="invoice-seller-gstin"
                value={settings.seller.gstin}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                onChange={(e) =>
                  updateSeller("gstin", e.target.value.toUpperCase())
                }
              />
              <p className="text-xs text-slate-500">
                15 characters. Leave blank if not registered.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-seller-address">Registered address</Label>
            <Textarea
              id="invoice-seller-address"
              value={settings.seller.address}
              placeholder={"123 MG Road\nBengaluru - 560001"}
              rows={3}
              onChange={(e) => updateSeller("address", e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Each line will appear on its own row in the invoice header.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-seller-state">State</Label>
              <Input
                id="invoice-seller-state"
                value={settings.seller.state}
                placeholder="Karnataka"
                onChange={(e) => updateSeller("state", e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Determines whether CGST+SGST or IGST is charged to each buyer.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-seller-state-code">State code</Label>
              <Input
                id="invoice-seller-state-code"
                value={settings.seller.stateCode}
                placeholder="29"
                maxLength={2}
                onChange={(e) => updateSeller("stateCode", e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Numeric GST state code (e.g. Karnataka = 29).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-seller-email">Billing email</Label>
              <Input
                id="invoice-seller-email"
                type="email"
                value={settings.seller.email}
                placeholder="billing@example.com"
                onChange={(e) => updateSeller("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-seller-phone">Phone</Label>
              <Input
                id="invoice-seller-phone"
                value={settings.seller.phone}
                placeholder="+91 98765 43210"
                onChange={(e) => updateSeller("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-seller-website">Website</Label>
              <Input
                id="invoice-seller-website"
                value={settings.seller.website}
                placeholder="https://easemysalon.in"
                onChange={(e) => updateSeller("website", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Numbering + GST */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-indigo-600" />
            <span>Numbering &amp; tax rate</span>
          </CardTitle>
          <CardDescription>
            Controls the shape of invoice numbers (
            <code className="text-xs">
              {"<prefix>/<fiscal-year>/<sequence>"}
            </code>
            ) and the GST rate applied at recharge time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-prefix">Invoice prefix</Label>
              <Input
                id="invoice-prefix"
                value={settings.invoicePrefix}
                placeholder="EMS/WLT"
                onChange={(e) =>
                  updateTopLevel("invoicePrefix", e.target.value)
                }
              />
              <p className="text-xs text-slate-500">
                Example:{" "}
                <span className="font-mono">
                  {(settings.invoicePrefix || "EMS/WLT").replace(/\/+$/, "") ||
                    "EMS/WLT"}
                  /2026-27/00042
                </span>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-gst-rate">GST rate</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="invoice-gst-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={Number.isFinite(gstRatePercent) ? gstRatePercent : 18}
                  onChange={(e) => {
                    const pct = Number(e.target.value)
                    if (!Number.isFinite(pct)) return
                    updateTopLevel(
                      "gstRate",
                      Math.max(0, Math.min(1, pct / 100))
                    )
                  }}
                  className="max-w-[140px]"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
              <p className="text-xs text-slate-500">
                Applied on top of the wallet-credit base. 18% by default.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Counters */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-600" />
                <span>Fiscal-year counters</span>
              </CardTitle>
              <CardDescription>
                The last allocated sequence for each fiscal year. Reset only at
                year boundaries or when seeding a migration.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadCounters}
              disabled={countersLoading}
            >
              {countersLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Counter key</TableHead>
                  <TableHead className="text-right">Last allocated</TableHead>
                  <TableHead className="text-right">Next invoice</TableHead>
                  <TableHead>Last updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {countersLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : counters.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No counters yet. One will be created when the first
                      recharge happens this fiscal year.
                    </TableCell>
                  </TableRow>
                ) : (
                  counters.map((c) => (
                    <TableRow key={c.key}>
                      <TableCell className="font-mono text-sm">
                        {c.key}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.seq}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge
                          variant="outline"
                          className="border-indigo-200 bg-indigo-50 text-indigo-700"
                        >
                          {String(c.seq + 1).padStart(5, "0")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.updatedAt
                          ? new Date(c.updatedAt).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setResetTarget(c)
                            setResetSeq(String(c.seq))
                          }}
                        >
                          Reset…
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Test send */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-indigo-600" />
            <span>Send a test invoice</span>
          </CardTitle>
          <CardDescription>
            Emails a sample PDF using the current seller details — no wallet
            movement, no counter increment. Remember to <strong>Save</strong>{" "}
            any unsaved changes first so the test uses your latest values.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleTestSend}
              disabled={testBusy || !testEmail.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {testBusy ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send sample
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reset confirmation dialog */}
      <AlertDialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open && !resetBusy) setResetTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Reset counter {resetTarget?.key}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This changes the sequence number for{" "}
                  <span className="font-mono">{resetTarget?.key}</span>. The
                  very next invoice allocated for this key will be{" "}
                  <span className="font-semibold">
                    seq + 1 ={" "}
                    {(() => {
                      const n = Number(resetSeq)
                      return Number.isFinite(n) && n >= 0
                        ? String(Math.floor(n) + 1).padStart(5, "0")
                        : "—"
                    })()}
                  </span>
                  .
                </p>
                <p className="text-amber-600 text-sm">
                  Only do this at fiscal-year boundaries or when seeding from
                  another system. Changing an in-use counter can create
                  duplicate invoice numbers in your audit trail.
                </p>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="reset-seq-input">New sequence value</Label>
                  <Input
                    id="reset-seq-input"
                    type="number"
                    min={0}
                    step={1}
                    value={resetSeq}
                    onChange={(e) => setResetSeq(e.target.value)}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleResetConfirm()
              }}
              disabled={resetBusy}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {resetBusy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reset counter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────

function mergeWithDefaults(
  value?: Partial<InvoiceSettingsShape>
): InvoiceSettingsShape {
  return {
    seller: { ...DEFAULT_SETTINGS.seller, ...(value?.seller || {}) },
    invoicePrefix:
      typeof value?.invoicePrefix === "string" && value.invoicePrefix.length > 0
        ? value.invoicePrefix
        : DEFAULT_SETTINGS.invoicePrefix,
    gstRate:
      typeof value?.gstRate === "number" && Number.isFinite(value.gstRate)
        ? value.gstRate
        : DEFAULT_SETTINGS.gstRate,
  }
}
