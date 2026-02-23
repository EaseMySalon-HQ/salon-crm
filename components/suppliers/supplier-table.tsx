"use client"

import * as React from "react"
import { Plus, Pencil, Eye, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SuppliersAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { SupplierForm } from "./supplier-form"
import { SupplierDrawer } from "./supplier-drawer"
import { POForm } from "@/components/purchase-orders/po-form"
import { format } from "date-fns"

interface SupplierTableProps {
  onRefresh?: () => void
}

export function SupplierTable({ onRefresh }: SupplierTableProps) {
  const [suppliers, setSuppliers] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [showForm, setShowForm] = React.useState(false)
  const [editingSupplier, setEditingSupplier] = React.useState<any | null>(null)
  const [drawerSupplier, setDrawerSupplier] = React.useState<any | null>(null)
  const [showPOForm, setShowPOForm] = React.useState(false)
  const [poSupplierId, setPoSupplierId] = React.useState<string | null>(null)
  const { toast } = useToast()

  const loadSuppliers = React.useCallback(async () => {
    try {
      setLoading(true)
      const res = await SuppliersAPI.getAll({
        search: search || undefined,
        activeOnly: false,
        withSummary: true,
      })
      if (res.success && res.data) {
        setSuppliers(res.data)
      }
    } catch (err) {
      console.error(err)
      toast({ title: "Error", description: "Failed to load suppliers", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [search, toast])

  React.useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  const handleSaved = () => {
    setShowForm(false)
    setEditingSupplier(null)
    loadSuppliers()
    onRefresh?.()
  }

  const handleNewOrder = (supplier: any) => {
    setPoSupplierId(supplier._id)
    setShowPOForm(true)
  }

  const handlePOFormClose = () => {
    setShowPOForm(false)
    setPoSupplierId(null)
    loadSuppliers()
    onRefresh?.()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <Input
          placeholder="Search suppliers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={() => { setEditingSupplier(null); setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      <div className="rounded-md border">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Last Order</TableHead>
                <TableHead className="w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No suppliers found. Add one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow
                    key={s._id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setDrawerSupplier(s)}
                  >
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.contactPerson || s.phone || s.email || "-"}</TableCell>
                    <TableCell className="text-right">
                      {s.outstandingAmount > 0 ? (
                        <span className="text-amber-600 font-medium">
                          ₹{(s.outstandingAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {s.lastOrderDate
                        ? format(new Date(s.lastOrderDate), "dd MMM yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDrawerSupplier(s)}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setEditingSupplier(s); setShowForm(true) }}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleNewOrder(s)}
                          title="New Order"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <SupplierForm
        open={showForm}
        onOpenChange={(o) => { if (!o) { setShowForm(false); setEditingSupplier(null) } }}
        supplier={editingSupplier}
        onSaved={handleSaved}
      />

      <SupplierDrawer
        supplier={drawerSupplier}
        open={!!drawerSupplier}
        onOpenChange={(o) => { if (!o) setDrawerSupplier(null) }}
        onEdit={() => {
          if (drawerSupplier) {
            setEditingSupplier(drawerSupplier)
            setDrawerSupplier(null)
            setShowForm(true)
          }
        }}
        onNewOrder={() => drawerSupplier && handleNewOrder(drawerSupplier)}
        onRefresh={loadSuppliers}
      />

      {showPOForm && (
        <POForm
          open={showPOForm}
          onOpenChange={(o) => { if (!o) handlePOFormClose() }}
          preselectedSupplierId={poSupplierId}
          onSaved={handlePOFormClose}
        />
      )}
    </div>
  )
}
