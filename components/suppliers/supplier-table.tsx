"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Eye, FileText, Receipt, Loader2, MoreHorizontal, IndianRupee } from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SuppliersAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { SupplierForm } from "./supplier-form"
import { SupplierFifoPaymentModal } from "./supplier-fifo-payment-modal"
import { POForm } from "@/components/purchase-orders/po-form"
import { format } from "date-fns"
import { hrefPurchaseInvoiceNew, hrefSupplierDetail } from "@/lib/settings-products-routes"

interface SupplierTableProps {
  onRefresh?: () => void
}

export function SupplierTable({ onRefresh }: SupplierTableProps) {
  const router = useRouter()
  const [suppliers, setSuppliers] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [showForm, setShowForm] = React.useState(false)
  const [editingSupplier, setEditingSupplier] = React.useState<any | null>(null)
  const [showPOForm, setShowPOForm] = React.useState(false)
  const [poSupplierId, setPoSupplierId] = React.useState<string | null>(null)
  const [paymentSupplier, setPaymentSupplier] = React.useState<any | null>(null)
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

  const handleNewPurchaseInvoice = (supplier: any) => {
    router.push(hrefPurchaseInvoiceNew(null, supplier._id))
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
                <TableHead className="w-[72px] text-right">Actions</TableHead>
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
                    onClick={() => router.push(hrefSupplierDetail(s._id))}
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
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Row actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => router.push(hrefSupplierDetail(s._id))}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => {
                              setEditingSupplier(s)
                              setShowForm(true)
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => handleNewOrder(s)}>
                            <FileText className="h-4 w-4 mr-2" />
                            New purchase order
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => handleNewPurchaseInvoice(s)}>
                            <Receipt className="h-4 w-4 mr-2" />
                            New purchase invoice
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => setPaymentSupplier(s)}
                          >
                            <IndianRupee className="h-4 w-4 mr-2" />
                            Record payment
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

      {showPOForm && (
        <POForm
          open={showPOForm}
          onOpenChange={(o) => { if (!o) handlePOFormClose() }}
          preselectedSupplierId={poSupplierId}
          onSaved={handlePOFormClose}
        />
      )}

      <SupplierFifoPaymentModal
        open={paymentSupplier != null}
        supplier={paymentSupplier ? { _id: paymentSupplier._id, name: paymentSupplier.name } : null}
        onOpenChange={(o) => {
          if (!o) setPaymentSupplier(null)
        }}
        onSuccess={() => {
          loadSuppliers()
          onRefresh?.()
        }}
      />
    </div>
  )
}
