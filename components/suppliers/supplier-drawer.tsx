"use client"

import * as React from "react"
import { FileText, Loader2, User, Phone, MessageCircle, Hash, Tag, Building2, StickyNote } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { SuppliersAPI } from "@/lib/api"
import { format } from "date-fns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface SupplierDrawerProps {
  supplier: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onNewOrder?: () => void
  onEdit?: () => void
  onRefresh?: () => void
}

function DetailRow({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  const displayValue = value?.trim() || "—"
  return (
    <div className="flex gap-3 py-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-sm mt-0.5 break-words ${value?.trim() ? "font-medium" : "text-muted-foreground"}`}>{displayValue}</p>
      </div>
    </div>
  )
}

export function SupplierDrawer({ supplier, open, onOpenChange, onNewOrder, onEdit, onRefresh }: SupplierDrawerProps) {
  const [orders, setOrders] = React.useState<any[]>([])
  const [outstanding, setOutstanding] = React.useState<{ outstanding: number; payables: any[] } | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (open && supplier?._id) {
      setLoading(true)
      Promise.all([
        SuppliersAPI.getOrders(supplier._id),
        SuppliersAPI.getOutstanding(supplier._id),
      ])
        .then(([ordersRes, outstandingRes]) => {
          if (ordersRes.success) setOrders(ordersRes.data || [])
          if (outstandingRes.success) setOutstanding(outstandingRes.data)
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [open, supplier?._id])

  if (!supplier) return null

  const categories = Array.isArray(supplier.categories) ? supplier.categories : (supplier.category ? [supplier.category] : [])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-xl">{supplier.name}</SheetTitle>
          {(onEdit || onNewOrder) && (
            <div className="flex gap-2 mt-2">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  Edit Details
                </Button>
              )}
              {onNewOrder && (
                <Button size="sm" onClick={onNewOrder}>
                  <FileText className="h-4 w-4 mr-1" />
                  New Order
                </Button>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="space-y-4">
          {/* Contact & Company Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Contact & Company Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <DetailRow label="Contact Name" value={supplier.contactPerson || ""} icon={User} />
              <DetailRow label="Contact Number" value={supplier.phone || ""} icon={Phone} />
              <DetailRow label="WhatsApp Number" value={supplier.whatsapp || ""} icon={MessageCircle} />
              <DetailRow label="Email" value={supplier.email || ""} />
              <div className="flex gap-3 py-2">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Address</p>
                  <p className="text-sm font-medium mt-0.5 break-words">{supplier.address?.trim() || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* GST & Categories */}
          <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Tax & Categories
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <DetailRow label="GST Number" value={supplier.gstNumber || ""} icon={Hash} />
                {categories.length > 0 ? (
                <div className="flex gap-3 py-2">
                  <Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categories</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {categories.map((c: string) => (
                        <Badge key={c} variant="secondary" className="text-xs">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 py-2">
                  <Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categories</p>
                    <p className="text-sm text-muted-foreground mt-0.5">—</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bank Account Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Bank Account Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{supplier.bankDetails?.trim() || "—"}</p>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <StickyNote className="h-4 w-4" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{supplier.notes?.trim() || "—"}</p>
            </CardContent>
          </Card>

          {/* Outstanding */}
          {supplier.outstandingAmount > 0 && (
            <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                  Outstanding Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold text-amber-700 dark:text-amber-400">
                  ₹{(supplier.outstandingAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Order History */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Order History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : orders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No orders yet</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o) => (
                        <TableRow key={o._id}>
                          <TableCell className="font-medium">{o.poNumber}</TableCell>
                          <TableCell>{format(new Date(o.orderDate), "dd MMM yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant={o.status === "received" ? "default" : o.status === "cancelled" ? "destructive" : "secondary"}>
                              {o.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            ₹{(o.grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Outstanding Dues */}
          {outstanding && outstanding.payables?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Outstanding Dues
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outstanding.payables.map((p: any) => {
                        const bal = (p.totalAmount || 0) - (p.amountPaid || 0)
                        if (bal <= 0) return null
                        return (
                          <TableRow key={p._id}>
                            <TableCell>{p.purchaseOrderId?.poNumber || "-"}</TableCell>
                            <TableCell>{p.dueDate ? format(new Date(p.dueDate), "dd MMM yyyy") : "-"}</TableCell>
                            <TableCell className="text-right text-amber-600 font-medium">
                              ₹{bal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
