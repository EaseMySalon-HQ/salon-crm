"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InventoryTransfersAPI } from "@/lib/api"
import { STALE_TIME } from "@/lib/queries/staleness"
import { useTransferEligibility } from "@/hooks/use-transfer-eligibility"
import { TransferRequestForm, type TransferFormPrefill } from "./transfer-request-form"
import { TransferRequestsTable } from "./transfer-requests-table"

export function TransferRequestsTab() {
  const searchParams = useSearchParams()
  const { data: eligibility } = useTransferEligibility()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>("all")
  const [direction, setDirection] = useState<"all" | "incoming" | "outgoing">("all")
  const [search, setSearch] = useState("")
  const [formOpen, setFormOpen] = useState(false)

  const createParam = searchParams.get("create")
  const productIdParam = searchParams.get("productId")

  const prefill: TransferFormPrefill | undefined = useMemo(() => {
    if (createParam === "1" || productIdParam) {
      return { productId: productIdParam || undefined, direction: "request_in" }
    }
    return undefined
  }, [createParam, productIdParam])

  useEffect(() => {
    if (createParam === "1" && eligibility?.enabled) {
      setFormOpen(true)
    }
  }, [createParam, eligibility?.enabled])

  const { data, isLoading } = useQuery({
    queryKey: ["inventory-transfers", "list", page, status, direction, search],
    queryFn: async () => {
      const res = await InventoryTransfersAPI.listTransfers({
        page,
        limit: 20,
        status: status === "all" ? undefined : status,
        direction,
        search: search.trim() || undefined,
      })
      if (!res.success) throw new Error(res.error || "Failed to load transfers")
      return res.data
    },
    enabled: !!eligibility?.enabled,
    staleTime: STALE_TIME.dashboard,
  })

  const branchNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of eligibility?.branches ?? []) m.set(String(b.id), b.name)
    return m
  }, [eligibility])

  if (!eligibility) {
    return null
  }

  const pagination = data?.pagination

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Send stock out: the destination branch approves. Request stock in: the source branch
          approves. Switch to the correct branch to act on a transfer.
        </p>
        <Button className="gap-2" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> New request
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search product…"
            className="pl-9"
          />
        </div>
        <Select
          value={direction}
          onValueChange={(v) => {
            setDirection(v as typeof direction)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="incoming">Incoming</SelectItem>
            <SelectItem value="outgoing">Outgoing</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TransferRequestsTable
        transfers={data?.transfers ?? []}
        isLoading={isLoading}
        branchNames={branchNames}
        currentBranchId={data?.currentBranchId ?? eligibility.currentBranchId}
        isOrgOwner={data?.isOrgOwner ?? eligibility.isOrgOwner}
      />

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {pagination.page} of {pagination.pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <TransferRequestForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        branches={eligibility.branches}
        currentBranchId={eligibility.currentBranchId}
        prefill={prefill}
      />
    </div>
  )
}
