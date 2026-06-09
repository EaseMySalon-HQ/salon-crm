"use client"

import { useQuery } from "@tanstack/react-query"
import { Package } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BranchManagementAPI, type TransferRequestRow } from "@/lib/api"
import { STALE_TIME } from "@/lib/queries/staleness"
import { TransferStatusBadge, formatTransferDate } from "@/components/products/transfer-request-shared"

/** Org-wide read-only transfer log for Branch Management — no approve/reject here. */
export function TransferRequestsPanel({
  branchNames,
}: {
  branchNames: Map<string, string>
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["branch-management", "transfers"],
    queryFn: async () => {
      const res = await BranchManagementAPI.getTransfers()
      if (!res.success) throw new Error(res.error || "Failed to load transfers")
      return res.data.transfers
    },
    staleTime: STALE_TIME.dashboard,
  })

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />

  const transfers = data ?? []

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Transfer requests</h3>
        </div>
        <p className="text-xs text-slate-400">Status only — approve or reject in Products</p>
      </div>
      {transfers.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">No transfer requests yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Product</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.map((t) => (
              <TransferRow key={t._id} transfer={t} branchNames={branchNames} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function TransferRow({
  transfer: t,
  branchNames,
}: {
  transfer: TransferRequestRow
  branchNames: Map<string, string>
}) {
  const from = branchNames.get(t.fromBranchId) ?? t.fromBranchId
  const to = branchNames.get(t.toBranchId) ?? t.toBranchId

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-slate-800">{t.productName}</p>
        {t.sku && <p className="text-xs text-slate-400">{t.sku}</p>}
      </TableCell>
      <TableCell className="text-sm text-slate-600">
        {from} → {to}
      </TableCell>
      <TableCell className="tabular-nums">{t.quantity}</TableCell>
      <TableCell className="whitespace-nowrap text-sm text-slate-600">
        {formatTransferDate(t.createdAt)}
      </TableCell>
      <TableCell>
        <TransferStatusBadge transfer={t} currentBranchId="" />
      </TableCell>
    </TableRow>
  )
}
