"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowLeft, GripVertical, Plus, RotateCcw, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"
import type { FeatureCategory, FeatureRow } from "@/lib/pricing-matrix"
import { FEATURE_CATEGORIES } from "@/lib/pricing-matrix"
import {
  MATRIX_CELL_STATUS_OPTIONS,
  MATRIX_TIER_LABELS,
  getMatrixCellEditorMode,
  type MatrixTierKey,
} from "@/lib/pricing-matrix-cell"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"
const TIER_KEYS: MatrixTierKey[] = ["starter", "growth", "pro"]

const EMPTY_ROW: FeatureRow = {
  feature: "",
  hint: "",
  starter: "no",
  growth: "no",
  pro: "no",
}

const categoryId = (catIndex: number) => `c:${catIndex}`
const rowId = (catIndex: number, rowIndex: number) => `r:${catIndex}:${rowIndex}`

function validateCategories(categories: FeatureCategory[]): string | null {
  if (categories.length === 0) {
    return "Add at least one category before saving."
  }
  for (const cat of categories) {
    if (!cat.title.trim()) {
      return "Every category needs a title."
    }
    if (cat.rows.length === 0) {
      return `Category "${cat.title}" needs at least one feature row.`
    }
    for (const row of cat.rows) {
      if (!row.feature.trim()) {
        return `Category "${cat.title}" has a row without a feature name.`
      }
      for (const tier of TIER_KEYS) {
        if (!String(row[tier] ?? "").trim()) {
          return `Set a value for every tier on "${row.feature}".`
        }
      }
    }
  }
  return null
}

function cloneCategories(categories: FeatureCategory[]): FeatureCategory[] {
  return categories.map((cat) => ({
    title: cat.title,
    rows: cat.rows.map((row) => ({ ...row })),
  }))
}

function DragHandle({
  label,
  listeners,
  attributes,
}: {
  label: string
  listeners: ReturnType<typeof useSortable>["listeners"]
  attributes: ReturnType<typeof useSortable>["attributes"]
}) {
  return (
    <button
      type="button"
      className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}

function MatrixCellEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const mode = getMatrixCellEditorMode(value)
  const isCustom = mode === "__custom__"

  return (
    <div className="space-y-1.5">
      <Select
        value={mode}
        onValueChange={(next) => {
          if (next === "__custom__") {
            onChange(isCustom ? value : "Unlimited")
          } else {
            onChange(next)
          }
        }}
      >
        <SelectTrigger className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MATRIX_CELL_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isCustom ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Unlimited, Email"
          className="h-8 text-xs"
        />
      ) : null}
    </div>
  )
}

