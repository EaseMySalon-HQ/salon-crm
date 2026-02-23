"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, useMemo } from "react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { MoreHorizontal, Pencil, Trash2, User, Phone, Mail, Calendar, TrendingUp, Eye, Receipt, Upload, Edit, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { clientStore } from "@/lib/client-store"
import { SalesAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { ClientImportModal } from "./client-import-modal"

interface Client {
  id?: string
  _id?: string
  name: string
  email?: string
  phone: string
  lastVisit?: string
  status?: "active" | "inactive"
  totalVisits?: number
  totalSpent?: number
  createdAt?: string
  // Real-time calculated fields
  realTotalVisits?: number
  realTotalSpent?: number
  realLastVisit?: string
}

interface ClientsTableProps {
  clients: Client[]
}

export function ClientsTable({ clients }: ClientsTableProps) {
  const { toast } = useToast()
  const router = useRouter()
  const { user } = useAuth()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [isBillActivityOpen, setIsBillActivityOpen] = useState(false)
  const [selectedClientBills, setSelectedClientBills] = useState<any[]>([])
  const [isLoadingBills, setIsLoadingBills] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [clientsWithStats, setClientsWithStats] = useState<Client[]>([])
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  })
  const prevClientsLengthRef = useRef<number>(0)
  const prevClientsIdsRef = useRef<string>('')

  // Reset clientsWithStats when clients prop actually changes (filter changed)
  // Use a stable reference to avoid resetting on every render
  useEffect(() => {
    // Create a stable key from clients (length + IDs of first and last clients)
    const clientsLength = clients.length
    const clientsIds = clientsLength > 0 
      ? `${clients[0]?._id || clients[0]?.id || ''}-${clients[clientsLength - 1]?._id || clients[clientsLength - 1]?.id || ''}`
      : ''
    
    // Only reset if clients actually changed (different length or different first/last client)
    if (prevClientsLengthRef.current !== clientsLength || prevClientsIdsRef.current !== clientsIds) {
      prevClientsLengthRef.current = clientsLength
      prevClientsIdsRef.current = clientsIds
      setClientsWithStats([])
      // Reset pagination to first page when filter changes
      setPagination(prev => ({ ...prev, pageIndex: 0 }))
    }
  }, [clients])

  // Fetch real-time statistics for only the currently visible page (avoid thousands of requests)
  // This function will be called from useEffect after table is created, so pageIndex/pageSize will be available
  const fetchClientStats = async (currentPageIndex: number, currentPageSize: number) => {
    if (!user || clients.length === 0) return

    setIsLoadingStats(true)
    // Always use the clients prop (filtered clients from parent)
    const start = currentPageIndex * currentPageSize
    const end = Math.min(start + currentPageSize, clients.length)
    const visible = clients.slice(start, end)

    const concurrency = 10
    const batches: typeof visible[] = []
    for (let i = 0; i < visible.length; i += concurrency) {
      batches.push(visible.slice(i, i + concurrency))
    }

    const enriched: any[] = []
    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(async (client) => {
          try {
            const response = await SalesAPI.getByClient(client.name)
            if (response.success && response.data && response.data.length > 0) {
              const sales = response.data
              const totalVisits = sales.length
              const totalSpent = sales.reduce((sum: number, sale: any) => sum + (sale.grossTotal || 0), 0)
              const lastVisit = sales.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date
              return { ...client, realTotalVisits: totalVisits, realTotalSpent: totalSpent, realLastVisit: lastVisit }
            }
            return { ...client, realTotalVisits: undefined, realTotalSpent: undefined, realLastVisit: undefined }
          } catch (error) {
            return { ...client, realTotalVisits: undefined, realTotalSpent: undefined, realLastVisit: undefined }
          }
        })
      )
      results.forEach((r, idx) => {
        enriched.push(r.status === 'fulfilled' ? r.value : batch[idx])
      })
    }

    // Merge enriched stats back into the full clients list
    const merged = clients.map((c, idx) => {
      if (idx >= start && idx < end) {
        const enrichedIdx = idx - start
        return enriched[enrichedIdx] || c
      }
      return c
    })
    setClientsWithStats(merged)
    setIsLoadingStats(false)
  }

  // NOTE: This effect is declared later in the file after pageIndex/pageSize are defined

  const handleEditClient = (client: Client) => {
    // Ensure we have a valid client ID - use _id first, then id
    const clientId = client._id || client.id
    if (clientId) {
      router.push(`/clients/${clientId}`)
    } else {
      console.error('Client missing ID:', client)
    }
  }

  const handleDeleteClient = (client: Client) => {
    setSelectedClient(client)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedClient) return

    try {
      const clientId = selectedClient._id || selectedClient.id
      
      if (!clientId) {
        toast({
          title: "Error",
          description: "Client ID not found.",
          variant: "destructive",
          duration: 5000,
        })
        return
      }

      const success = await clientStore.deleteClient(clientId)
      
      if (success) {
        toast({
          title: "Client Deleted",
          description: "Client has been successfully deleted.",
          duration: 3000,
        })
        setIsDeleteDialogOpen(false)
        setSelectedClient(null)
      } else {
        toast({
          title: "Error",
          description: "Failed to delete client. Please try again.",
          variant: "destructive",
          duration: 5000,
        })
      }
    } catch (error) {
      console.error('Error deleting client:', error)
      const errorMessage = error instanceof Error ? error.message : "Failed to delete client. Please try again."
      
      toast({
        title: "Delete Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 6000,
      })
      
      // Keep dialog open on error so user can see the message
      // Don't close the dialog or clear selectedClient
    }
  }

  const handleViewBillActivity = async (client: Client) => {
    // if (!user) {
    //   toast({
    //     title: "Authentication Required",
    //     description: "Please log in to view bill activity.",
    //     variant: "destructive",
    //   })
    //   return
    // }
    
    setSelectedClient(client)
    setIsLoadingBills(true)
    setIsBillActivityOpen(true)
    
    try {
      // Use SalesAPI instead of direct fetch
      const response = await SalesAPI.getByClient(client.name)
      
      if (response.success && response.data && response.data.length > 0) {
        setSelectedClientBills(response.data)
      } else {
        setSelectedClientBills([])
      }
    } catch (error) {
      console.error('Error fetching bills:', error)
      setSelectedClientBills([])
      // Show error toast
      toast({
        title: "Error",
        description: `Failed to fetch bill activity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      })
    } finally {
      setIsLoadingBills(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never"
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return "Invalid Date"
    }
  }

  const formatCurrency = (amount?: number) => {
    if (!amount) return "₹0"
    return `₹${amount.toLocaleString('en-IN')}`
  }

  const columns: ColumnDef<Client>[] = [
    {
      accessorKey: "name",
      header: "Customer",
      cell: ({ row }) => {
        const client = row.original
        // Ensure we have a valid client ID - use _id first, then id, as a fallback
        const clientId = client._id || client.id
        if (!clientId) {
          console.error('Client missing ID:', client)
        }
        return (
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
              <User className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <Link 
                href={`/clients/${clientId}`} 
                className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors duration-200"
              >
                {client.name}
              </Link>
              <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                <span className="flex items-center space-x-1">
                  <Phone className="h-3 w-3" />
                  {client.phone}
                </span>
                {client.email && (
                  <span className="flex items-center space-x-1">
                    <Mail className="h-3 w-3" />
                    {client.email}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "realTotalVisits",
      header: "Visits",
      cell: ({ row }) => {
        const visits = (row.original.realTotalVisits ?? row.original.totalVisits ?? 0)
        return (
          <div className="text-center">
            {isLoadingStats ? (
              <div className="w-8 h-6 bg-gray-200 rounded animate-pulse mx-auto" />
            ) : (
              <>
                <div className="text-lg font-semibold text-gray-900">{visits}</div>
                <div className="text-xs text-gray-500">total visits</div>
              </>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "realTotalSpent",
      header: "Revenue",
      cell: ({ row }) => {
        const spent = (row.original.realTotalSpent ?? row.original.totalSpent ?? 0)
        return (
          <div className="text-center">
            {isLoadingStats ? (
              <div className="w-16 h-6 bg-gray-200 rounded animate-pulse mx-auto" />
            ) : (
              <>
                <div className="text-lg font-semibold text-emerald-600">{formatCurrency(spent)}</div>
                <div className="text-xs text-gray-500">total spent</div>
              </>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "realLastVisit",
      header: "Last Visit",
      cell: ({ row }) => {
        const lastVisit = row.original.realLastVisit ?? row.original.lastVisit
        return (
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            {isLoadingStats ? (
              <div className="w-20 h-4 bg-gray-200 rounded animate-pulse" />
            ) : (
              <span className="text-sm text-gray-600">{formatDate(lastVisit)}</span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const client = row.original
        // Calculate status based on lastVisit date (same logic as filter)
        // Use only lastVisit (database value) to match filter logic, not realLastVisit
        const now = new Date()
        const threeMonthsAgo = new Date(now)
        threeMonthsAgo.setMonth(now.getMonth() - 3)
        threeMonthsAgo.setHours(0, 0, 0, 0) // Normalize to start of day
        
        // Use realLastVisit if available (from sales data), otherwise use lastVisit
        // This matches what's displayed in the "Last Visit" column
        const lastVisit = client.realLastVisit ?? client.lastVisit
        let isActive = false
        
        if (lastVisit) {
          const lastVisitDate = new Date(lastVisit)
          if (!isNaN(lastVisitDate.getTime())) {
            lastVisitDate.setHours(0, 0, 0, 0) // Normalize to start of day
            
            if (lastVisitDate >= threeMonthsAgo) {
              isActive = true
            }
          }
        }
        // If no lastVisit, client is inactive
        
        return (
          <Badge 
            variant={isActive ? "default" : "secondary"}
            className={`px-3 py-1 text-xs font-medium ${
              isActive 
                ? "bg-emerald-100 text-emerald-800 border-emerald-200" 
                : "bg-gray-100 text-gray-800 border-gray-200"
            }`}
          >
            {isActive ? "Active" : "Inactive"}
          </Badge>
        )
      },
    },
    {
      id: "billActivity",
      header: "Bill Activity",
      cell: ({ row }) => {
        const client = row.original
        return (
          <div className="text-center">
            <button
              onClick={() => handleViewBillActivity(client)}
              className="text-indigo-600 hover:text-indigo-800 font-medium hover:underline transition-colors duration-200 text-sm"
            >
              View
            </button>
          </div>
        )
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const client = row.original
        // Ensure we have a valid client ID - use _id first, then id
        const clientId = client._id || client.id
        return (
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (clientId) {
                  router.push(`/clients/${clientId}`)
                } else {
                  console.error('Client missing ID:', client)
                }
              }}
              className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors duration-200"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-gray-50">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleEditClient(client)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Client
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleDeleteClient(client)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Client
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  // Use clientsWithStats if available (enriched with stats), otherwise use clients prop (filtered)
  // Always use clients as base to maintain stable reference, and merge in stats when available
  const tableData = useMemo(() => {
    if (clientsWithStats.length > 0 && clientsWithStats.length === clients.length) {
      // Merge stats into clients array to maintain stable reference
      // Only merge if the enriched client has stats, otherwise use original
      return clients.map((client, idx) => {
        const enriched = clientsWithStats[idx]
        // Only use enriched if it has real stats data
        if (enriched && (enriched.realTotalVisits !== undefined || enriched.realTotalSpent !== undefined || enriched.realLastVisit !== undefined)) {
          return enriched
        }
        return client
      })
    }
    return clients
  }, [clients, clientsWithStats])

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination,
    },
    onPaginationChange: (updater) => {
      // Ensure pagination updates are applied correctly
      if (typeof updater === 'function') {
        setPagination(prev => updater(prev))
      } else {
        setPagination(updater)
      }
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
    // Prevent automatic pagination reset when data changes
    autoResetPageIndex: false,
  })

  const pageSize = pagination.pageSize
  const pageIndex = pagination.pageIndex
  const totalRows = clients.length // Always use the filtered clients count
  const startRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1
  const endRow = Math.min(startRow + pageSize - 1, totalRows)

  // Fetch stats when data or pagination changes (now that pageIndex/pageSize exist)
  useEffect(() => {
    fetchClientStats(pageIndex, pageSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, user, pageIndex, pageSize])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Table Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Client Directory</h3>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              Showing {startRow}-{endRow} of {totalRows} clients
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v)=>table.setPageSize(parseInt(v))}>
                <SelectTrigger className="h-8 w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImportOpen(true)}
              className="h-8 px-3 border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400"
            >
              <Upload className="h-4 w-4 mr-2" /> Import Clients
            </Button>
          </div>
        </div>
      </div>

      {/* Enhanced Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-slate-50 border-b border-slate-200">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="px-6 py-4 text-left font-semibold text-gray-700">
                    <div className="flex items-center gap-2">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      {isLoadingStats && (header.id === 'realTotalVisits' || header.id === 'realTotalSpent' || header.id === 'realLastVisit') && (
                        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => (
                <TableRow 
                  key={row.id} 
                  data-state={row.getIsSelected() && "selected"}
                  className={`hover:bg-gray-50/50 transition-colors duration-200 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-6 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  <div className="flex flex-col items-center space-y-3">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                      <User className="h-8 w-8 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-lg font-medium text-gray-900">No clients found</p>
                      <p className="text-sm text-gray-500">Try adjusting your search criteria</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Enhanced Pagination */}
      {table.getPageCount() > 1 && (
        <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Page {pagination.pageIndex + 1} of {table.getPageCount()}
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => table.previousPage()} 
                disabled={!table.getCanPreviousPage()}
                className="h-9 px-4 border-gray-200 hover:border-gray-300"
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => table.nextPage()} 
                disabled={!table.getCanNextPage()}
                className="h-9 px-4 border-gray-200 hover:border-gray-300"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Delete Client Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="border-gray-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-800">Delete Client</DialogTitle>
            <DialogDescription className="text-gray-600">
              Are you sure you want to delete <strong>{selectedClient?.name}</strong>? This action cannot be undone and will remove all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3">
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
              className="border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill Activity Modal */}
      <Dialog open={isBillActivityOpen} onOpenChange={setIsBillActivityOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden border-gray-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-indigo-600" />
              Bill Activity - {selectedClient?.name || 'No Client Selected'}
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              View all invoices and transactions for this customer
            </DialogDescription>
          </DialogHeader>
          
          
          <div className="flex-1 overflow-hidden">
            {isLoadingBills ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-gray-600">Loading bills...</p>
                </div>
              </div>
            ) : selectedClientBills.length > 0 ? (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {selectedClientBills.map((bill, index) => (
                  <div
                    key={bill._id || index}
                    className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <div className="bg-indigo-100 p-2 rounded-lg">
                            <Receipt className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">
                              Bill #{bill.billNo || bill._id?.slice(-6) || 'N/A'}
                              {(bill.isEdited === true || bill.editedAt) && <span className="text-xs text-gray-500 ml-1">(edited)</span>}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {bill.date ? new Date(bill.date).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              }) : 'Date not available'}
                            </p>
                          </div>
                        </div>
                        
                        {bill.items && bill.items.length > 0 && (
                          <div className="ml-12 mb-2">
                            <p className="text-sm text-gray-600">
                              {bill.items.length} item{bill.items.length !== 1 ? 's' : ''} • 
                              Total: <span className="font-semibold text-emerald-600">
                                ₹{bill.grossTotal ? bill.grossTotal.toLocaleString('en-IN') : '0'}
                              </span>
                            </p>
                            {/* Show some item details */}
                            <div className="mt-2 space-y-1">
                              {bill.items.slice(0, 3).map((item: any, itemIndex: number) => (
                                <div key={itemIndex} className="text-xs text-gray-500 flex items-center gap-2">
                                  <span>•</span>
                                  <span>{item.name}</span>
                                  <span className="text-gray-400">({item.type})</span>
                                  <span className="text-gray-400">x{item.quantity}</span>
                                </div>
                              ))}
                              {bill.items.length > 3 && (
                                <div className="text-xs text-gray-400">
                                  +{bill.items.length - 3} more items
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Payment information */}
                        <div className="ml-12 mt-2">
                          <p className="text-xs text-gray-500">
                            Payment: <span className="font-medium text-gray-700">{bill.paymentMode || 'N/A'}</span>
                            {bill.staffName && (
                              <span className="ml-4">
                                Staff: <span className="font-medium text-gray-700">{bill.staffName}</span>
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={`${
                            bill.status === 'completed' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : bill.status === 'pending'
                              ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {bill.status || 'completed'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/billing/${bill.billNo || bill._id}?mode=edit`)}
                          title="Edit Bill"
                          className="h-8"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        {bill.items && bill.items.some((item: any) => item.type === 'product') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/billing/${bill.billNo || bill._id}?mode=exchange`)}
                            title="Exchange Products"
                            className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/receipt/${bill.billNo || bill._id}?returnTo=/clients`)}
                          title="View Receipt"
                          className="h-8"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Receipt className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-lg font-medium text-gray-900 mb-2">No bills found</p>
                <p className="text-sm text-gray-500 text-center mb-4">
                  This customer hasn't made any purchases yet
                </p>
                
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsBillActivityOpen(false)}
              className="border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Import Modal */}
      <ClientImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportComplete={() => {
          setIsImportOpen(false)
          // Page likely receives clients via props; trigger a soft refresh by dispatching event
          window.dispatchEvent(new Event('client-added'))
        }}
      />

    </div>
  )
}
