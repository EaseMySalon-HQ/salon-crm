"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ConsumptionRulesAPI, ProductsAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Plus, Trash2, Loader2, Package, Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Match Product.volumeUnit (products directory)
const UNITS = [
  { value: "mg", label: "mg" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "oz", label: "oz" },
  { value: "pcs", label: "pcs" },
  { value: "pkt", label: "pkt" },
]

function getProductUnit(p: { volumeUnit?: string; baseUnit?: string }): string {
  return p?.volumeUnit || p?.baseUnit || "pcs"
}

export interface PendingConsumptionRule {
  productId: string
  quantityUsed: number
  unit: string
  isAdjustable?: boolean
  maxAdjustmentPercent?: number
  productName?: string
}

interface ServiceConsumptionRulesSectionProps {
  serviceId: string | null
  pendingRules: PendingConsumptionRule[]
  onPendingRulesChange: (rules: PendingConsumptionRule[]) => void
  disabled?: boolean
}

export function ServiceConsumptionRulesSection({
  serviceId,
  pendingRules,
  onPendingRulesChange,
  disabled,
}: ServiceConsumptionRulesSectionProps) {
  const { toast } = useToast()
  const [rules, setRules] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [addProductId, setAddProductId] = useState("")
  const [addQuantity, setAddQuantity] = useState("")
  const [addUnit, setAddUnit] = useState("pcs")
  const [saving, setSaving] = useState(false)
  const [productComboboxOpen, setProductComboboxOpen] = useState(false)

  const isEditMode = !!serviceId

  useEffect(() => {
    if (isEditMode && serviceId) {
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
      ProductsAPI.getAll({ limit: 500 })
        .then((res) => {
          if (res?.data) setProducts(Array.isArray(res.data) ? res.data : [])
        })
        .catch(() => {})
    }
  }, [isEditMode, serviceId, toast])

  const handleAddRule = async () => {
    if (!addProductId || !addQuantity) {
      toast({ title: "Missing fields", description: "Select product and enter quantity.", variant: "destructive" })
      return
    }
    const qty = parseFloat(addQuantity)
    if (isNaN(qty) || qty < 0) {
      toast({ title: "Invalid quantity", variant: "destructive" })
      return
    }

    if (isEditMode && serviceId) {
      setSaving(true)
      try {
        const res = await ConsumptionRulesAPI.create({
          serviceId,
          productId: addProductId,
          quantityUsed: qty,
          unit: addUnit,
          isAdjustable: false,
          maxAdjustmentPercent: 20,
        })
        if (res.success) {
          const list = await ConsumptionRulesAPI.list({ serviceId })
          if (list.success && list.data) setRules(list.data)
          setAddProductId("")
          setAddQuantity("")
          setAddUnit("pcs")
          toast({ title: "Rule added" })
        } else throw new Error(res.error)
      } catch (e: any) {
        toast({ title: "Failed to add rule", description: e?.message, variant: "destructive" })
      } finally {
        setSaving(false)
      }
    } else {
      const product = products.find((p) => (p._id || p.id) === addProductId)
      onPendingRulesChange([
        ...pendingRules,
        {
          productId: addProductId,
          quantityUsed: qty,
          unit: addUnit,
          isAdjustable: false,
          maxAdjustmentPercent: 20,
          productName: product?.name,
        },
      ])
      setAddProductId("")
      setAddQuantity("")
      setAddUnit("pcs")
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (isEditMode && serviceId) {
      setSaving(true)
      try {
        const res = await ConsumptionRulesAPI.delete(ruleId)
        if (res.success) {
          setRules((prev) => prev.filter((r) => (r._id || r.id) !== ruleId))
          toast({ title: "Rule removed" })
        } else throw new Error(res.error)
      } catch (e: any) {
        toast({ title: "Failed to remove rule", description: e?.message, variant: "destructive" })
      } finally {
        setSaving(false)
      }
    }
  }

  const removePendingRule = (index: number) => {
    onPendingRulesChange(pendingRules.filter((_, i) => i !== index))
  }

  const displayRules = isEditMode ? rules : pendingRules
  // Only products marked as available for service (productType 'service' or 'both')
  const productOptions = useMemo(
    () =>
      products.filter(
        (p) =>
          (p.productType === "service" || p.productType === "both") &&
          (p.isActive !== false)
      ),
    [products]
  )
  const selectedProduct = productOptions.find((p) => (p._id || p.id) === addProductId)

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Package className="h-4 w-4" />
        Consumption rules
      </div>
      <p className="text-xs text-gray-500">
        Define how much of each product is used when this service is completed.
      </p>

      <div className="grid grid-cols-12 gap-3 items-end">
        <div className="col-span-6 space-y-1.5">
          <Label className="text-xs">Product</Label>
          <Popover open={productComboboxOpen} onOpenChange={setProductComboboxOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={productComboboxOpen}
                className={cn(
                  "h-9 w-full justify-between font-normal",
                  !addProductId && "text-muted-foreground"
                )}
                disabled={disabled || loading}
              >
                {selectedProduct
                  ? `${selectedProduct.name} (${getProductUnit(selectedProduct)})`
                  : "Search or select product..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command shouldFilter={true}>
                <CommandInput placeholder="Search products..." />
                <ScrollArea className="h-[300px]">
                  <CommandList className="max-h-none overflow-visible">
                    <CommandEmpty>No product available for service found.</CommandEmpty>
                    <CommandGroup>
                      {productOptions.map((p) => {
                        const id = p._id || p.id
                        const label = `${p.name} (${getProductUnit(p)})`
                        return (
                          <CommandItem
                            key={id}
                            value={label}
                            onSelect={() => {
                              if (addProductId === id) {
                                setAddProductId("")
                                setAddUnit("pcs")
                              } else {
                                setAddProductId(id)
                                setAddUnit(getProductUnit(p))
                              }
                              setProductComboboxOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                addProductId === id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {label}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </ScrollArea>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Qty</Label>
          <Input
            type="number"
            step="any"
            min="0"
            value={addQuantity}
            onChange={(e) => setAddQuantity(e.target.value)}
            placeholder="0"
            className="h-9 w-full"
            disabled={disabled}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Unit</Label>
          <Select value={addUnit} onValueChange={setAddUnit} disabled={disabled}>
            <SelectTrigger className="h-9 w-full">
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
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">&nbsp;</Label>
          <Button
            type="button"
            className="h-9 w-full"
            onClick={handleAddRule}
            disabled={saving || disabled}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="border rounded-md bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500 py-6">
                    No rules. Add one above.
                  </TableCell>
                </TableRow>
              ) : isEditMode ? (
                rules.map((r) => (
                  <TableRow key={r._id || r.id}>
                    <TableCell>{r.productId?.name ?? r.productId ?? "—"}</TableCell>
                    <TableCell>{r.quantityUsed}</TableCell>
                    <TableCell>{r.unit}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteRule(r._id || r.id)}
                        disabled={saving || disabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                pendingRules.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{r.productName ?? r.productId ?? "—"}</TableCell>
                    <TableCell>{r.quantityUsed}</TableCell>
                    <TableCell>{r.unit}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        onClick={() => removePendingRule(idx)}
                        disabled={disabled}
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
      )}
    </div>
  )
}
