"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { BranchManagementAPI } from "@/lib/api"
import { InventoryMatrixTable } from "@/components/branch-management/inventory-matrix-table"
import { TransferRequestsPanel } from "@/components/branch-management/transfer-requests-panel"
import { BranchPillFilter } from "@/components/branch-management/branch-pill-filter"
import { BranchErrorNote } from "@/components/branch-management/branch-error-note"
import { downloadMultiSheetXlsx } from "@/lib/inventory-lists-export"
import { STALE_TIME } from "@/lib/queries/staleness"
import { hrefProductsSettings } from "@/lib/settings-products-routes"

function BranchInventoryContent() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [branchFilter, setBranchFilter] = useState<string>("all")
  const [transferDraft, setTransferDraft] = useState<{
    productKey: string
    productName: string
    sku: string
    fromBranchId: string
    toBranchId: string
  } | null>(null)
  const [quantity, setQuantity] = useState("1")

  useEffect(() => {
    const b = searchParams.get("branch")
    if (b) setBranchFilter(b)
  }, [searchParams])

  const { data, isLoading } = useQuery({
    queryKey: ["branch-management", "inventory-matrix"],
    queryFn: async () => {
      const res = await BranchManagementAPI.getInventoryMatrix()
      if (!res.success) throw new Error(res.error || "Failed to load inventory")
      return res.data
    },
    staleTime: STALE_TIME.dashboard,
  })

  const createTransfer = useMutation({
    mutationFn: async () => {
      if (!transferDraft) throw new Error("Missing transfer")
      const res = await BranchManagementAPI.createTransfer({
        ...transferDraft,
        quantity: Number(quantity) || 1,
      })
      if (!res.success) throw new Error(res.error || "Failed to create transfer")
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-management", "transfers"] })
      toast({ title: "Transfer request created" })
      setTransferDraft(null)
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't create transfer", description: err.message, variant: "destructive" })
    },
  })

  const allBranches = data?.branches ?? []
  const products = data?.products ?? []
  const branchNames = useMemo(
    () => new Map(allBranches.map((b) => [b.branchId, b.branchName])),
    [allBranches]
  )

  const visibleBranches = useMemo(
    () => (branchFilter === "all" ? allBranches : allBranches.filter((b) => b.branchId === branchFilter)),
    [allBranches, branchFilter]
  )

  const handleExport = () => {
    const cols = visibleBranches
    const headers = ["Product", "SKU", "Category", ...cols.map((b) => b.branchName)]
    const rows = products.map((p) => [
      p.name,
      p.sku,
      p.category,
      ...cols.map((b) => {
        const cell = p.branches[b.branchId]
        return cell ? cell.stock : ""
      }),
    ])
    downloadMultiSheetXlsx("branch-inventory-matrix", [{ name: "Inventory", headers, rows }])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BranchPillFilter
          branches={allBranches.map((b) => ({ branchId: b.branchId, branchName: b.branchName }))}
          value={branchFilter}
          onChange={setBranchFilter}
        />
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleExport}
          disabled={isLoading || products.length === 0}
        >
          <Download className="h-4 w-4" /> Export XLSX
        </Button>
      </div>

      <BranchErrorNote rows={allBranches} />
      <InventoryMatrixTable
        branches={visibleBranches}
        allBranches={allBranches}
        products={products}
        isLoading={isLoading}
        onRequestTransfer={(payload) => {
          setQuantity("1")
          setTransferDraft(payload)
        }}
      />

      <TransferRequestsPanel branchNames={branchNames} />

      <p className="text-center text-sm text-slate-500">
        <Link
          href={hrefProductsSettings({ productsTab: "transfers" })}
          className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
        >
          Approve or reject transfers in Products
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </p>

      <Dialog open={!!transferDraft} onOpenChange={(open) => !open && setTransferDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request stock transfer</DialogTitle>
          </DialogHeader>
          {transferDraft && (
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">
                {transferDraft.productName}: {branchNames.get(transferDraft.fromBranchId)} →{" "}
                {branchNames.get(transferDraft.toBranchId)}
              </p>
              <div>
                <Label htmlFor="qty">Quantity</Label>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDraft(null)}>
              Cancel
            </Button>
            <Button onClick={() => createTransfer.mutate()} disabled={createTransfer.isPending}>
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function BranchInventoryPage() {
  return (
    <Suspense fallback={null}>
      <BranchInventoryContent />
    </Suspense>
  )
}
