"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  PlusCircle,
  Search,
  Download,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  Users,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { normalizeClientCommunicationConsent } from "@/lib/client-communication-consent"
import {
  DEFAULT_CLIENT_FILTERS,
  DEFAULT_CLIENT_SEGMENT_RULES,
  LAST_VISIT_OPTIONS,
  buildSegmentOptions,
  countActiveClientFilters,
  getClientSegment,
  hasActiveClientFilters,
  isBirthdayThisMonth,
  matchesLastVisitFilter,
  mergeClientSegmentRules,
  segmentLabel,
  type ClientFilterState,
  type ClientSegment,
  type ClientSegmentRules,
} from "@/lib/client-segments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ClientsTable } from "@/components/clients/clients-table"
import { ClientStatsCards } from "@/components/clients/client-stats-cards"
import { ClientsFilterPanel } from "@/components/clients/clients-filter-panel"
import { ClientSegmentRulesButton } from "@/components/clients/client-segment-rules-dialog"
import { clientStore, type Client } from "@/lib/client-store"
import { ClientSegmentRulesAPI, ClientsAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useFeature } from "@/hooks/use-entitlements"
import { useAuth } from "@/lib/auth-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CardSkeletonGrid, TableSkeleton } from "@/components/loading"

type EnrichedClient = Client & {
  realTotalVisits?: number
  realTotalSpent?: number
  realLastVisit?: string
}

function getClientStatsForFilter(client: EnrichedClient) {
  return {
    totalVisits: client.realTotalVisits ?? client.totalVisits ?? 0,
    totalSpent: client.realTotalSpent ?? client.totalSpent ?? 0,
    lastVisit: client.realLastVisit ?? client.lastVisit ?? null,
    totalDues: client.totalDues ?? 0,
  }
}

