"use client"

import { Suspense, useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, CheckCircle, AlertCircle, ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { PackageProgressBar } from "@/components/packages/PackageProgressBar"
import { PackagesAPI, ClientsAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { isClientPackageRedeemable } from "@/lib/client-package-utils"

function RedeemPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [clientSearch, setClientSearch] = useState("")
  const [clients, setClients] = useState<any[]>([])
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [activePackages, setActivePackages] = useState<any[]>([])
  const [selectedCP, setSelectedCP] = useState<any>(null)
  const [packageDetail, setPackageDetail] = useState<any>(null)
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set())
  const [redeeming, setRedeeming] = useState(false)
  const [redeemed, setRedeemed] = useState<any>(null)

  const urlClientInitRef = useRef<string | null>(null)

  const selectClient = useCallback(async (client: any) => {
    setSelectedClient(client)
    setClients([])
    setClientSearch(client.name || "")
    setSelectedCP(null)
    setSelectedServices(new Set())
    setRedeemed(null)
    const res = await PackagesAPI.getClientPackages(client._id)
    if (res.success) {
      setActivePackages((res.data || []).filter(isClientPackageRedeemable))
    } else {
      setActivePackages([])
    }
  }, [])

  useEffect(() => {
    const id = searchParams.get("clientId")
    if (!id || urlClientInitRef.current === id) return
    let cancelled = false
    ClientsAPI.getById(id)
      .then(res => {
        if (cancelled || !res.success || !res.data) return
        urlClientInitRef.current = id
        selectClient(res.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [searchParams, selectClient])

  useEffect(() => {
    if (!clientSearch.trim()) {
      setClients([])
      return
    }
    const t = setTimeout(() => {
      ClientsAPI.search(clientSearch).then(res => {
        if (res.success) setClients(res.data || [])
      }).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  const selectClientPackage = async (cp: any) => {
    setSelectedCP(cp)
    setSelectedServices(new Set())
    setRedeemed(null)
    if (cp.package_id?._id) {
      const res = await PackagesAPI.getById(cp.package_id._id)
      if (res.success) setPackageDetail(res.data)
    }
  }

  const toggleService = (id: string) => {
    setSelectedServices(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const minCount = packageDetail?.min_service_count || 1
  const meetsMin = selectedServices.size >= minCount

  const handleRedeem = async () => {
    if (!selectedCP || !meetsMin) return
    setRedeeming(true)
    try {
      const services = Array.from(selectedServices).map(id => ({ service_id: id }))
      const res = await PackagesAPI.redeem(selectedCP._id, { services })
      if (res.success) {
        setRedeemed(res.data)
        toast({ title: "Sitting redeemed successfully!" })
      } else {
        toast({ title: res.message || "Redemption failed", variant: "destructive" })
      }
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Redeem Package</h1>
      </div>

      {redeemed && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <span className="font-semibold">Sitting redeemed!</span>
          </div>
          <PackageProgressBar
            used={redeemed.clientPackage.used_sittings}
            total={redeemed.clientPackage.total_sittings}
            label="Updated sittings"
          />
          {redeemed.clientPackage.remaining_sittings === 1 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Only 1 sitting remaining — consider renewing this package.
            </p>
          )}
          {redeemed.clientPackage.status === "EXHAUSTED" && (
            <p className="text-sm text-gray-600 font-medium">Package is now exhausted.</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button onClick={() => { setRedeemed(null); setSelectedCP(null); setSelectedServices(new Set()) }} variant="outline" size="sm">
              Redeem Another
            </Button>
            <Button onClick={() => router.push(`/clients/${selectedClient._id}/packages`)} size="sm">
              View Client Packages
            </Button>
          </div>
        </div>
      )}

      {!redeemed && (
        <div className="space-y-5">
          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h2 className="font-semibold text-gray-800 text-sm">1. Search Client</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setSelectedClient(null) }}
                placeholder="Name or phone…"
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
                {selectedClient.name}
              </div>
            )}
          </div>

          {selectedClient && activePackages.length === 0 && (
            <p className="text-sm text-center text-gray-400 py-4">No active packages for this client.</p>
          )}
          {selectedClient && activePackages.length > 0 && (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h2 className="font-semibold text-gray-800 text-sm">2. Select Package</h2>
              <div className="space-y-2">
                {activePackages.map(cp => (
                  <button key={cp._id} onClick={() => selectClientPackage(cp)}
                    className={`w-full text-left border rounded-lg px-3 py-3 transition-colors ${
                      selectedCP?._id === cp._id
                        ? "border-indigo-600 bg-indigo-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-800">{cp.package_id?.name}</p>
                      <Badge variant="secondary" className="text-xs">
                        {cp.remaining_sittings} left
                      </Badge>
                    </div>
                    <PackageProgressBar used={cp.used_sittings} total={cp.total_sittings} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedCP && packageDetail && (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h2 className="font-semibold text-gray-800 text-sm">3. Services Today</h2>
              <p className="text-xs text-gray-500">
                Select services being availed · minimum {minCount} required
              </p>
              {packageDetail.services?.length > 0 ? (
                <div className="space-y-2">
                  {packageDetail.services.map((s: any) => {
                    const svcId = s.service_id?._id || s.service_id
                    const svcName = s.service_id?.name || "Service"
                    return (
                      <label key={svcId} className="flex items-center gap-3 cursor-pointer">
                        <Checkbox
                          checked={selectedServices.has(svcId)}
                          onCheckedChange={() => toggleService(svcId)}
                        />
                        <span className="text-sm text-gray-700 flex-1">{svcName}</span>
                        {s.is_optional && <span className="text-xs text-gray-400">optional</span>}
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No services attached to this package.</p>
              )}

              {!meetsMin && selectedServices.size > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Select at least {minCount} service{minCount > 1 ? "s" : ""} to proceed
                </div>
              )}

              <Button
                onClick={handleRedeem}
                disabled={redeeming || !meetsMin}
                className="w-full"
              >
                {redeeming ? "Redeeming…" : `Confirm Redemption (${selectedServices.size} service${selectedServices.size !== 1 ? "s" : ""})`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RedeemFallback() {
  return (
    <div className="p-6 max-w-xl mx-auto flex flex-col items-center justify-center min-h-[320px] gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      <p className="text-sm text-gray-500">Loading…</p>
    </div>
  )
}

export default function RedeemPackagePage() {
  return (
    <Suspense fallback={<RedeemFallback />}>
      <RedeemPageInner />
    </Suspense>
  )
}
