"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConsumptionRulesAPI, ProductsAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Package, Plus, Trash2, Loader2 } from "lucide-react"

const UNITS = [
  { value: "g", label: "g" },
  { value: "ml", label: "ml" },
  { value: "pcs", label: "pcs" },
]

interface ServiceConsumptionRulesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: { _id: string; id?: string; name: string } | null
  onRulesChange?: () => void
}

export function ServiceConsumptionRulesDialog({
  open,
  onOpenChange,
  service,
  onRulesChange,
}: ServiceConsumptionRulesDialogProps) {
  const { toast } = useToast()
  const serviceId = service?._id || service?.id
  const [rules, setRules] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [addProductId, setAddProductId] = useState("")
  const [addQuantity, setAddQuantity] = useState("")
  const [addUnit, setAddUnit] = useState("pcs")
  const [addAdjustable, setAddAdjustable] = useState(false)
  const [addMaxPct, setAddMaxPct] = useState("20")
  const [saving, setSaving] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkRows, setBulkRows] = useState<{ productId: string; quantityUsed: string; unit: string }[]>([{ productId: "", quantityUsed: "", unit: "pcs" }])

  useEffect(() => {
    if (!open) return
    if (serviceId) {
      setLoading(true)
      Promise.all([
        ConsumptionRulesAPI.list({ serviceId }),
        ProductsAPI.getAll({ limit: 500 }),
      ])
        .then(([rulesRes, productsRes]) => {
          if (rulesRes.success && rulesRes.data) setRules(rulesRes.data)
          if (productsRes?.data) setProducts(Array.isArray(productsRes.data) ? productsRes.data : [])
        })
        .catch((e) => {
          toast({ title: "Error", description: e?.message || "Failed to load", variant: "destructive" })
        })
        .finally(() => setLoading(false))
    } else {
      setRules([])
    }
  }, [open, serviceId, toast])

  const handleAddRule = async () => {
    if (!serviceId || !addProductId || !addQuantity) {
      toast({ title: "Missing fields", description: "Select product and enter quantity.", variant: "destructive" })
      return
    }
    const qty = parseFloat(addQuantity)
    if (isNaN(qty) || qty < 0) {
      toast({ title: "Invalid quantity", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await ConsumptionRulesAPI.create({
        serviceId,
        productId: addProductId,
        quantityUsed: qty,
        unit: addUnit,
        isAdjustable: addAdjustable,
        maxAdjustmentPercent: parseInt(addMaxPct, 10) || 20,
      })
      if (res.success) {
        const list = await ConsumptionRulesAPI.list({ serviceId })
        if (list.success && list.data) setRules(list.data)
        setAddProductId("")
        setAddQuantity("")
        setAddUnit("pcs")
        setAddAdjustable(false)
        setAddMaxPct("20")
        onRulesChange?.()
        toast({ title: "Rule added" })
      } else throw new Error(res.error)
    } catch (e: any) {
      toast({ title: "Failed to add rule", description: e?.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!serviceId) return
    setSaving(true)
    try {
      const res = await ConsumptionRulesAPI.delete(ruleId)
      if (res.success) {
        setRules((prev) => prev.filter((r) => (r._id || r.id) !== ruleId))
        onRulesChange?.()
        toast({ title: "Rule removed" })
      } else throw new Error(res.error)
    } catch (e: any) {
      toast({ title: "Failed to remove rule", description: e?.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleBulkAdd = async () => {
    if (!serviceId) return
    const valid = bulkRows.filter((r) => r.productId && r.quantityUsed && parseFloat(r.quantityUsed) >= 0)
    if (valid.length === 0) {
      toast({ title: "Add at least one product with quantity", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await ConsumptionRulesAPI.bulkCreate(
        serviceId,
        valid.map((r) => ({
          productId: r.productId,
          quantityUsed: parseFloat(r.quantityUsed),
          unit: r.unit || "pcs",
        }))
      )
      if (res.success) {
        const list = await ConsumptionRulesAPI.list({ serviceId })
        if (list.success && list.data) setRules(list.data)
        setBulkRows([{ productId: "", quantityUsed: "", unit: "pcs" }])
        setBulkMode(false)
        onRulesChange?.()
        toast({ title: "Rules added", description: `${valid.length} rule(s) created` })
      } else throw new Error(res.error)
    } catch (e: any) {
      toast({ title: "Bulk add failed", description: e?.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const addBulkRow = () => setBulkRows((prev) => [...prev, { productId: "", quantityUsed: "", unit: "pcs" }])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Consumption rules
          </DialogTitle>
          <DialogDescription>
            {service?.name ? (
              <>Define how much of each product is used when &quot;{service.name}&quot; is completed.</>
            ) : (
              "Select a service to manage rules."
            )}
          </DialogDescription>
        </DialogHeader>
        {!serviceId ? (
          <p className="text-sm text-gray-500">No service selected.</p>
        ) : (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {!bulkMode ? (
                  <>
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <Label className="text-xs">Product</Label>
                        <Select value={addProductId} onValueChange={setAddProductId}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products
                              .filter((p) => p.productType !== "service")
                              .map((p) => (
                                <SelectItem key={p._id || p.id} value={p._id || p.id}>
                                  {p.name} ({p.baseUnit || "pcs"})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={addQuantity}
                          onChange={(e) => setAddQuantity(e.target.value)}
                          placeholder="0"
                          className="h-9"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Unit</Label>
                        <Select value={addUnit} onValueChange={setAddUnit}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNITS.map((u) => (
                              <SelectItem key={u.value} value={u.value}>
                                {u.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <Switch checked={addAdjustable} onCheckedChange={setAddAdjustable} />
                        <Label className="text-xs">Adjustable</Label>
                      </div>
                      {addAdjustable && (
                        <div className="col-span-1">
                          <Label className="text-xs">Max %</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={addMaxPct}
                            onChange={(e) => setAddMaxPct(e.target.value)}
                            className="h-9"
                          />
                        </div>
                      )}
                      <div className="col-span-2">
                        <Button type="button" size="sm" onClick={handleAddRule} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Add
                        </Button>
                      </div>
                    </div>
                    <div className="border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Adjustable</TableHead>
                            <TableHead className="w-[80px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rules.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-gray-500 py-6">
                                No rules. Add one above or use bulk setup.
                              </TableCell>
                            </TableRow>
                          ) : (
                            rules.map((r) => (
                              <TableRow key={r._id || r.id}>
                                <TableCell>{r.productId?.name ?? r.productId ?? "—"}</TableCell>
                                <TableCell>{r.quantityUsed}</TableCell>
                                <TableCell>{r.unit}</TableCell>
                                <TableCell>{r.isAdjustable ? `±${r.maxAdjustmentPercent ?? 20}%` : "—"}</TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                    onClick={() => handleDeleteRule(r._id || r.id)}
                                    disabled={saving}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => setBulkMode(true)}>
                        Bulk setup
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Add multiple products at once</Label>
                      {bulkRows.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <Select
                              value={row.productId}
                              onValueChange={(v) =>
                                setBulkRows((prev) => {
                                  const next = [...prev]
                                  next[idx] = { ...next[idx], productId: v }
                                  return next
                                })
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Product" />
                              </SelectTrigger>
                              <SelectContent>
                                {products
                                  .filter((p) => p.productType !== "service")
                                  .map((p) => (
                                    <SelectItem key={p._id || p.id} value={p._id || p.id}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="Qty"
                              value={row.quantityUsed}
                              onChange={(e) =>
                                setBulkRows((prev) => {
                                  const next = [...prev]
                                  next[idx] = { ...next[idx], quantityUsed: e.target.value }
                                  return next
                                })
                              }
                              className="h-9"
                            />
                          </div>
                          <div className="col-span-2">
                            <Select
                              value={row.unit}
                              onValueChange={(v) =>
                                setBulkRows((prev) => {
                                  const next = [...prev]
                                  next[idx] = { ...next[idx], unit: v }
                                  return next
                                })
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {UNITS.map((u) => (
                                  <SelectItem key={u.value} value={u.value}>
                                    {u.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            {bulkRows.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setBulkRows((prev) => prev.filter((_, i) => i !== idx))}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={addBulkRow}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add row
                      </Button>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setBulkMode(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleBulkAdd} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Save rules
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