function SortableCategoryHeader({
  id,
  title,
  canRemove,
  onTitleChange,
  onAddRow,
  onRemove,
}: {
  id: string
  title: string
  canRemove: boolean
  onTitleChange: (title: string) => void
  onAddRow: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style} className="bg-indigo-50/70">
      <td colSpan={6} className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <DragHandle label={`Drag category ${title}`} listeners={listeners} attributes={attributes} />
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="h-9 max-w-md flex-1 font-semibold"
            placeholder="Category title"
          />
          <Button type="button" variant="outline" size="sm" onClick={onAddRow} className="h-9 shrink-0">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add feature
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={!canRemove}
            className="h-9 w-9 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
            aria-label={`Remove category ${title}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

function SortableFeatureRow({
  id,
  row,
  canRemove,
  onFeatureChange,
  onCellChange,
  onRemove,
}: {
  id: string
  row: FeatureRow
  canRemove: boolean
  onFeatureChange: (value: string) => void
  onCellChange: (tier: MatrixTierKey, value: string) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-gray-100 align-top bg-white">
      <td className="px-2 py-3 align-top">
        <DragHandle label={`Drag feature ${row.feature || "row"}`} listeners={listeners} attributes={attributes} />
      </td>
      <td className="px-4 py-3">
        <Input
          value={row.feature}
          onChange={(e) => onFeatureChange(e.target.value)}
          className="h-9"
          placeholder="Feature name"
        />
      </td>
      {TIER_KEYS.map((tier) => (
        <td key={tier} className="px-3 py-3">
          <MatrixCellEditor
            value={String(row[tier] ?? "")}
            onChange={(next) => onCellChange(tier, next)}
          />
        </td>
      ))}
      <td className="px-2 py-3 align-top">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          className="h-9 w-9 text-red-600 hover:bg-red-50 hover:text-red-700"
          aria-label={`Remove ${row.feature || "feature"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  )
}

export function PricingMatrixManager() {
  const { toast } = useToast()
  const [categories, setCategories] = useState<FeatureCategory[]>(() =>
    cloneCategories(FEATURE_CATEGORIES)
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const loadMatrix = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/admin/plans/pricing-matrix`, {
        headers: adminRequestHeaders(),
      })
      if (!response.ok) throw new Error("Failed to load")
      const data = await response.json()
      if (data.success && Array.isArray(data.data?.categories)) {
        setCategories(cloneCategories(data.data.categories))
        setUpdatedAt(data.data.updatedAt || null)
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to load pricing matrix. Showing defaults.",
        variant: "destructive",
      })
      setCategories(cloneCategories(FEATURE_CATEGORIES))
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadMatrix()
  }, [loadMatrix])

  const updateCell = (
    catIndex: number,
    rowIndex: number,
    tier: MatrixTierKey,
    next: string
  ) => {
    setCategories((prev) => {
      const copy = cloneCategories(prev)
      copy[catIndex].rows[rowIndex] = {
        ...copy[catIndex].rows[rowIndex],
        [tier]: next,
      }
      return copy
    })
  }

  const updateRowField = (
    catIndex: number,
    rowIndex: number,
    field: keyof FeatureRow,
    next: string
  ) => {
    setCategories((prev) => {
      const copy = cloneCategories(prev)
      copy[catIndex].rows[rowIndex] = {
        ...copy[catIndex].rows[rowIndex],
        [field]: next,
      }
      return copy
    })
  }

  const updateCategoryTitle = (catIndex: number, title: string) => {
    setCategories((prev) => {
      const copy = cloneCategories(prev)
      copy[catIndex].title = title
      return copy
    })
  }

  const addCategory = () => {
    setCategories((prev) => [
      ...cloneCategories(prev),
      { title: "New category", rows: [{ ...EMPTY_ROW, feature: "New feature" }] },
    ])
  }

  const removeCategory = (catIndex: number) => {
    setCategories((prev) => {
      if (prev.length <= 1) return prev
      return cloneCategories(prev).filter((_, i) => i !== catIndex)
    })
  }

  const addRow = (catIndex: number) => {
    setCategories((prev) => {
      const copy = cloneCategories(prev)
      copy[catIndex].rows.push({ ...EMPTY_ROW, feature: "New feature" })
      return copy
    })
  }

  const removeRow = (catIndex: number, rowIndex: number) => {
    setCategories((prev) => {
      const copy = cloneCategories(prev)
      if (copy[catIndex].rows.length <= 1) return prev
      copy[catIndex].rows.splice(rowIndex, 1)
      return copy
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeKey = String(active.id)
    const overKey = String(over.id)

    if (activeKey.startsWith("c:") && overKey.startsWith("c:")) {
      const oldIndex = Number(activeKey.slice(2))
      const newIndex = Number(overKey.slice(2))
      if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return
      setCategories((prev) => arrayMove(cloneCategories(prev), oldIndex, newIndex))
      return
    }

    if (activeKey.startsWith("r:") && overKey.startsWith("r:")) {
      const [, activeCat, activeRow] = activeKey.split(":").map(Number)
      const [, overCat, overRow] = overKey.split(":").map(Number)
      if (activeCat !== overCat || Number.isNaN(activeRow) || Number.isNaN(overRow)) return
      setCategories((prev) => {
        const copy = cloneCategories(prev)
        copy[activeCat].rows = arrayMove(copy[activeCat].rows, activeRow, overRow)
        return copy
      })
    }
  }

  const handleSave = async () => {
    const validationError = validateCategories(categories)
    if (validationError) {
      toast({
        title: "Cannot save",
        description: validationError,
        variant: "destructive",
      })
      return
    }
    try {
      setSaving(true)
      const response = await fetch(`${API_URL}/admin/plans/pricing-matrix`, {
        method: "PUT",
        headers: adminRequestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ categories }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save")
      }
      setCategories(cloneCategories(data.data.categories))
      setUpdatedAt(data.data.updatedAt || null)
      toast({
        title: "Saved",
        description: "Pricing matrix updated on the public pricing page.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save pricing matrix",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (
      !confirm(
        "Reset the pricing matrix to factory defaults? This replaces all current values on the public pricing page."
      )
    ) {
      return
    }
    try {
      setSaving(true)
      const response = await fetch(`${API_URL}/admin/plans/pricing-matrix/reset`, {
        method: "POST",
        headers: adminRequestHeaders(),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to reset")
      }
      setCategories(cloneCategories(data.data.categories))
      setUpdatedAt(data.data.updatedAt || null)
      toast({
        title: "Reset complete",
        description: "Pricing matrix restored to defaults.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset pricing matrix",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600" />
          <p className="text-gray-600">Loading pricing matrix…</p>
        </div>
      </div>
    )
  }

  const categorySortableIds = categories.map((_, catIndex) => categoryId(catIndex))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 px-2">
              <Link href="/admin/plans">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Plans
              </Link>
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Pricing page matrix</h1>
          <p className="mt-1 max-w-2xl text-gray-600">
            Manage the feature comparison table on the public{" "}
            <Link href="/pricing" className="font-medium text-indigo-600 hover:underline" target="_blank">
              /pricing
            </Link>{" "}
            page. Drag categories and features to reorder, edit tier cells, then save — changes appear on
            the public pricing page immediately.
          </p>
          {updatedAt ? (
            <p className="mt-2 text-xs text-gray-500">
              Last saved: {new Date(updatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={addCategory} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            Add category
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={saving}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to defaults
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save matrix"}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <table className="min-w-[960px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-12 px-2 py-3" aria-label="Drag to reorder" />
                  <th className="min-w-[240px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Feature
                  </th>
                  {TIER_KEYS.map((tier) => (
                    <th
                      key={tier}
                      className="w-[160px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      {MATRIX_TIER_LABELS[tier]}
                    </th>
                  ))}
                  <th className="w-12 px-2 py-3" aria-label="Remove row" />
                </tr>
              </thead>
              <tbody>
                <SortableContext items={categorySortableIds} strategy={verticalListSortingStrategy}>
                  {categories.map((cat, catIndex) => {
                    const rowSortableIds = cat.rows.map((_, rowIndex) => rowId(catIndex, rowIndex))
                    return (
                      <Fragment key={`block-${catIndex}`}>
                        <SortableCategoryHeader
                          id={categoryId(catIndex)}
                          title={cat.title}
                          canRemove={categories.length > 1}
                          onTitleChange={(title) => updateCategoryTitle(catIndex, title)}
                          onAddRow={() => addRow(catIndex)}
                          onRemove={() => removeCategory(catIndex)}
                        />
                        <SortableContext items={rowSortableIds} strategy={verticalListSortingStrategy}>
                          {cat.rows.map((row, rowIndex) => (
                            <SortableFeatureRow
                              key={rowId(catIndex, rowIndex)}
                              id={rowId(catIndex, rowIndex)}
                              row={row}
                              canRemove={cat.rows.length > 1}
                              onFeatureChange={(value) =>
                                updateRowField(catIndex, rowIndex, "feature", value)
                              }
                              onCellChange={(tier, value) =>
                                updateCell(catIndex, rowIndex, tier, value)
                              }
                              onRemove={() => removeRow(catIndex, rowIndex)}
                            />
                          ))}
                        </SortableContext>
                      </Fragment>
                    )
                  })}
                </SortableContext>
              </tbody>
            </table>
          </DndContext>
        </div>
      </div>
    </div>
  )
}
