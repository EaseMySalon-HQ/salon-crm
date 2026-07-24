"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Package, Plus, Trash2 } from "lucide-react"

import { ProductsAPI, SalesAPI, InventoryAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type ProductRow = {
  _id: string
  name: string
  stock?: number
  volume?: number
  volumeUnit?: string
  baseUnit?: string
}

type ConsumptionLine = {
  id: string
  productId: string
  quantity: string
}

type PriorLog = {
  id: string
  productName: string
  quantityConsumed: number
  unit: string
  source: string
  createdAt?: string
  notes?: string
}

export type RecordConsumptionDialogProps = {
  /** Bill mode links deductions to a sale; standalone is for end-of-day bulk recording. */
  mode?: "bill" | "standalone"
  saleId?: string
  billNo?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecorded?: () => void
}

function productUnit(p: ProductRow): string {
  return (p.volumeUnit || p.baseUnit || "pcs").toLowerCase()
}

function newLineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function RecordConsumptionDialog({
  mode = "bill",
  saleId,
  billNo,
  open,
  onOpenChange,
  onRecorded,
}: RecordConsumptionDialogProps) {
  const { toast } = useToast()
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [loadingPrior, setLoadingPrior] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [lines, setLines] = useState<ConsumptionLine[]>([{ id: newLineId(), productId: "", quantity: "" }])
  const [notes, setNotes] = useState("")
  const [priorLogs, setPriorLogs] = useState<PriorLog[]>([])

  const productById = useMemo(() => {
    const map = new Map<string, ProductRow>()
    for (const p of products) map.set(String(p._id), p)
    return map
  }, [products])

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true)
    try {
      const res = await ProductsAPI.getAll({ limit: 1000 })
      if (res.success && Array.isArray(res.data)) {
        setProducts(
          res.data.map((p: ProductRow & { id?: string }) => ({
            _id: String(p._id || p.id),
            name: p.name,
            stock: p.stock,
            volume: p.volume,
            volumeUnit: p.volumeUnit,
            baseUnit: p.baseUnit,
          }))
        )
      }
    } catch (err) {
      console.error("Failed to load products:", err)
      toast({
        title: "Error",
        description: "Could not load products.",
        variant: "destructive",
      })
    } finally {
      setLoadingProducts(false)
    }
  }, [toast])

  const loadPriorLogs = useCallback(async () => {
    if (mode !== "bill" || !saleId) {
      setPriorLogs([])
      return
    }
    setLoadingPrior(true)
    try {
      const res = await SalesAPI.getConsumptionPreview(saleId)
      if (res.success && res.data?.priorLogs) {
        setPriorLogs(res.data.priorLogs)
      } else {
        setPriorLogs([])
      }
    } catch {
      setPriorLogs([])
    } finally {
      setLoadingPrior(false)
    }
  }, [mode, saleId])

  useEffect(() => {
    if (!open) {
      setLines([{ id: newLineId(), productId: "", quantity: "" }])
      setNotes("")
      setPriorLogs([])
      return
    }
    void loadProducts()
    void loadPriorLogs()
  }, [open, loadProducts, loadPriorLogs])

  const addLine = () => {
    setLines((prev) => [...prev, { id: newLineId(), productId: "", quantity: "" }])
  }

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)))
  }

  const updateLine = (id: string, patch: Partial<ConsumptionLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const validEntries = useMemo(() => {
    return lines
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        notes: notes.trim(),
      }))
      .filter((e) => e.productId && Number.isFinite(e.quantity) && e.quantity > 0)
  }, [lines, notes])

  const handleSubmit = async () => {
    if (validEntries.length === 0) {
      toast({
        title: "Add products",
        description: "Select at least one product and enter a quantity to deduct.",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      const body = { entries: validEntries, notes: notes.trim() }
      const res =
        mode === "bill" && saleId
          ? await SalesAPI.recordConsumption(saleId, body)
          : await InventoryAPI.recordManualConsumption(body)

      if (!res.success) {
        toast({
          title: "Not recorded",
          description: res.error || "Could not record consumption.",
          variant: "destructive",
        })
        return
      }

      const count = res.data?.recordedCount ?? 0
      const warnings = res.data?.warnings?.filter(Boolean) || []
      toast({
        title: "Consumption recorded",
        description:
          warnings.length > 0
            ? `Recorded ${count} line(s). ${warnings[0]}`
            : `Inventory updated for ${count} product line(s).`,
      })
      onOpenChange(false)
      onRecorded?.()
    } catch (err) {
      console.error("Failed to record consumption:", err)
      toast({
        title: "Error",
        description: "Failed to record consumption.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const title =
    mode === "bill" && billNo ? `Record consumption — ${billNo}` : "Record consumption"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {mode === "bill"
              ? "Select products used for this bill and enter how much to deduct from inventory."
              : "Record overall product usage (e.g. at closing) without linking to a specific bill."}
          </DialogDescription>
        </DialogHeader>

        {loadingProducts ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading products…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-[140px]">Quantity</TableHead>
                    <TableHead className="w-[72px]">Unit</TableHead>
                    <TableHead className="w-[48px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const product = line.productId ? productById.get(line.productId) : undefined
                    const unit = product ? productUnit(product) : "—"
                    return (
                      <TableRow key={line.id}>
                        <TableCell>
                          <Select
                            value={line.productId || undefined}
                            onValueChange={(v) => updateLine(line.id, { productId: v })}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p._id} value={p._id}>
                                  {p.name}
                                  {p.stock != null ? ` (stock: ${p.stock})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            placeholder="0"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{unit}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => removeLine(line.id)}
                            disabled={lines.length <= 1}
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4 mr-2" />
              Add product
            </Button>

            <div className="space-y-2">
              <Label htmlFor="consumption-notes">Notes (optional)</Label>
              <Textarea
                id="consumption-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Colour mix for haircut"
                rows={2}
              />
            </div>

            {mode === "bill" && priorLogs.length > 0 ? (
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Already recorded on this bill</p>
                {loadingPrior ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    {priorLogs.slice(0, 8).map((log) => (
                      <li key={log.id}>
                        {log.productName}: {log.quantityConsumed} {log.unit}
                        {log.source === "auto" ? " (auto)" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Enter quantity in the product&apos;s unit (e.g. ml or pcs). For bottled products with volume,
              stock is deducted in units automatically.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loadingProducts || submitting || validEntries.length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Recording…
              </>
            ) : (
              "Record consumption"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
