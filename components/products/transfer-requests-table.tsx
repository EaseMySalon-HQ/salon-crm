"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/use-toast"
import { InventoryTransfersAPI, type TransferRequestRow } from "@/lib/api"
import {
  TransferStatusBadge,
  transferDirection,
  canApproveTransfer,
  canRejectTransfer,
  canCancelTransfer,
  isTransferInProcessForBranch,
  formatTransferDate,
  getTransferApproverBranchId,
} from "./transfer-request-shared"

export function TransferRequestsTable({
  transfers,
  isLoading,
  branchNames,
  currentBranchId,
  isOrgOwner,
}: {
  transfers: TransferRequestRow[]
  isLoading: boolean
  branchNames: Map<string, string>
  currentBranchId: string
  isOrgOwner: boolean
}) {
  const queryClient = useQueryClient()
  const [actingId, setActingId] = useState<string | null>(null)

  const mutate = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: "approved" | "rejected" | "cancelled"
    }) => {
      const res = await InventoryTransfersAPI.updateTransfer(id, { status })
      if (!res.success) throw new Error(res.error || "Update failed")
      return res.data
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["inventory-transfers"] })
      queryClient.invalidateQueries({ queryKey: ["products"] })
      window.dispatchEvent(new Event("product-added"))
      window.dispatchEvent(new Event("inventoryTransactionCreated"))
      if (result.errors?.length) {
        toast({
          title: "Transfer issue",
          description: result.errors.join("; "),
          variant: "destructive",
        })
      } else {
        toast({ title: "Transfer updated" })
      }
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't update transfer", description: err.message, variant: "destructive" })
    },
    onSettled: () => setActingId(null),
  })

  const act = (id: string, status: "approved" | "rejected" | "cancelled") => {
    setActingId(id)
    mutate.mutate({ id, status })
  }

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />
  }

  if (transfers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-12 text-center text-sm text-slate-500">
        No transfer requests match your filters.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Product</TableHead>
            <TableHead>Route</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Direction</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transfers.map((t) => {
            const dir = transferDirection(t, currentBranchId)
            const fromName = branchNames.get(String(t.fromBranchId)) ?? t.fromBranchId
            const toName = branchNames.get(String(t.toBranchId)) ?? t.toBranchId
            const acting = actingId === t._id
            const approverId = getTransferApproverBranchId(t)
            const approverName = branchNames.get(String(approverId)) ?? approverId
            const showAwaiting =
              t.status === "pending" &&
              !canApproveTransfer(t, currentBranchId) &&
              !canCancelTransfer(t, currentBranchId) &&
              !isTransferInProcessForBranch(t, currentBranchId)

            return (
              <TableRow key={t._id}>
                <TableCell>
                  <p className="font-medium text-slate-800">{t.productName}</p>
                  {t.sku && <p className="text-xs text-slate-400">{t.sku}</p>}
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {fromName} → {toName}
                </TableCell>
                <TableCell className="tabular-nums">{t.quantity}</TableCell>
                <TableCell className="capitalize text-sm text-slate-500">
                  {dir === "other" && isOrgOwner ? "org" : dir}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-slate-600">
                  {formatTransferDate(t.createdAt)}
                </TableCell>
                <TableCell>
                  <TransferStatusBadge transfer={t} currentBranchId={currentBranchId} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {isTransferInProcessForBranch(t, currentBranchId) && (
                      <span className="text-xs text-slate-400">
                        Awaiting approval from {approverName}
                      </span>
                    )}
                    {showAwaiting && (
                      <span className="text-xs text-slate-400">
                        Awaiting {approverName}
                      </span>
                    )}
                    {canApproveTransfer(t, currentBranchId) && (
                      <Button size="sm" disabled={acting} onClick={() => act(t._id, "approved")}>
                        {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
                      </Button>
                    )}
                    {canRejectTransfer(t, currentBranchId) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting}
                        onClick={() => act(t._id, "rejected")}
                      >
                        Reject
                      </Button>
                    )}
                    {canCancelTransfer(t, currentBranchId) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={acting}
                        onClick={() => act(t._id, "cancelled")}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
