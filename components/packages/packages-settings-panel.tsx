"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Search, Boxes, Calendar, Layers, Pencil, Trash2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
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
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { PackagesAPI } from "@/lib/api"

type PackageRow = {
  _id: string
  name: string
  type: string
  total_price: number
  total_sittings: number
  validity_days?: number | null
  status: string
  service_count?: number
}

export function PackagesSettingsPanel() {
  const { toast } = useToast()
  const { user } = useAuth()
  const isManager = user?.role === "admin" || user?.role === "manager"
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [deletingPackage, setDeletingPackage] = useState<PackageRow | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await PackagesAPI.list({ status: "ACTIVE", search: search.trim() || undefined, limit: 100 })
      if (res.success && res.data?.packages) {
        setPackages(res.data.packages)
      } else {
        setPackages([])
      }
    } catch {
      toast({ title: "Could not load packages", variant: "destructive" })
      setPackages([])
    } finally {
      setLoading(false)
    }
  }, [search, toast])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const handleDelete = async () => {
    if (!deletingPackage) return
    setDeleteSubmitting(true)
    try {
      const res = await PackagesAPI.delete(deletingPackage._id)
      if (!res.success) {
        toast({
          title: "Could not delete package",
          description: res.message || "Try again.",
          variant: "destructive",
        })
        return
      }
      toast({ title: "Package deleted", description: `"${deletingPackage.name}" has been removed from the catalog.` })
      setDeletingPackage(null)
      await load()
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" })
    } finally {
      setDeleteSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">Packages</h2>
          <p className="text-sm text-slate-500">
            Multi-session offers — create and manage catalog packages for your salon.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {isManager && (
            <Button asChild variant="outline" size="sm">
              <Link href="/packages/new">
                <Plus className="mr-2 h-4 w-4" />
                Create package
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-6">
        <div className="relative max-w-md mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search packages…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse border-slate-200/80">
                <CardHeader className="pb-2">
                  <div className="h-5 w-32 bg-slate-200 rounded" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="h-7 w-20 bg-slate-200 rounded" />
                  <div className="h-4 w-full bg-slate-200 rounded" />
                  <div className="h-4 w-24 bg-slate-200 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : packages.length === 0 ? (
          <div className="text-center py-16 text-slate-500 space-y-4">
            <p>No active packages found.</p>
            {isManager ? (
              <Button asChild className="bg-violet-600 hover:bg-violet-700">
                <Link href="/packages/new">Create your first package</Link>
              </Button>
            ) : (
              <p className="text-sm">Ask a manager to create packages for the salon.</p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {packages.map((pkg) => (
              <Card
                key={pkg._id}
                className="overflow-hidden border-slate-200/80 transition-all hover:border-slate-300 hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="p-2 rounded-lg bg-violet-100 shrink-0">
                        <Boxes className="h-4 w-4 text-violet-700" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 leading-snug">{pkg.name}</h3>
                        <Badge variant="outline" className="mt-2 text-xs">
                          {pkg.type === "CUSTOMIZED" ? "Customized" : "Fixed"}
                        </Badge>
                      </div>
                    </div>
                    {isManager ? (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-slate-500">
                          <Link href={`/packages/${encodeURIComponent(pkg._id)}/edit`} aria-label={`Edit ${pkg.name}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-destructive"
                          aria-label={`Delete ${pkg.name}`}
                          onClick={() => setDeletingPackage(pkg)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="text-2xl font-bold text-violet-700">
                    ₹{pkg.total_price.toLocaleString("en-IN")}
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      {pkg.total_sittings} sitting{pkg.total_sittings !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      {pkg.validity_days ? `${pkg.validity_days} day validity` : "No expiry"}
                    </span>
                    {pkg.service_count != null && pkg.service_count > 0 ? (
                      <span>
                        {pkg.service_count} service{pkg.service_count !== 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingPackage} onOpenChange={(open) => !open && !deleteSubmitting && setDeletingPackage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete package?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &ldquo;{deletingPackage?.name}&rdquo; from your catalog. Packages with active client
              subscriptions cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={deleteSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
