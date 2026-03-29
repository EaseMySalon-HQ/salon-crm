"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, AlertTriangle, CheckCircle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { PackagesAPI, ClientsAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"

export default function SellPackagePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientIdFromUrl = searchParams.get("clientId")
  const { toast } = useToast()
  const { user } = useAuth()

  const [clientSearch, setClientSearch] = useState("")
  const [clients, setClients] = useState<any[]>([])
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [clientPackages, setClientPackages] = useState<any[]>([])

  const [packages, setPackages] = useState<any[]>([])
  const [selectedPackage, setSelectedPackage] = useState<any>(null)

  const [amountPaid, setAmountPaid] = useState("")
  const [paymentMode, setPaymentMode] = useState<"FULL" | "PARTIAL" | "PENDING">("FULL")
  const [selling, setSelling] = useState(false)

  // Load active packages on mount
  useEffect(() => {
    PackagesAPI.getAll({ status: "ACTIVE" }).then(res => {
      if (res.success) setPackages(res.data.packages || [])
    })
  }, [])

  // Search clients
  useEffect(() => {
    if (!clientSearch.trim()) { setClients([]); return }
    const t = setTimeout(() => {
      ClientsAPI.search(clientSearch).then(res => {
        if (res.success) setClients(res.data || [])
      }).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  const selectClient = async (client: any) => {
    setSelectedClient(client)
    setClients([])
    setClientSearch(client.name)
    const res = await PackagesAPI.getClientPackages(client._id)
    if (res.success) setClientPackages((res.data || []).filter((cp: any) => cp.status === "ACTIVE"))
  }

  // Prefill client when opened from Quick Sale (or other links with ?clientId=)
  useEffect(() => {
    if (!clientIdFromUrl) return
    let cancelled = false
    ;(async () => {
      const res = await ClientsAPI.getById(clientIdFromUrl)
      if (cancelled || !res.success || !res.data) return
      setSelectedClient(res.data)
      setClients([])
      setClientSearch(res.data.name || "")
      const pkgRes = await PackagesAPI.getClientPackages(res.data._id)
      if (!cancelled && pkgRes.success) {
        setClientPackages((pkgRes.data || []).filter((cp: any) => cp.status === "ACTIVE"))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientIdFromUrl])

  const expiryPreview = () => {
    if (!selectedPackage) return null
    if (!selectedPackage.validity_days) return "Never expires"
    const d = new Date()
    d.setDate(d.getDate() + selectedPackage.validity_days)
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
  }

  const effectiveAmount = () => {
    if (!selectedPackage) return 0
    if (paymentMode === "FULL") return selectedPackage.total_price
    if (paymentMode === "PENDING") return 0
    return parseFloat(amountPaid) || 0
  }

  const outstanding = () => {
    if (!selectedPackage) return 0
    return Math.max(0, selectedPackage.total_price - effectiveAmount())
  }

  const hasDuplicate = clientPackages.some(cp => cp.package_id?._id === selectedPackage?._id)

  const handleSell = async () => {
    if (!selectedClient || !selectedPackage) return
    setSelling(true)
    try {
      const res = await PackagesAPI.sell(selectedPackage._id, {
        client_id: selectedClient._id,
        amount_paid: effectiveAmount(),
        ...(user?._id ? { sold_by_staff_id: user._id } : {}),
      })
      if (res.success) {
        toast({
          title: "Package sold successfully",
          description: res.data.warning || undefined
        })
        router.push(`/clients/${selectedClient._id}/packages`)
      } else {
        toast({ title: res.message || "Failed to sell", variant: "destructive" })
      }
    } finally {
      setSelling(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Sell Package</h1>
      </div>

      <div className="space-y-5">
        {/* Step 1: Client */}
        <div className="bg-white border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-gray-800">1. Select Client</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setSelectedClient(null) }}
              placeholder="Search by name or phone…"
              className="pl-9"
            />
          </div>
          {clients.length > 0 && (
            <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
              {clients.map(c => (
                <button key={c._id} onClick={() => selectClient(c)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.phone}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedClient && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle className="h-4 w-4" />
              <span>{selectedClient.name} · {selectedClient.phone}</span>
            </div>
          )}
          {selectedClient && clientPackages.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">Active packages: </span>
                {clientPackages.map(cp => cp.package_id?.name).join(", ")}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Package */}
        {selectedClient && (
          <div className="bg-white border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-gray-800">2. Select Package</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {packages.map(p => (
                <button
                  key={p._id}
                  onClick={() => setSelectedPackage(p)}
                  className={`w-full text-left border rounded-lg px-3 py-3 transition-colors ${
                    selectedPackage?._id === p._id
                      ? "border-indigo-600 bg-indigo-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.total_sittings} sittings · {p.validity_days ? `${p.validity_days}d validity` : "No expiry"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">₹{p.total_price}</p>
                      <Badge variant="outline" className="text-xs">{p.type}</Badge>
                    </div>
                  </div>
                  {hasDuplicate && selectedPackage?._id === p._id && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Client already has an active version of this package
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Payment */}
        {selectedPackage && (
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-gray-800">3. Payment</h2>

            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-700">
                <span>Package Price</span>
                <span className="font-medium">₹{selectedPackage.total_price}</span>
              </div>
              <div className="flex justify-between text-gray-500 text-xs">
                <span>Expiry</span>
                <span>{expiryPreview()}</span>
              </div>
            </div>

            <div className="flex gap-2">
              {(["FULL", "PARTIAL", "PENDING"] as const).map(m => (
                <button key={m} type="button" onClick={() => setPaymentMode(m)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    paymentMode === m ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600"
                  }`}>
                  {m}
                </button>
              ))}
            </div>

            {paymentMode === "PARTIAL" && (
              <div className="space-y-1">
                <Label>Amount Received (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  max={selectedPackage.total_price}
                  value={amountPaid}
                  onChange={e => setAmountPaid(e.target.value)}
                  placeholder="0"
                />
              </div>
            )}

            {outstanding() > 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Outstanding balance: ₹{outstanding()}
              </p>
            )}

            <Button onClick={handleSell} disabled={selling} className="w-full">
              {selling ? "Processing…" : `Confirm & Activate — ₹${effectiveAmount()} paid`}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
