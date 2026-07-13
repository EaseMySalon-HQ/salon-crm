'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ChevronDown, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'

export type CatalogType = 'services' | 'products' | 'packages' | 'memberships' | 'prepaid-wallets'

type CatalogItem = {
  id: string
  name: string
  isPublic: boolean
  isFeatured: boolean
  meta?: Record<string, unknown>
}

type ExtraToggle = {
  key: string
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}

function ToggleRow({ toggle }: { toggle: ExtraToggle }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 text-sm">
      <div>
        <span className="font-medium">{toggle.label}</span>
        {toggle.description ? (
          <p className="mt-0.5 text-xs text-slate-500">{toggle.description}</p>
        ) : null}
      </div>
      <Switch checked={toggle.checked} onCheckedChange={toggle.onChange} />
    </label>
  )
}

export function WebsiteCatalogTab({
  type,
  title,
  description,
  sectionEnabled,
  onSectionEnabledChange,
  sectionLabel = 'Show on website',
  leadToggles = [],
  showEnableAll = false,
  extraToggles = [],
  emptyHint,
  listPreviewLimit,
  showAllLabel,
}: {
  type: CatalogType
  title: string
  description: string
  sectionEnabled?: boolean
  onSectionEnabledChange?: (v: boolean) => void
  sectionLabel?: string
  leadToggles?: ExtraToggle[]
  showEnableAll?: boolean
  extraToggles?: ExtraToggle[]
  emptyHint?: string
  /** When set, collapse the list until the user expands it. */
  listPreviewLimit?: number
  showAllLabel?: string
}) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [showAllItems, setShowAllItems] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get(`/settings/website/catalog/${type}`)
      setItems(res.data?.data || [])
    } catch {
      setItems([])
      toast({ title: `Could not load ${title.toLowerCase()}`, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [type, title])

  useEffect(() => {
    void load()
  }, [load])

  async function patchItem(id: string, patch: Partial<Pick<CatalogItem, 'isPublic' | 'isFeatured'>>) {
    setUpdatingId(id)
    try {
      await apiClient.patch(`/settings/website/catalog/${type}/${id}`, patch)
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      )
    } catch (e: unknown) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  async function setAllPublic(isPublic: boolean) {
    setBulkUpdating(true)
    try {
      await apiClient.patch(`/settings/website/catalog/${type}/bulk`, { isPublic })
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          isPublic,
          isFeatured: isPublic ? item.isFeatured : false,
        }))
      )
    } catch (e: unknown) {
      toast({
        title: 'Bulk update failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setBulkUpdating(false)
    }
  }

  const sectionOff = sectionEnabled === false
  const catalogueOff = leadToggles.some((toggle) => !toggle.checked)
  const listDisabled = sectionOff || catalogueOff
  const allPublic = items.length > 0 && items.every((item) => item.isPublic)
  const somePublic = items.some((item) => item.isPublic)
  const previewLimit = listPreviewLimit && listPreviewLimit > 0 ? listPreviewLimit : null
  const canCollapse = Boolean(previewLimit && items.length > previewLimit)
  const visibleItems =
    canCollapse && !showAllItems ? items.slice(0, previewLimit) : items
  const expandLabel =
    showAllLabel ||
    (type === 'services' ? 'Show all services' : `Show all ${title.toLowerCase()}`)

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      {leadToggles.map((toggle) => (
        <ToggleRow key={toggle.key} toggle={toggle} />
      ))}

      {showEnableAll ? (
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 text-sm">
          <div>
            <span className="font-medium">Enable all</span>
            <p className="mt-0.5 text-xs text-slate-500">
              Show every item in this catalogue on your public mini-site.
            </p>
          </div>
          <Switch
            checked={allPublic}
            disabled={bulkUpdating || loading || listDisabled || !items.length}
            onCheckedChange={(v) => void setAllPublic(v)}
            aria-checked={allPublic ? true : somePublic ? 'mixed' : false}
          />
        </label>
      ) : null}

      {onSectionEnabledChange ? (
        <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 text-sm">
          <span className="font-medium">{sectionLabel}</span>
          <Switch checked={Boolean(sectionEnabled)} onCheckedChange={onSectionEnabledChange} />
        </label>
      ) : null}

      {extraToggles.map((toggle) => (
        <ToggleRow key={toggle.key} toggle={toggle} />
      ))}

      {listDisabled ? (
        <p className="text-sm text-slate-500">Enable this section to manage what appears on your mini-site.</p>
      ) : loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !items.length ? (
        <p className="py-4 text-sm text-slate-500">
          {emptyHint || 'No items found. Add them in your salon catalog first.'}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="divide-y rounded-lg border border-slate-100">
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{item.name}</p>
                  {item.meta?.category ? (
                    <p className="text-xs text-slate-500">
                      {String(item.meta.category)}
                      {item.meta?.productType ? ` · ${String(item.meta.productType)}` : ''}
                    </p>
                  ) : item.meta?.productType ? (
                    <p className="text-xs text-slate-500">{String(item.meta.productType)}</p>
                  ) : item.meta?.price != null ? (
                    <p className="text-xs text-slate-500">
                      ₹{Number(item.meta.price).toLocaleString('en-IN')}
                      {item.meta?.validityDays != null
                        ? ` · ${String(item.meta.validityDays)} days`
                        : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`${type}-${item.id}-public`} className="text-xs text-slate-500">
                      Public
                    </Label>
                    <Switch
                      id={`${type}-${item.id}-public`}
                      checked={item.isPublic}
                      disabled={updatingId === item.id}
                      onCheckedChange={(v) => void patchItem(item.id, { isPublic: v })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`${type}-${item.id}-featured`} className="text-xs text-slate-500">
                      Featured
                    </Label>
                    <Switch
                      id={`${type}-${item.id}-featured`}
                      checked={item.isFeatured}
                      disabled={updatingId === item.id || !item.isPublic}
                      onCheckedChange={(v) => void patchItem(item.id, { isFeatured: v })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {canCollapse ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowAllItems((v) => !v)}
            >
              <ChevronDown
                className={`mr-2 h-4 w-4 transition-transform ${showAllItems ? 'rotate-180' : ''}`}
              />
              {showAllItems
                ? `Show fewer ${type === 'services' ? 'services' : 'items'}`
                : `${expandLabel} (${items.length})`}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  )
}
