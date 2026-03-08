"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { PlusCircle, Search, Download, FileText, FileSpreadsheet, ChevronDown, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ClientsTable } from "@/components/clients/clients-table"
import { ClientStatsCards } from "@/components/clients/client-stats-cards"
import { clientStore, type Client } from "@/lib/client-store"
import { SalesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useFeature } from "@/hooks/use-entitlements"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"
import { format } from "date-fns"

export function ClientsListPage() {
  const { toast } = useToast()
  const { hasAccess: canExport } = useFeature("data_export")
  const [searchQuery, setSearchQuery] = useState("")
  const [clients, setClients] = useState<Client[]>([])
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [statsFilter, setStatsFilter] = useState<"all" | "active" | "inactive">("all")
  const [enrichedClientsForStats, setEnrichedClientsForStats] = useState<Client[]>([])

  // Subscribe to client store changes and force reload on mount
  useEffect(() => {
    // Force reload clients from API
    clientStore.loadClients()
    
    const unsubscribe = clientStore.subscribe(() => {
      const updatedClients = clientStore.getClients()
      setClients(updatedClients)
      setFilteredClients(updatedClients)
    })
    return unsubscribe
  }, [])

  // Enrich clients with realLastVisit for stats cards (optimized for speed)
  useEffect(() => {
    if (clients.length === 0) return

    const enrichClientsForStats = async () => {
      // Start with clients that already have lastVisit - no need to fetch for them
      const enriched: Client[] = clients.map(client => ({ ...client }))
      
      // Only enrich clients that don't have a lastVisit field
      // This significantly reduces API calls
      const clientsNeedingEnrichment = clients
        .map((client, originalIndex) => ({ client, originalIndex }))
        .filter(({ client }) => !client.lastVisit)
      
      if (clientsNeedingEnrichment.length === 0) {
        // All clients already have lastVisit, use them as-is
        setEnrichedClientsForStats(enriched)
        return
      }

      // Show stats immediately with clients that have lastVisit
      setEnrichedClientsForStats(enriched)

      // Use higher concurrency for faster processing (but not too high to avoid overwhelming server)
      const concurrency = 30 // Process 30 clients in parallel
      const batches: typeof clientsNeedingEnrichment[] = []
      
      for (let i = 0; i < clientsNeedingEnrichment.length; i += concurrency) {
        batches.push(clientsNeedingEnrichment.slice(i, i + concurrency))
      }

      // Process batches sequentially but clients within each batch in parallel
      for (const batch of batches) {
        const results = await Promise.allSettled(
          batch.map(async ({ client, originalIndex }) => {
            try {
              const response = await SalesAPI.getByClient(client.phone || '')
              if (response.success && response.data && response.data.length > 0) {
                const sales = response.data
                const lastVisit = sales.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date
                return { originalIndex, realLastVisit: lastVisit }
              }
              return { originalIndex, realLastVisit: undefined }
            } catch (error) {
              return { originalIndex, realLastVisit: undefined }
            }
          })
        )

        // Apply enrichment results as we go
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            const { originalIndex, realLastVisit } = result.value
            if (originalIndex !== undefined && realLastVisit) {
              enriched[originalIndex] = { ...enriched[originalIndex], realLastVisit }
            }
          }
        })

        // Update stats cards incrementally as batches complete
        setEnrichedClientsForStats([...enriched])
      }
    }

    enrichClientsForStats()
  }, [clients])

  // Stats are calculated by ClientStatsCards component from the clients array

  // Calculate date 3 months ago for status calculation (same as table and stats cards)
  const threeMonthsAgo = useMemo(() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 3)
    date.setHours(0, 0, 0, 0)
    return date
  }, [])

  // Filter clients based on stats filter and search query
  // Use enrichedClientsForStats when available to match stats cards calculation
  const displayClients = useMemo(() => {
    // Use enriched clients (with realLastVisit) for filtering to match stats cards
    const clientsToFilter = enrichedClientsForStats.length > 0 ? enrichedClientsForStats : clients
    
    const isClientActive = (client: Client) => {
      // Calculate active status based ONLY on last visit date (within 3 months)
      // This matches what the table shows - ignore status field completely
      const lastVisit = (client as any).realLastVisit ?? client.lastVisit
      
      if (lastVisit) {
        const lastVisitDate = new Date(lastVisit)
        if (!isNaN(lastVisitDate.getTime())) {
          lastVisitDate.setHours(0, 0, 0, 0)
          // Active if last visit is within 3 months from today
          return lastVisitDate >= threeMonthsAgo
        }
      }
      
      return false // No last visit or invalid date = inactive
    }

    let filtered = clientsToFilter

    // Apply stats filter (all/active/inactive) using same logic as stats cards
    if (statsFilter === "active") {
      filtered = clientsToFilter.filter((client) => isClientActive(client))
    } else if (statsFilter === "inactive") {
      filtered = clientsToFilter.filter((client) => !isClientActive(client))
    }

    // Apply search query
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
  }, [clients, enrichedClientsForStats, statsFilter, searchQuery, threeMonthsAgo])

  // Update filtered clients when displayClients changes
  useEffect(() => {
    setFilteredClients(displayClients)
  }, [displayClients])

  // Handle filter change from stats cards
  const handleFilterChange = (filter: "all" | "active" | "inactive") => {
    setStatsFilter(filter)
  }

  // Listen for client-added event (from import)
  useEffect(() => {
    const handleClientAdded = () => {
      clientStore.loadClients()
    }
    window.addEventListener('client-added', handleClientAdded)
    return () => window.removeEventListener('client-added', handleClientAdded)
  }, [])

  const handleExportPDF = async () => {
    toast({ title: "Export requested", description: "Generating clients report PDF...", duration: 3000 })
    try {
      const { ReportsAPI } = await import('@/lib/api');
      const result = await ReportsAPI.exportClients('pdf', {
        search: searchQuery || undefined,
        status: statsFilter !== 'all' ? statsFilter : undefined
      });
      
      if (result && result.success) {
        toast({
          title: "Export Successful",
          description: result.message || "Clients report has been generated and sent to admin email(s)",
        });
      } else {
        throw new Error(result?.error || 'Export failed');
      }
    } catch (error: any) {
      console.error("PDF export error:", error);
      toast({
        title: "Export Failed",
        description: error?.message || "Failed to export PDF. Please try again.",
        variant: "destructive"
      });
    }
  }

  const handleExportXLS = async () => {
    toast({ title: "Export requested", description: "Generating clients report Excel...", duration: 3000 })
    try {
      const { ReportsAPI } = await import('@/lib/api');
      const result = await ReportsAPI.exportClients('xlsx', {
        search: searchQuery || undefined,
        status: statsFilter !== 'all' ? statsFilter : undefined
      });
      
      if (result && result.success) {
        toast({
          title: "Export Successful",
          description: result.message || "Clients report has been generated and sent to admin email(s)",
        });
      } else {
        throw new Error(result?.error || 'Export failed');
      }
    } catch (error: any) {
      console.error("XLS export error:", error);
      toast({
        title: "Export Failed",
        description: error?.message || "Failed to export Excel file. Please try again.",
        variant: "destructive"
      });
    }
  }

  return (
    <div className="flex flex-col space-y-6">
            {/* Elegant Header Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Header Background */}
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-8 py-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <Users className="h-7 w-7 text-blue-600" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold text-slate-800 mb-1">
                        Client Management
                      </h1>
                      <p className="text-slate-600 text-base">
                        Manage your salon clients, track their preferences and history
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {canExport ? (
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
                    ) : (
                      <Button
                        variant="outline"
                        className="bg-gray-100 cursor-not-allowed text-gray-500 px-6 py-2.5 shadow-md rounded-xl font-medium border-gray-200"
                        disabled
                        title="Data export requires Professional or Enterprise plan"
                      >
                        <Download className="mr-2 h-5 w-5" />
                        Export (Upgrade)
                      </Button>
                    )}
                    
                    <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-xl font-medium">
                      <Link href="/clients/new">
                        <PlusCircle className="mr-2 h-5 w-5" />
                        New Client
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Feature Highlights */}
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

            {/* Stats Cards with Filters */}
            <ClientStatsCards 
              clients={enrichedClientsForStats.length > 0 ? enrichedClientsForStats : clients}
              activeFilter={statsFilter}
              onFilterChange={handleFilterChange}
            />

            {/* Enhanced Search Section */}
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
                <div className="flex items-center gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => setSearchQuery("")}
                    className="h-12 px-6 border-gray-200 hover:border-gray-300 text-gray-700 hover:text-gray-800 hover:bg-gray-50 transition-all duration-200"
                    disabled={!searchQuery}
                  >
                    Clear Search
                  </Button>
                  <div className="text-sm text-gray-500">
                    {filteredClients.length} of {clients.length} clients
                  </div>
                </div>
              </div>
              
              {/* Search Tips */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  💡 Search tips: Use name, phone number, or email address to find clients quickly
                </p>
              </div>
            </div>
            <ClientsTable clients={filteredClients} />
    </div>
  )
}
