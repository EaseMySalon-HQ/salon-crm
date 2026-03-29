"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Plus, Package, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PackageCard } from "@/components/packages/PackageCard"
import { PackagesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

export default function PackagesPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [packages, setPackages] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState("ACTIVE")

  const fetchPackages = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (search) params.search = search
      if (typeFilter !== "ALL") params.type = typeFilter
      if (statusFilter !== "ALL") params.status = statusFilter

      const res = await PackagesAPI.getAll(params)
      if (res.success) {
        setPackages(res.data.packages || [])
        setTotal(res.data.total || 0)
      }
    } catch {
      toast({ title: "Failed to load packages", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter, statusFilter])

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
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Packages</h1>
          <p className="text-sm text-gray-500 mt-0.5">Bundle services and sell them as packages</p>
        </div>
        <Button onClick={() => router.push("/packages/new")} className="gap-2">
          <Plus className="h-4 w-4" /> Create Package
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search packages…"
            className="pl-9"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="FIXED">Fixed</SelectItem>
            <SelectItem value="CUSTOMIZED">Customized</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="h-12 w-12 text-gray-300 mb-3" />
          <h3 className="text-lg font-semibold text-gray-700">No packages yet</h3>
          <p className="text-sm text-gray-400 mt-1 max-w-sm">
            Create your first package to bundle services and offer great deals to your clients.
          </p>
          <Button className="mt-4 gap-2" onClick={() => router.push("/packages/new")}>
            <Plus className="h-4 w-4" /> Create your first package
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">{total} package{total !== 1 ? "s" : ""}</p>
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
      )}
    </div>
  )
}
