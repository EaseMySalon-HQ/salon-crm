"use client"

import { useState } from "react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { MoreHorizontal, Pencil, Trash2, Phone, Mail, Calendar, ArrowRight, ShoppingCart } from "lucide-react"
import { LeadHistoryDialog } from "@/components/leads/lead-history-dialog"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { useAuth } from "@/lib/auth-context"
import { LeadsAPI } from "@/lib/api"

// Helper function to check permissions
const hasPermission = (user: any, module: string, feature: string): boolean => {
  if (!user) return false
  // Admin has all permissions
  if (user.role === 'admin') return true
  // Check if user has login access
  if (!user.hasLoginAccess) return false
  // Check specific permission
  return user.permissions?.some((p: any) => 
    p.module === module && p.feature === feature && p.enabled
  ) || false
}

interface Lead {
  _id?: string
  id?: string
  name: string
  phone: string
  email?: string
  source: string
  status: string
  interestedServices?: Array<{ serviceId?: any; serviceName?: string }>
  assignedStaffId?: { name?: string } | string
  followUpDate?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
  convertedAt?: string
  convertedToAppointmentId?: string
  convertedToClientId?: string
}

interface LeadsTableProps {
  leads: Lead[]
  onRefresh: () => void
  onEdit: (lead: Lead) => void
  onConvert: (lead: Lead) => void
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    "follow-up": "bg-orange-100 text-orange-800",
    converted: "bg-green-100 text-green-800",
    lost: "bg-gray-100 text-gray-800",
  }
  return colors[status] || "bg-gray-100 text-gray-800"
}

const getSourceLabel = (source: string) => {
  const labels: Record<string, string> = {
    "walk-in": "Walk-in",
    phone: "Phone",
    website: "Website",
    social: "Social Media",
    referral: "Referral",
    other: "Other",
  }
  return labels[source] || source
}

export function LeadsTable({ leads, onRefresh, onEdit, onConvert }: LeadsTableProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const router = useRouter()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [historyLead, setHistoryLead] = useState<Lead | null>(null)
  
  const canEdit = hasPermission(user, 'lead_management', 'edit')
  const canDelete = hasPermission(user, 'lead_management', 'delete')

  const handleDelete = async () => {
    if (!selectedLead) return

    try {
      const leadId = selectedLead._id || selectedLead.id
      if (!leadId) return

      const response = await LeadsAPI.delete(leadId)
      if (response.success) {
        toast({
          title: "Lead deleted",
          description: "Lead has been deleted successfully.",
        })
        onRefresh()
      } else {
        throw new Error(response.error || "Failed to delete lead")
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete lead. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeleteDialogOpen(false)
      setSelectedLead(null)
    }
  }

  const handleRaiseSale = (lead: Lead) => {
    try {
      // Prepare lead data to pass to quick sale
      const leadData: any = {
        leadId: lead._id || lead.id,
        clientName: lead.name,
        clientPhone: lead.phone,
        clientEmail: lead.email || "",
      }

      // Add interested services if available
      if (lead.interestedServices && lead.interestedServices.length > 0) {
        leadData.services = lead.interestedServices
          .filter((s: any) => s.serviceId && (s.serviceId._id || s.serviceId))
          .map((s: any) => ({
            serviceId: s.serviceId?._id || s.serviceId,
            serviceName: s.serviceName || s.serviceId?.name || "Service",
          }))
      }

      // Add assigned staff if available
      if (lead.assignedStaffId) {
        const staffId = typeof lead.assignedStaffId === "object" 
          ? (lead.assignedStaffId as any)._id 
          : lead.assignedStaffId
        if (staffId) {
          leadData.staffId = staffId
        }
      }

      // Encode data as base64 to pass via URL
      const encodedData = btoa(JSON.stringify(leadData))
      
      router.push(`/quick-sale?lead=${encodedData}`)
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to redirect to quick sale. Please try again.",
        variant: "destructive",
      })
    }
  }

  const columns: ColumnDef<Lead>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <button
          onClick={() => {
            setHistoryLead(row.original)
            setIsHistoryDialogOpen(true)
          }}
          className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
        >
          {row.original.name}
        </button>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-gray-500" />
          {row.original.phone}
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        row.original.email ? (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-500" />
            {row.original.email}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )
      ),
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => (
        <Badge variant="outline">{getSourceLabel(row.original.source)}</Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status
        return (
          <Badge className={getStatusColor(status)}>
            {status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ")}
          </Badge>
        )
      },
    },
    {
      accessorKey: "interestedServices",
      header: "Interested Services",
      cell: ({ row }) => {
        const services = row.original.interestedServices || []
        if (services.length === 0) return <span className="text-gray-400">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {services.slice(0, 2).map((service, idx) => {
              const serviceName = service.serviceName || service.serviceId?.name || "Service"
              const isCustom = !service.serviceId || (!service.serviceId?._id && !service.serviceId)
              return (
                <Badge 
                  key={idx} 
                  variant={isCustom ? "outline" : "secondary"} 
                  className="text-xs"
                >
                  {serviceName}
                  {isCustom && <span className="ml-1 text-[10px] text-gray-500">(custom)</span>}
                </Badge>
              )
            })}
            {services.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{services.length - 2}
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "followUpDate",
      header: "Follow-up Date",
      cell: ({ row }) => {
        const followUpDate = row.original.followUpDate
        const status = row.original.status
        if (!followUpDate) return <span className="text-gray-400">—</span>
        const date = new Date(followUpDate)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const isConverted = status === "converted"
        const isOverdue = date < today
        const isUpcoming = date >= today && date <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
        
        // If converted, always show grey; otherwise use the existing color logic
        const colorClass = isConverted 
          ? "text-muted-foreground" 
          : isOverdue 
            ? "text-red-600" 
            : isUpcoming 
              ? "text-orange-600" 
              : ""
        
        return (
          <div className={`flex items-center gap-2 ${colorClass}`}>
            <Calendar className="h-4 w-4" />
            {date.toLocaleDateString()}
          </div>
        )
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const lead = row.original
        const isConverted = lead.status === "converted"

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canEdit && (
                <DropdownMenuItem onClick={() => onEdit(lead)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {!isConverted && canEdit && (
                <DropdownMenuItem onClick={() => onConvert(lead)}>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Convert to Appointment
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleRaiseSale(lead)}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                Raise Sale
              </DropdownMenuItem>
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setSelectedLead(lead)
                      setIsDeleteDialogOpen(true)
                    }}
                    className="text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No leads found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} lead(s) total
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this lead? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {historyLead && (
        <LeadHistoryDialog
          lead={historyLead}
          open={isHistoryDialogOpen}
          onOpenChange={(open) => {
            setIsHistoryDialogOpen(open)
            if (!open) {
              setHistoryLead(null)
            }
          }}
          onLeadUpdated={(updatedLead) => {
            setHistoryLead(updatedLead)
            onRefresh()
          }}
        />
      )}
    </>
  )
}

