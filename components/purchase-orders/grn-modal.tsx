"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PurchaseOrdersAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

interface GRNModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseOrder: any
  onSuccess?: () => void
}

export function GRNModal({ open, onOpenChange, purchaseOrder, onSuccess }: GRNModalProps) {
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const [receivedItems, setReceivedItems] = React.useState<{ productId: string; orderedQty: number; previouslyReceived: number; receivedQty: number; unitCost: number }[]>([])
  const [grnNotes, setGrnNotes] = React.useState("")
  const isPartialReceive = purchaseOrder?.status === "partially_received"

  React.useEffect(() => {
    if (open && purchaseOrder?.items) {
      const existingReceived = (purchaseOrder.receivedItems || []).reduce(
        (acc: Record<string, number>, r: any) => {
          const pid = (r.productId?._id || r.productId)?.toString()
          if (pid) acc[pid] = r.receivedQty || 0
          return acc
        },
        {}
      )
      setReceivedItems(
        purchaseOrder.items.map((item: any) => {
          const pid = (item.productId?._id || item.productId)?.toString()
          const ordered = item.quantity || 0
          const prev = existingReceived[pid] || 0
          const remaining = Math.max(0, ordered - prev)
          return {
            productId: pid || item.productId?._id || item.productId,
            orderedQty: ordered,
            previouslyReceived: prev,
            receivedQty: remaining,
            unitCost: item.unitCost || 0,
          }
        })
      )
      setGrnNotes("")
    }
  }, [open, purchaseOrder?.items, purchaseOrder?.receivedItems, purchaseOrder?.status])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const hasReceived = receivedItems.some((r) => r.receivedQty > 0)
    if (!hasReceived) {
      toast({ title: "Error", description: "At least one item must have received quantity > 0", variant: "destructive" })
      return
    }
    try {
      setSaving(true)
      const res = await PurchaseOrdersAPI.receive(purchaseOrder._id, {
        receivedItems: receivedItems.map((r) => ({
          productId: r.productId,
          receivedQty: r.receivedQty,
          unitCost: r.unitCost,
        })),
        grnNotes,
      })
      if (res.success) {
        toast({ title: "Success", description: "Goods received and inventory updated" })
        onSuccess?.()
        onOpenChange(false)
      } else {
        toast({ title: "Error", description: res.error || "Failed", variant: "destructive" })
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.response?.data?.error || "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const updateReceived = (idx: number, receivedQty: number) => {
    setReceivedItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], receivedQty }
      return next
    })
  }

  if (!purchaseOrder) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mark as Received - {purchaseOrder.poNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Received Quantities</Label>
            <p className="text-sm text-muted-foreground">
              {isPartialReceive
                ? "Enter the quantity received in this delivery. Remaining items will be received next time."
                : "Enter the quantity received for each item. Adjust if supplier sent less or more."}
            </p>
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2">Product</th>
                    <th className="text-right p-2 w-24">Ordered</th>
                    {isPartialReceive && <th className="text-right p-2 w-24">Prev. Received</th>}
                    <th className="text-right p-2 w-28">Receive Now</th>
                  </tr>
                </thead>
                <tbody>
                  {receivedItems.map((item, idx) => {
                    const productName =
                      purchaseOrder.items?.[idx]?.productName ||
                      purchaseOrder.items?.find((i: any) => (i.productId?._id || i.productId)?.toString() === item.productId)?.productName ||
                      "Product"
                    return (
                      <tr key={idx} className="border-b">
                        <td className="p-2">{productName}</td>
                        <td className="p-2 text-right">{item.orderedQty}</td>
                        {isPartialReceive && <td className="p-2 text-right text-muted-foreground">{item.previouslyReceived}</td>}
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            className="w-20 h-8 text-right ml-auto"
                            value={item.receivedQty}
                            onChange={(e) => updateReceived(idx, Math.max(0, parseInt(e.target.value) || 0))}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grnNotes">Notes</Label>
            <Textarea
              id="grnNotes"
              value={grnNotes}
              onChange={(e) => setGrnNotes(e.target.value)}
              placeholder="Any notes about this delivery"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Receive
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
