"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BranchManagementAPI, type BranchClientListRow, type ClientSegment } from "@/lib/api"
import { ClientSearchResults } from "@/components/branch-management/client-search-results"
import { ClientsTable } from "@/components/branch-management/clients-table"
import { ClientProfileDrawer } from "@/components/branch-management/client-profile-drawer"
import { BranchErrorNote } from "@/components/branch-management/branch-error-note"
import { STALE_TIME } from "@/lib/queries/staleness"

export default function BranchClientsPage() {
  const [input, setInput] = useState("")
  const [phone, setPhone] = useState("")
  const [listSearch, setListSearch] = useState("")
  const [segment, setSegment] = useState<ClientSegment | "all">("all")
  const [branchFilter, setBranchFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [selectedClient, setSelectedClient] = useState<BranchClientListRow | null>(null)

  const { data: searchData, isFetching: searchFetching } = useQuery({
    queryKey: ["branch-management", "client-search", phone],
    queryFn: async () => {
      const res = await BranchManagementAPI.searchClient(phone)
      if (!res.success) throw new Error(res.error || "Search failed")
      return res.data
    },
    enabled: phone.length >= 4,
    staleTime: 60_000,
  })

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["branch-management", "clients", listSearch, segment, branchFilter, page],
    queryFn: async () => {
      const res = await BranchManagementAPI.getClients({
        search: listSearch || undefined,
        segment,
        branchId: branchFilter === "all" ? undefined : branchFilter,
        page,
        limit: 25,
      })
      if (!res.success) throw new Error(res.error || "Failed to load clients")
      return res.data
    },
    staleTime: STALE_TIME.dashboard,
  })

  const { data: branchesData } = useQuery({
    queryKey: ["branch-management", "branches"],
    queryFn: async () => {
      const res = await BranchManagementAPI.getBranches()
      if (!res.success) throw new Error(res.error || "Failed to load branches")
      return res.data
    },
    staleTime: STALE_TIME.businessSettings,
  })

  const branchNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of branchesData?.branches ?? []) m.set(b.id, b.name)
    for (const c of listData?.clients ?? []) {
      for (const br of c.branches) m.set(br.branchId, br.branchName)
    }
    return m
  }, [branchesData, listData])

  const { data: profileSearch, isFetching: profileLoading } = useQuery({
    queryKey: ["branch-management", "client-profile", selectedClient?.phone],
    queryFn: async () => {
      const res = await BranchManagementAPI.searchClient(selectedClient!.phone)
      if (!res.success) throw new Error(res.error || "Search failed")
      return res.data
    },
    enabled: !!selectedClient?.phone && selectedClient.phone.replace(/\D/g, "").length >= 4,
    staleTime: 60_000,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (trimmed.length >= 4) setPhone(trimmed)
  }

  const searchBranches = searchData?.branches ?? []
  const pagination = listData?.pagination

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Quick phone search</h2>
        <form onSubmit={handleSearch} className="flex max-w-md items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search by phone number…"
              className="pl-9"
              inputMode="tel"
            />
          </div>
          <Button type="submit" disabled={input.trim().length < 4} className="gap-2">
            {searchFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
        </form>

        {searchData && <BranchErrorNote rows={searchBranches} />}

        <ClientSearchResults
          matches={searchBranches}
          homeBranchId={searchData?.homeBranchId ?? null}
          isLoading={searchFetching && !!phone}
          hasSearched={!!phone}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">All clients</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={listSearch}
              onChange={(e) => {
                setListSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Filter by name or phone…"
              className="pl-9"
            />
          </div>
          <Select
            value={segment}
            onValueChange={(v) => {
              setSegment(v as ClientSegment | "all")
              setPage(1)
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Segment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All segments</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="returning">Returning</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="at_risk">At risk</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={branchFilter}
            onValueChange={(v) => {
              setBranchFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {(branchesData?.branches ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ClientsTable
          clients={listData?.clients ?? []}
          isLoading={listLoading}
          branchNames={branchNames}
          onRowClick={setSelectedClient}
        />

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
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
      </section>

      <ClientProfileDrawer
        open={!!selectedClient}
        onOpenChange={(open) => !open && setSelectedClient(null)}
        matches={profileSearch?.branches ?? []}
        homeBranchId={profileSearch?.homeBranchId ?? selectedClient?.homeBranchId ?? null}
        isLoading={profileLoading && !!selectedClient}
        fallbackName={selectedClient?.name}
        fallbackPhone={selectedClient?.phone}
      />
    </div>
  )
}
