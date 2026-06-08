"use client"

import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Search, Pencil, ArrowRightLeft } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { BranchManagementAPI, type InventoryMatrixProduct, type InventoryStockStatus } from "@/lib/api"
import { getBranchColor } from "@/lib/branch-color"
import { formatNumber } from "./branch-format"

type BranchCol = { branchId: string; branchName: string }

const STATUS_STYLES: Record<InventoryStockStatus, string> = {
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  zero: "bg-slate-100 text-slate-400",
}

const LEGEND: { status: InventoryStockStatus; label: string }[] = [
  { status: "green", label: "Healthy" },
  { status: "amber", label: "Watch" },
  { status: "red", label: "At/below reorder" },
  { status: "zero", label: "Out of stock" },
]

function formatRestockDate(iso: string | null | undefined) {
  if (!iso) return "Never restocked"
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export function InventoryMatrixTable({
  branches,
  products,
  isLoading,
  allBranches,
  onRequestTransfer,
}: {
  branches: BranchCol[]
  products: InventoryMatrixProduct[]
  isLoading: boolean
  allBranches?: BranchCol[]
  onRequestTransfer?: (payload: {
    productKey: string
    productName: string
    sku: string
    fromBranchId: string
    toBranchId: string
  }) => void
}) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [lowOnly, setLowOnly] = useState(false)
  const [editing, setEditing] = useState<{ branchId: string; productKey: string; value: string } | null>(
    null
  )

  const reorderMutation = useMutation({
    mutationFn: async (payload: { branchId: string; productKey: string; minimumStock: number }) => {
      const res = await BranchManagementAPI.updateReorderLevel(payload)
      if (!res.success) throw new Error(res.error || "Update failed")
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-management", "inventory-matrix"] })
      toast({ title: "Reorder level updated" })
      setEditing(null)
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't update", description: err.message, variant: "destructive" })
    },
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false
      if (lowOnly) {
        const lows = branches.some((b) => {
          const cell = p.branches[b.branchId]
          return cell && (cell.status === "red" || cell.status === "zero")
        })
        if (!lows) return false
      }
      return true
    })
  }, [products, branches, search, lowOnly])

  const saveReorder = () => {
    if (!editing) return
    const minimumStock = Number(editing.value)
    if (!Number.isFinite(minimumStock) || minimumStock < 0) return
    reorderMutation.mutate({
      branchId: editing.branchId,
      productKey: editing.productKey,
      minimumStock,
    })
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or SKU…"
            className="pl-9"
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Low stock only
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {LEGEND.map((l) => (
          <span key={l.status} className="inline-flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded", STATUS_STYLES[l.status])} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="sticky left-0 z-10 min-w-[14rem] bg-slate-50">Product</TableHead>
              {branches.map((b) => (
                <TableHead key={b.branchId} className="text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: getBranchColor(b.branchId) }}
                    />
                    {b.branchName}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={branches.length + 1} className="py-10 text-center text-sm text-slate-500">
                  No products match this view.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.key}>
                  <TableCell className="sticky left-0 z-10 bg-white">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">
                        {p.sku ? `${p.sku} · ` : ""}
                        {p.category || "Uncategorized"}
                      </p>
                    </div>
                  </TableCell>
                  {branches.map((b) => {
                    const cell = p.branches[b.branchId]
                    if (!cell) {
                      return (
                        <TableCell key={b.branchId} className="text-right text-slate-300">
                          —
                        </TableCell>
                      )
                    }
                    const isEditing =
                      editing?.branchId === b.branchId && editing?.productKey === p.key
                    return (
                      <TableCell key={b.branchId} className="text-right">
                        <Popover
                          open={isEditing}
                          onOpenChange={(open) => {
                            if (open) {
                              setEditing({
                                branchId: b.branchId,
                                productKey: p.key,
                                value: String(cell.reorderLevel),
                              })
                            } else if (isEditing) {
                              setEditing(null)
                            }
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "inline-flex min-w-[3.25rem] items-center justify-end gap-1 rounded-md px-2 py-1 text-sm font-semibold tabular-nums",
                                STATUS_STYLES[cell.status]
                              )}
                              title={`Reorder ${cell.reorderLevel} · ${formatRestockDate(cell.lastRestockedAt)}`}
                            >
                              {formatNumber(cell.stock)}
                              <Pencil className="h-3 w-3 opacity-50" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56" align="end">
                            <p className="mb-2 text-xs text-slate-500">
                              Last restock: {formatRestockDate(cell.lastRestockedAt)}
                            </p>
                            <label className="mb-2 block text-xs font-medium text-slate-700">
                              Reorder level
                            </label>
                            <Input
                              type="number"
                              min={0}
                              value={editing?.value ?? ""}
                              onChange={(e) =>
                                setEditing((prev) =>
                                  prev ? { ...prev, value: e.target.value } : prev
                                )
                              }
                            />
                            <div className="mt-3 flex gap-2">
                              <Button size="sm" className="flex-1" onClick={saveReorder}>
                                Save
                              </Button>
                              {(cell.status === "red" || cell.status === "zero") &&
                                onRequestTransfer &&
                                allBranches &&
                                allBranches.length > 1 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    title="Request transfer"
                                    onClick={() => {
                                      const donor = allBranches.find(
                                        (br) =>
                                          br.branchId !== b.branchId &&
                                          (p.branches[br.branchId]?.stock ?? 0) > cell.reorderLevel
                                      )
                                      if (donor) {
                                        onRequestTransfer({
                                          productKey: p.key,
                                          productName: p.name,
                                          sku: p.sku,
                                          fromBranchId: donor.branchId,
                                          toBranchId: b.branchId,
                                        })
                                      } else {
                                        toast({
                                          title: "No donor branch",
                                          description: "No branch has surplus stock for this product.",
                                        })
                                      }
                                    }}
                                  >
                                    <ArrowRightLeft className="h-4 w-4" />
                                  </Button>
                                )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