export function ClientsListPage() {
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  const { hasPermission } = useAuth()
  const canCreateClient = hasPermission("clients", "create")
  const canEditSegmentRules = hasPermission("clients", "edit")
  const [searchQuery, setSearchQuery] = useState("")
  const [clients, setClients] = useState<Client[]>([])
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [statsFilter, setStatsFilter] = useState<"all" | "active" | "inactive">("all")
  const [clientFilters, setClientFilters] = useState<ClientFilterState>(DEFAULT_CLIENT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [enrichedClientsForStats, setEnrichedClientsForStats] = useState<EnrichedClient[]>([])
  const [clientsLoading, setClientsLoading] = useState(() => clientStore.getIsLoading())
  const [segmentRules, setSegmentRules] = useState<ClientSegmentRules>(DEFAULT_CLIENT_SEGMENT_RULES)

  const segmentOptions = useMemo(() => buildSegmentOptions(segmentRules), [segmentRules])
  const activeFilterCount = countActiveClientFilters(clientFilters)

  useEffect(() => {
    void (async () => {
      try {
        const res = await ClientSegmentRulesAPI.get()
        if (res.success && res.data) {
          setSegmentRules(mergeClientSegmentRules(res.data))
        }
      } catch {
        // Keep defaults when settings cannot be loaded
      }
    })()
  }, [])

  useEffect(() => {
    void clientStore.loadClients()

    const unsubscribe = clientStore.subscribe(() => {
      setClientsLoading(clientStore.getIsLoading())
      const updatedClients = clientStore.getClients()
      setClients(updatedClients)
      setFilteredClients(updatedClients)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (clients.length === 0) {
      setEnrichedClientsForStats([])
      return
    }

    let cancelled = false
    const clientIds = clients
      .map((c) => c._id || c.id)
      .filter((id): id is string => Boolean(id) && !String(id).startsWith("shared-preview:"))

    if (clientIds.length === 0) {
      setEnrichedClientsForStats(clients)
      return
    }

    void (async () => {
      try {
        const response = await ClientsAPI.getBulkStats(clientIds)
        if (cancelled) return

        if (response.success && response.data) {
          const statsMap = response.data
          setEnrichedClientsForStats(
            clients.map((c) => {
              const cId = String(c._id || c.id || "")
              const stats = statsMap[cId]
              if (!stats) return c
              return {
                ...c,
                realTotalVisits: stats.totalVisits,
                realTotalSpent: stats.totalSpent,
                realLastVisit: stats.lastVisit,
                totalDues: stats.totalDues ?? 0,
              }
            }),
          )
        } else {
          setEnrichedClientsForStats(clients)
        }
      } catch {
        if (!cancelled) setEnrichedClientsForStats(clients)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [clients])

  const clientsForStats = useMemo(() => {
    if (enrichedClientsForStats.length === clients.length && clients.length > 0) {
      return enrichedClientsForStats
    }
    return clients
  }, [clients, enrichedClientsForStats])

  const threeMonthsAgo = useMemo(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 3)
    date.setHours(0, 0, 0, 0)
    return date
  }, [])

  const displayClients = useMemo(() => {
    const isClientActive = (client: EnrichedClient) => {
      const lastVisit = client.realLastVisit ?? client.lastVisit

      if (lastVisit) {
        const lastVisitDate = new Date(lastVisit)
        if (!isNaN(lastVisitDate.getTime())) {
          lastVisitDate.setHours(0, 0, 0, 0)
          return lastVisitDate >= threeMonthsAgo
        }
      }

      return false
    }

    let filtered = clientsForStats as EnrichedClient[]

    if (statsFilter === "active") {
      filtered = filtered.filter((client) => isClientActive(client))
    } else if (statsFilter === "inactive") {
      filtered = filtered.filter((client) => !isClientActive(client))
    }

    if (clientFilters.segments.length > 0) {
      filtered = filtered.filter((client) => {
        const stats = getClientStatsForFilter(client)
        const segment = getClientSegment(stats, segmentRules)
        return clientFilters.segments.includes(segment)
      })
    }

    if (clientFilters.genders.length > 0) {
      filtered = filtered.filter(
        (client) => client.gender && clientFilters.genders.includes(client.gender),
      )
    }

    if (clientFilters.birthdayThisMonth) {
      filtered = filtered.filter((client) => isBirthdayThisMonth(client.birthdate))
    }

    if (clientFilters.lastVisit !== "any") {
      filtered = filtered.filter((client) => {
        const stats = getClientStatsForFilter(client)
        return matchesLastVisitFilter(stats.lastVisit, clientFilters.lastVisit)
      })
    }

    const spendMin = clientFilters.spendMin.trim() ? Number(clientFilters.spendMin) : null
    const spendMax = clientFilters.spendMax.trim() ? Number(clientFilters.spendMax) : null
    if (spendMin != null && !Number.isNaN(spendMin)) {
      filtered = filtered.filter((client) => {
        const stats = getClientStatsForFilter(client)
        return stats.totalSpent >= spendMin
      })
    }
    if (spendMax != null && !Number.isNaN(spendMax)) {
      filtered = filtered.filter((client) => {
        const stats = getClientStatsForFilter(client)
        return stats.totalSpent <= spendMax
      })
    }

    if (clientFilters.whatsappOptIn) {
      filtered = filtered.filter(
        (client) => normalizeClientCommunicationConsent(client).promotionalWhatsappEnabled,
      )
    }

    if (clientFilters.hasDues) {
      filtered = filtered.filter((client) => {
        const stats = getClientStatsForFilter(client)
        return stats.totalDues > 0
      })
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((client) => {
        const name = client.name?.toLowerCase() || ""
        const phone = client.phone?.toLowerCase() || ""
        const email = client.email?.toLowerCase() || ""
        return name.includes(query) || phone.includes(query) || email.includes(query)
      })
    }

    return filtered
  }, [clientsForStats, statsFilter, searchQuery, threeMonthsAgo, clientFilters, segmentRules])

  useEffect(() => {
    setFilteredClients(displayClients)
  }, [displayClients])

  const handleFilterChange = (filter: "all" | "active" | "inactive") => {
    setStatsFilter(filter)
  }

  const toggleSegment = (segment: ClientSegment) => {
    setClientFilters((prev) => {
      const has = prev.segments.includes(segment)
      return {
        ...prev,
        segments: has
          ? prev.segments.filter((s) => s !== segment)
          : [...prev.segments, segment],
      }
    })
  }

  const clearAllFilters = () => {
    setClientFilters(DEFAULT_CLIENT_FILTERS)
    setSearchQuery("")
  }

  const clearPanelFilters = () => {
    setClientFilters(DEFAULT_CLIENT_FILTERS)
  }

  useEffect(() => {
    const handleClientAdded = () => {
      clientStore.loadClients()
    }
    window.addEventListener("client-added", handleClientAdded)
    return () => window.removeEventListener("client-added", handleClientAdded)
  }, [])

  const handleExportPDF = async () => {
    toast({ title: "Export requested", description: "Generating clients report PDF...", duration: 3000 })
    try {
      const { ReportsAPI } = await import("@/lib/api")
      const result = await ReportsAPI.exportClients("pdf", {
        search: searchQuery || undefined,
        status: statsFilter !== "all" ? statsFilter : undefined,
      })

      if (result && result.success) {
        toast({
          title: "Export Successful",
          description: result.message || "Clients report has been generated and sent to admin email(s)",
        })
      } else {
        throw new Error(result?.error || "Export failed")
      }
    } catch (error: any) {
      console.error("PDF export error:", error)
      toast({
        title: "Export Failed",
        description: error?.message || "Failed to export PDF. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleExportXLS = async () => {
    toast({ title: "Export requested", description: "Generating clients report Excel...", duration: 3000 })
    try {
      const { ReportsAPI } = await import("@/lib/api")
      const result = await ReportsAPI.exportClients("xlsx", {
        search: searchQuery || undefined,
        status: statsFilter !== "all" ? statsFilter : undefined,
      })

      if (result && result.success) {
        toast({
          title: "Export Successful",
          description: result.message || "Clients report has been generated and sent to admin email(s)",
        })
      } else {
        throw new Error(result?.error || "Export failed")
      }
    } catch (error: any) {
      console.error("XLS export error:", error)
      toast({
        title: "Export Failed",
        description: error?.message || "Failed to export Excel file. Please try again.",
        variant: "destructive",
      })
    }
  }

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []

    for (const segment of clientFilters.segments) {
      chips.push({
        key: `segment-${segment}`,
        label: segmentLabel(segment, segmentRules),
        onRemove: () => toggleSegment(segment),
      })
    }

    if (clientFilters.genders.length > 0) {
      chips.push({
        key: "gender",
        label: `Gender: ${clientFilters.genders.map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(", ")}`,
        onRemove: () => setClientFilters((prev) => ({ ...prev, genders: [] })),
      })
    }

    if (clientFilters.birthdayThisMonth) {
      chips.push({
        key: "birthday",
        label: "Birthday this month",
        onRemove: () => setClientFilters((prev) => ({ ...prev, birthdayThisMonth: false })),
      })
    }

    if (clientFilters.lastVisit !== "any") {
      const lastVisitLabel =
        LAST_VISIT_OPTIONS.find((o) => o.id === clientFilters.lastVisit)?.label ?? clientFilters.lastVisit
      chips.push({
        key: "last-visit",
        label: `Last visit: ${lastVisitLabel}`,
        onRemove: () => setClientFilters((prev) => ({ ...prev, lastVisit: "any" })),
      })
    }

    if (clientFilters.spendMin.trim() || clientFilters.spendMax.trim()) {
      const min = clientFilters.spendMin.trim()
      const max = clientFilters.spendMax.trim()
      const spendLabel =
        min && max
          ? `Spend: ₹${min}–₹${max}`
          : min
            ? `Spend: ≥ ₹${min}`
            : `Spend: ≤ ₹${max}`
      chips.push({
        key: "spend",
        label: spendLabel,
        onRemove: () => setClientFilters((prev) => ({ ...prev, spendMin: "", spendMax: "" })),
      })
    }

    if (clientFilters.whatsappOptIn) {
      chips.push({
        key: "whatsapp",
        label: "WhatsApp opt-in",
        onRemove: () => setClientFilters((prev) => ({ ...prev, whatsappOptIn: false })),
      })
    }

    if (clientFilters.hasDues) {
      chips.push({
        key: "dues",
        label: "Has dues",
        onRemove: () => setClientFilters((prev) => ({ ...prev, hasDues: false })),
      })
    }

    return chips
  }, [clientFilters, segmentRules])

  return (
    <div className="flex flex-col space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white rounded-xl shadow-sm">
                <Users className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-800 mb-1">Client Management</h1>
                <p className="text-slate-600 text-base">
                  Manage your salon clients, track their preferences and history
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {canExport && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-white hover:bg-slate-50 text-slate-700 px-6 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-xl font-medium border-slate-200"
                    >
                      <Download className="mr-2 h-5 w-5" />
                      Export
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                      <FileText className="h-4 w-4 mr-2" />
                      Export as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportXLS} className="cursor-pointer">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export as Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {canCreateClient && (
                <Button
                  asChild
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-xl font-medium"
                >
                  <Link href="/clients/new">
                    <PlusCircle className="mr-2 h-5 w-5" />
                    New Client
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="px-8 py-4 bg-white border-t border-slate-100">
          <div className="flex items-center gap-8 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Customer relationship management</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
              <span>Service history tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span>Preference management</span>
            </div>
          </div>
        </div>
      </div>

      {clientsLoading && clients.length === 0 ? (
        <CardSkeletonGrid count={4} size="sm" columns="grid-cols-2 md:grid-cols-4" />
      ) : (
        <ClientStatsCards
          clients={clientsForStats}
          activeFilter={statsFilter}
          onFilterChange={handleFilterChange}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 mr-1">
            Segment
          </span>
          {segmentOptions.map((opt) => {
            const active = clientFilters.segments.includes(opt.id)
            return (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => toggleSegment(opt.id)}
                title={opt.description}
              >
                {opt.label}
              </Button>
            )
          })}
          <ClientSegmentRulesButton
            rules={segmentRules}
            onSaved={setSegmentRules}
            canEdit={canEditSegmentRules}
          />
        </div>

        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
            <span className="text-xs text-slate-500">Active filters:</span>
            {activeFilterChips.map((chip) => (
              <Badge
                key={chip.key}
                variant="secondary"
                className="gap-1 pl-2.5 pr-1 py-1 text-xs font-normal"
              >
                {chip.label}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-slate-300/60"
                  onClick={chip.onRemove}
                  aria-label={`Remove ${chip.label} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-slate-600"
              onClick={clearPanelFilters}
            >
              Clear all
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              placeholder="Search clients by name, phone, or email..."
              className="pl-10 h-12 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20 transition-all duration-300 text-base"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                  {filteredClients.length} results
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={activeFilterCount > 0 ? "default" : "outline"}
                  className="h-12 px-4"
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-5 min-w-5 rounded-full px-1.5 text-[10px] bg-white/20 text-inherit"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-4">
                <ClientsFilterPanel filters={clientFilters} onChange={setClientFilters} />
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              onClick={clearAllFilters}
              className="h-12 px-6 border-gray-200 hover:border-gray-300 text-gray-700 hover:text-gray-800 hover:bg-gray-50 transition-all duration-200"
              disabled={!searchQuery && !hasActiveClientFilters(clientFilters)}
            >
              Clear filters
            </Button>
            <div className="text-sm text-gray-500">
              {filteredClients.length} of {clients.length} clients
            </div>
          </div>
        </div>
      </div>

      {clientsLoading && clients.length === 0 ? (
        <TableSkeleton rows={10} columns={6} showToolbar={false} />
      ) : (
        <ClientsTable clients={filteredClients} />
      )}
    </div>
  )
}
