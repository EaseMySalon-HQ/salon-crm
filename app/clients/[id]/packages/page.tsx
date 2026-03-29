"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Calendar, Clock, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PackageProgressBar } from "@/components/packages/PackageProgressBar"
import { RedemptionTimeline } from "@/components/packages/RedemptionTimeline"
import { PackagesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  EXPIRED: "bg-red-100 text-red-700",
  EXHAUSTED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-gray-100 text-gray-400"
}

function daysUntil(date: string | null) {
  if (!date) return null
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
  return diff
}

export default function ClientPackagesPage() {
  const { id: clientId } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const isManager = user?.role === "admin" || user?.role === "manager"

  const [clientPackages, setClientPackages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<string, any[]>>({})

  const [extendingId, setExtendingId] = useState<string | null>(null)
  const [extendForm, setExtendForm] = useState({ new_expiry_date: "", reason: "" })

  useEffect(() => {
    PackagesAPI.getClientPackages(clientId)
      .then(res => { if (res.success) setClientPackages(res.data || []) })
      .finally(() => setLoading(false))
  }, [clientId])

  const toggleExpand = async (cpId: string) => {
    if (expanded === cpId) { setExpanded(null); return }
    setExpanded(cpId)
    if (!history[cpId]) {
      const res = await PackagesAPI.getRedemptionHistory(cpId)
      if (res.success) setHistory(h => ({ ...h, [cpId]: res.data.history || [] }))
    }
  }

  const handleExtend = async (cpId: string) => {
    if (!extendForm.new_expiry_date || !extendForm.reason.trim()) {
      toast({ title: "Date and reason are required", variant: "destructive" }); return
    }
    const res = await PackagesAPI.extendExpiry(cpId, extendForm)
    if (res.success) {
      toast({ title: "Expiry extended" })
      setExtendingId(null)
      setExtendForm({ new_expiry_date: "", reason: "" })
      const updated = await PackagesAPI.getClientPackages(clientId)
      if (updated.success) setClientPackages(updated.data || [])
    } else {
      toast({ title: res.message || "Failed", variant: "destructive" })
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading…</div>
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Client Packages</h1>
      </div>

      {clientPackages.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No packages yet</p>
          <Button className="mt-4" onClick={() => router.push("/packages/sell")}>
            Sell a Package
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {clientPackages.map(cp => {
            const days = daysUntil(cp.expiry_date)
            const isExpiringSoon = days !== null && days >= 0 && days <= 3
            return (
              <div key={cp._id} className="bg-white border rounded-xl overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{cp.package_id?.name || "—"}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[cp.status] || ""}`}>
                          {cp.status}
                        </span>
                        {isExpiringSoon && (
                          <Badge className="text-xs bg-red-100 text-red-700 border-red-200">
                            Expires in {days}d
                          </Badge>
                        )}
                      </div>

                      <div className="mt-3">
                        <PackageProgressBar
                          used={cp.used_sittings}
                          total={cp.total_sittings}
                          label="Sittings"
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Purchased: {new Date(cp.purchase_date).toLocaleDateString("en-IN")}
                        </span>
                        {cp.expiry_date ? (
                          <span className={`flex items-center gap-1 ${isExpiringSoon ? "text-red-600" : ""}`}>
                            <Clock className="h-3 w-3" />
                            Expires: {new Date(cp.expiry_date).toLocaleDateString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-green-600">Never expires</span>
                        )}
                        {cp.outstanding_balance > 0 && (
                          <span className="text-amber-600">₹{cp.outstanding_balance} outstanding</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" className="gap-1 text-xs"
                      onClick={() => toggleExpand(cp._id)}>
                      {expanded === cp._id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {expanded === cp._id ? "Hide" : "View"} History
                    </Button>
                    {isManager && cp.status === "ACTIVE" && (
                      <Button variant="outline" size="sm" className="text-xs"
                        onClick={() => setExtendingId(extendingId === cp._id ? null : cp._id)}>
                        Extend Expiry
                      </Button>
                    )}
                  </div>

                  {/* Extend expiry form */}
                  {isManager && extendingId === cp._id && (
                    <div className="mt-3 border-t pt-3 space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs">New Expiry Date</Label>
                        <Input
                          type="date"
                          value={extendForm.new_expiry_date}
                          onChange={e => setExtendForm(f => ({ ...f, new_expiry_date: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Reason (required)</Label>
                        <Input
                          value={extendForm.reason}
                          onChange={e => setExtendForm(f => ({ ...f, reason: e.target.value }))}
                          placeholder="e.g. Client requested extension due to travel"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="text-xs" onClick={() => handleExtend(cp._id)}>
                          Confirm Extension
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs"
                          onClick={() => setExtendingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Redemption timeline */}
                {expanded === cp._id && (
                  <div className="border-t px-4 py-4 bg-gray-50">
                    <RedemptionTimeline redemptions={history[cp._id] || []} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
