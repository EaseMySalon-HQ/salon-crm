"use client"

import { useState } from "react"
import Link from "next/link"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  ArrowRight,
  Building2,
  Calendar,
  ExternalLink,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react"
import { AdminLeadsAPI, type PlatformLeadRow } from "@/lib/admin-api"
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_COLORS,
  adminAssigneeName,
  formatLeadStatus,
  hasAdminLeadPermission,
} from "@/lib/admin-lead-permissions"
import { useAdminAuth } from "@/lib/admin-auth-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { AdminLeadHistoryDialog } from "@/components/admin/leads/admin-lead-history-dialog"

type AdminLeadsTableProps = {
  leads: PlatformLeadRow[]
  onRefresh: () => void
  onEdit: (lead: PlatformLeadRow) => void
  onConvert: (lead: PlatformLeadRow) => void
}

export function AdminLeadsTable({ leads, onRefresh, onEdit, onConvert }: AdminLeadsTableProps) {
  const { admin } = useAdminAuth()
  const { toast } = useToast()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedLead, setSelectedLead] = useState<PlatformLeadRow | null>(null)
  const [historyLead, setHistoryLead] = useState<PlatformLeadRow | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const canEdit = hasAdminLeadPermission(admin, "update")
  const canDelete = hasAdminLeadPermission(admin, "delete")

  const handleDelete = async () => {
    if (!selectedLead?._id) return
    try {
      await AdminLeadsAPI.delete(selectedLead._id)
      toast({ title: "Lead deleted", description: "Lead has been removed." })
      onRefresh()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete lead."
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setDeleteOpen(false)
      setSelectedLead(null)
    }
  }

  const columns: ColumnDef<PlatformLeadRow>[] = [
    {
      accessorKey: "name",
      header: "Contact",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => {
            setHistoryLead(row.original)
            setHistoryOpen(true)
          }}
          className="text-left font-medium text-blue-600 hover:underline"
        >
          {row.original.name}
        </button>
      ),
    },
    {
      accessorKey: "salonName",
      header: "Salon",
      cell: ({ row }) =>
        row.original.salonName ? (
          <span className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            {row.original.salonName}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      accessorKey: "city",
      header: "City",
      cell: ({ row }) =>
        row.original.city ? (
          <span>{row.original.city}</span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-slate-400" />
          {row.original.phone}
        </span>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) =>
        row.original.email ? (
          <span className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-slate-400" />
            {row.original.email}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => (
        <Badge variant="outline">{LEAD_SOURCE_LABELS[row.original.source] || row.original.source}</Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge className={LEAD_STATUS_COLORS[row.original.status] || ""}>
          {formatLeadStatus(row.original.status)}
        </Badge>
      ),
    },
    {
      accessorKey: "assignedAdminId",
      header: "Assigned",
      cell: ({ row }) => (
        <span className="text-sm">{adminAssigneeName(row.original.assignedAdminId)}</span>
      ),
    },
    {
      accessorKey: "followUpDate",
      header: "Follow-up",
      cell: ({ row }) => {
        const followUpDate = row.original.followUpDate
        if (!followUpDate) return <span className="text-slate-400">—</span>
        const date = new Date(followUpDate)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const isConverted = row.original.status === "converted"
        const isOverdue = !isConverted && date < today
        return (
          <span
            className={`flex items-center gap-1.5 text-sm ${isOverdue ? "text-red-600" : isConverted ? "text-slate-500" : ""}`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {date.toLocaleDateString()}
          </span>
        )
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const lead = row.original
        const isConverted = lead.status === "converted"
        const businessId =
          typeof lead.convertedToBusinessId === "object" && lead.convertedToBusinessId
            ? lead.convertedToBusinessId._id
            : (lead.convertedToBusinessId as string | undefined)

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
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
                  Link to business
                </DropdownMenuItem>
              )}
              {isConverted && businessId && (
                <DropdownMenuItem asChild>
                  <Link href={`/admin/businesses/${businessId}`}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View business
                  </Link>
                </DropdownMenuItem>
              )}
              {canDelete && !isConverted && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => {
                      setSelectedLead(lead)
                      setDeleteOpen(true)
                    }}
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
      <div className="rounded-lg border border-slate-200/80 overflow-hidden bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-slate-50/80">
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
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                  No leads found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 py-4">
        <p className="flex-1 text-sm text-slate-500">{leads.length} lead(s)</p>
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete lead</DialogTitle>
            <DialogDescription>
              Delete {selectedLead?.name}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {historyLead && (
        <AdminLeadHistoryDialog
          lead={historyLead}
          open={historyOpen}
          onOpenChange={(open) => {
            setHistoryOpen(open)
            if (!open) setHistoryLead(null)
          }}
          onLeadUpdated={(updated) => {
            setHistoryLead(updated)
            onRefresh()
          }}
        />
      )}
    </>
  )
}
