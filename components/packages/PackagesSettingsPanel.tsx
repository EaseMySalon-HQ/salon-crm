"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, BarChart2, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PackageCard } from "./PackageCard"
import { NewPackageForm } from "./NewPackageForm"
import { PackagesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

export function PackagesSettingsPanel() {
  const router = useRouter()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)

  const [packages, setPackages] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const fetchPackages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await PackagesAPI.getAll({ search: search || undefined })
      if (res.success) {
        setPackages(res.data.packages || [])
        setTotal(res.data.total || 0)
      }
    } catch {
      toast({ title: "Failed to load packages", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchPackages()
  }, [fetchPackages])

  const handleStatusChange = async (id: string, status: string) => {
    const res = await PackagesAPI.updateStatus(id, status as any)
    if (res.success) {
      toast({ title: `Package ${status.toLowerCase()}` })
      fetchPackages()
    } else {
      toast({ title: res.message || "Failed", variant: "destructive" })
    }
  }

  const handleArchive = async (id: string) => {
    const res = await PackagesAPI.updateStatus(id, "ARCHIVED")
    if (res.success) {
      toast({ title: "Package archived" })
      fetchPackages()
    } else {
      toast({ title: res.message || "Failed to archive", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Packages</h3>
          <p className="text-sm text-slate-500">Bundle services and sell them as packages to clients</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => router.push("/reports?tab=package")}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Reports
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => router.push("/packages/sell")}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Sell Package
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Package
          </Button>
        </div>
      </div>

      {creating && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 -mt-1 max-h-[min(85vh,1200px)] overflow-y-auto">
          <NewPackageForm
            embedded
            onCancel={() => setCreating(false)}
            onSuccess={() => {
              setCreating(false)
              fetchPackages()
            }}
          />
        </div>
      )}

      {/* Search */}
      {!creating && (
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search packages…"
          className="pl-9"
        />
      </div>
      )}

      {/* List */}
      {!creating && loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !creating && packages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center border-2 border-dashed border-slate-200 rounded-xl">
          <div className="rounded-2xl bg-slate-100 p-4 mb-3">
            <Plus className="h-7 w-7 text-slate-400" />
          </div>
          <p className="font-semibold text-slate-700">No packages yet</p>
          <p className="text-sm text-slate-400 mt-1 max-w-xs">
            Create your first package to bundle services and offer deals to your clients.
          </p>
          <Button className="mt-4 gap-2 text-sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Create your first package
          </Button>
        </div>
      ) : !creating ? (
        <>
          <p className="text-xs text-slate-400">{total} package{total !== 1 ? "s" : ""}</p>
          <div className="space-y-3">
            {packages.map(pkg => (
              <PackageCard
                key={pkg._id}
                pkg={pkg}
                onEdit={id => router.push(`/packages/${id}/edit`)}
                onStatusChange={handleStatusChange}
                onArchive={handleArchive}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
