"use client"

import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import type { TransferRequestRow } from "@/lib/api"

const STATUS_STYLE: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  in_process: "border-sky-200 bg-sky-50 text-sky-800",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  approved: "border-blue-200 bg-blue-50 text-blue-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-500",
}

function branchEq(a: string | null | undefined, b: string | null | undefined) {
  return String(a ?? "") === String(b ?? "")
}

export function transferDirection(
  transfer: TransferRequestRow,
  currentBranchId: string
): "incoming" | "outgoing" | "other" {
  if (branchEq(transfer.toBranchId, currentBranchId)) return "incoming"
  if (branchEq(transfer.fromBranchId, currentBranchId)) return "outgoing"
  return "other"
}

function getInitiatorBranchId(transfer: TransferRequestRow): string {
  return String(transfer.initiatedByBranchId || transfer.fromBranchId)
}

/** Counterparty of initiator approves (receiver for send-out, sender for request-in). */
function getApproverBranchId(transfer: TransferRequestRow): string {
  const initiator = getInitiatorBranchId(transfer)
  if (branchEq(initiator, transfer.fromBranchId)) {
    return String(transfer.toBranchId)
  }
  return String(transfer.fromBranchId)
}

/** Branch-scoped status label — initiator sees "In Process" while awaiting counterparty. */
export function getTransferStatusLabel(
  transfer: TransferRequestRow,
  currentBranchId: string
): string {
  const isInitiator = branchEq(getInitiatorBranchId(transfer), currentBranchId)

  switch (transfer.status) {
    case "pending":
      if (isInitiator) return "In Process"
      if (branchEq(getApproverBranchId(transfer), currentBranchId)) return "Pending"
      return "Pending"
    case "completed":
    case "approved":
      return "Accepted"
    case "rejected":
      return "Rejected"
    case "cancelled":
      return "Cancelled"
    default:
      return transfer.status
  }
}

export function getTransferStatusStyleKey(
  transfer: TransferRequestRow,
  currentBranchId: string
): string {
  if (transfer.status === "pending" && branchEq(getInitiatorBranchId(transfer), currentBranchId)) {
    return "in_process"
  }
  if (transfer.status === "completed" || transfer.status === "approved") {
    return "accepted"
  }
  return transfer.status
}

export function TransferStatusBadge({
  transfer,
  currentBranchId,
}: {
  transfer: TransferRequestRow
  currentBranchId: string
}) {
  const styleKey = getTransferStatusStyleKey(transfer, currentBranchId)
  return (
    <Badge variant="outline" className={STATUS_STYLE[styleKey] ?? ""}>
      {getTransferStatusLabel(transfer, currentBranchId)}
    </Badge>
  )
}

/** Only the approving branch — prefer server-computed permissions when present. */
export function canApproveTransfer(transfer: TransferRequestRow, currentBranchId: string) {
  if (transfer.permissions) return transfer.permissions.canApprove
  if (transfer.status !== "pending") return false
  if (branchEq(getInitiatorBranchId(transfer), currentBranchId)) return false
  return branchEq(getApproverBranchId(transfer), currentBranchId)
}

export function canRejectTransfer(transfer: TransferRequestRow, currentBranchId: string) {
  if (transfer.permissions) return transfer.permissions.canReject
  return canApproveTransfer(transfer, currentBranchId)
}

export function canCancelTransfer(transfer: TransferRequestRow, currentBranchId: string) {
  if (transfer.permissions) return transfer.permissions.canCancel
  return transfer.status === "pending" && branchEq(getInitiatorBranchId(transfer), currentBranchId)
}

export function isTransferInProcessForBranch(transfer: TransferRequestRow, currentBranchId: string) {
  if (transfer.permissions) return transfer.permissions.isInProcess
  return transfer.status === "pending" && branchEq(getInitiatorBranchId(transfer), currentBranchId)
}

export function getTransferApproverBranchId(transfer: TransferRequestRow): string {
  if (transfer.permissions?.approverBranchId) return transfer.permissions.approverBranchId
  return getApproverBranchId(transfer)
}

export function formatTransferDate(createdAt: string | undefined): string {
  if (!createdAt) return "—"
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return "—"
  return format(d, "dd MMM yyyy")
}
