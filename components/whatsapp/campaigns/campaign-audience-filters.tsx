"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, MessageCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type ClientGender,
  type ClientSegment,
  type ClientSegmentRules,
  type LastVisitFilter,
  DEFAULT_CLIENT_SEGMENT_RULES,
  GENDER_OPTIONS,
  LAST_VISIT_OPTIONS,
  buildSegmentOptions,
} from "@/lib/client-segments"
import { cn } from "@/lib/utils"

export type CatalogOption = { _id: string; name: string }

export type CampaignAudienceFilters = {
  segments: ClientSegment[]
  genders: ClientGender[]
  birthdayThisMonth: boolean
  lastVisit: LastVisitFilter
  lastVisitFrom: string
  lastVisitTo: string
  totalSpentMin: string
  totalSpentMax: string
  totalVisitsMin: string
  totalVisitsMax: string
  status: "any" | "active" | "inactive"
  hasDues: boolean
  serviceIds: string[]
  productIds: string[]
}

export const DEFAULT_CAMPAIGN_AUDIENCE_FILTERS: CampaignAudienceFilters = {
  segments: [],
  genders: [],
  birthdayThisMonth: false,
  lastVisit: "any",
  lastVisitFrom: "",
  lastVisitTo: "",
  totalSpentMin: "",
  totalSpentMax: "",
  totalVisitsMin: "",
  totalVisitsMax: "",
  status: "any",
  hasDues: false,
  serviceIds: [],
  productIds: [],
}

/** Merge partial / legacy audience filter payloads into a safe UI shape. */
export function normalizeCampaignAudienceFilters(
  input?: Partial<CampaignAudienceFilters> & {
    gender?: string
    totalSpentMin?: string | number
    totalSpentMax?: string | number
  } | null,
): CampaignAudienceFilters {
  const src = input && typeof input === "object" ? input : {}
  const genders = Array.isArray(src.genders)
    ? src.genders.filter(Boolean)
    : src.gender
    ? [String(src.gender).toLowerCase() as ClientGender]
    : []

  return {
    ...DEFAULT_CAMPAIGN_AUDIENCE_FILTERS,
    ...src,
    segments: Array.isArray(src.segments) ? src.segments.filter(Boolean) : [],
    genders,
    birthdayThisMonth: Boolean(src.birthdayThisMonth),
    lastVisit: (src.lastVisit as LastVisitFilter) || "any",
    lastVisitFrom: src.lastVisitFrom != null ? String(src.lastVisitFrom) : "",
    lastVisitTo: src.lastVisitTo != null ? String(src.lastVisitTo) : "",
    totalSpentMin: src.totalSpentMin != null ? String(src.totalSpentMin) : "",
    totalSpentMax: src.totalSpentMax != null ? String(src.totalSpentMax) : "",
    totalVisitsMin: src.totalVisitsMin != null ? String(src.totalVisitsMin) : "",
    totalVisitsMax: src.totalVisitsMax != null ? String(src.totalVisitsMax) : "",
    status:
      src.status === "active" || src.status === "inactive" ? src.status : "any",
    hasDues: Boolean(src.hasDues),
    serviceIds: Array.isArray(src.serviceIds) ? src.serviceIds.filter(Boolean) : [],
    productIds: Array.isArray(src.productIds) ? src.productIds.filter(Boolean) : [],
  }
}

export function campaignAudienceFiltersToPayload(filters: CampaignAudienceFilters) {
  const normalized = normalizeCampaignAudienceFilters(filters)
  const af: Record<string, unknown> = {}
  if (normalized.segments.length) af.segments = normalized.segments
  if (normalized.genders.length) af.genders = normalized.genders
  if (normalized.birthdayThisMonth) af.birthdayThisMonth = true
  if (normalized.lastVisit !== "any") af.lastVisit = normalized.lastVisit
  if (normalized.lastVisitFrom.trim()) af.lastVisitFrom = normalized.lastVisitFrom
  if (normalized.lastVisitTo.trim()) af.lastVisitTo = normalized.lastVisitTo
  if (normalized.totalSpentMin.trim()) af.totalSpentMin = Number(normalized.totalSpentMin)
  if (normalized.totalSpentMax.trim()) af.totalSpentMax = Number(normalized.totalSpentMax)
  if (normalized.totalVisitsMin.trim()) af.totalVisitsMin = Number(normalized.totalVisitsMin)
  if (normalized.totalVisitsMax.trim()) af.totalVisitsMax = Number(normalized.totalVisitsMax)
  if (normalized.status !== "any") af.status = normalized.status
  if (normalized.hasDues) af.hasDues = true
  if (normalized.serviceIds.length) af.serviceIds = normalized.serviceIds
  if (normalized.productIds.length) af.productIds = normalized.productIds
  return af
}

interface CampaignAudienceFiltersPanelProps {
  filters: CampaignAudienceFilters
  onChange: (next: CampaignAudienceFilters) => void
  segmentRules?: ClientSegmentRules
  services?: CatalogOption[]
  products?: CatalogOption[]
}

function CatalogMultiSelect({
  label,
  placeholder,
  emptyLabel,
  options,
  selectedIds,
  onChange,
}: {
  label: string
  placeholder: string
  emptyLabel: string
  options: CatalogOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(
    () => options.filter((o) => selectedIds.includes(o._id)),
    [options, selectedIds],
  )

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    )
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-slate-800">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 w-full justify-between font-normal"
          >
            <span className="truncate text-left">
              {selected.length
                ? `${selected.length} selected`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,28rem)] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const active = selectedIds.includes(opt._id)
                  return (
                    <CommandItem
                      key={opt._id}
                      value={`${opt.name} ${opt._id}`}
                      onSelect={() => toggle(opt._id)}
                      className="min-w-0"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{opt.name}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span
              key={item._id}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-700"
            >
              <span className="max-w-[12rem] truncate">{item.name}</span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-slate-100"
                onClick={() => toggle(item._id)}
                aria-label={`Remove ${item.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">
        Clients who purchased any selected {label.toLowerCase()} in the past.
      </p>
    </div>
  )
}

export function CampaignAudienceFiltersPanel({
  filters: rawFilters,
  onChange,
  segmentRules = DEFAULT_CLIENT_SEGMENT_RULES,
  services = [],
  products = [],
}: CampaignAudienceFiltersPanelProps) {
  const filters = normalizeCampaignAudienceFilters(rawFilters)
  const segmentOptions = buildSegmentOptions(segmentRules)

  const commitFilters = (next: CampaignAudienceFilters) => {
    onChange(normalizeCampaignAudienceFilters(next))
  }

  const toggleSegment = (segment: ClientSegment) => {
    const has = filters.segments.includes(segment)
    commitFilters({
      ...filters,
      segments: has
        ? filters.segments.filter((s) => s !== segment)
        : [...filters.segments, segment],
    })
  }

  const toggleGender = (gender: ClientGender) => {
    const has = filters.genders.includes(gender)
    commitFilters({
      ...filters,
      genders: has
        ? filters.genders.filter((g) => g !== gender)
        : [...filters.genders, gender],
    })
  }

  return (
    <div className="space-y-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Client segment
        </Label>
        <div className="flex flex-wrap gap-2">
          {segmentOptions.map((opt) => {
            const active = filters.segments.includes(opt.id)
            return (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-8 rounded-full px-3 text-xs"
                title={opt.description}
                onClick={() => toggleSegment(opt.id)}
              >
                {opt.label}
              </Button>
            )
          })}
        </div>
        <p className="text-xs text-slate-500">
          Leave empty to include all segments. Thresholds follow your client segment rules.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Gender
        </Label>
        <div className="flex flex-wrap gap-2">
          {GENDER_OPTIONS.map((opt) => {
            const active = filters.genders.includes(opt.id)
            return (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-8 rounded-full px-3 text-xs capitalize"
                onClick={() => toggleGender(opt.id)}
              >
                {opt.label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CatalogMultiSelect
          label="Services purchased"
          placeholder="Any service"
          emptyLabel="No services found."
          options={services}
          selectedIds={filters.serviceIds}
          onChange={(serviceIds) => commitFilters({ ...filters, serviceIds })}
        />
        <CatalogMultiSelect
          label="Products purchased"
          placeholder="Any product"
          emptyLabel="No products found."
          options={products}
          selectedIds={filters.productIds}
          onChange={(productIds) => commitFilters({ ...filters, productIds })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-800">Last visit</Label>
          <Select
            value={filters.lastVisit}
            onValueChange={(lastVisit) =>
              commitFilters({ ...filters, lastVisit: lastVisit as LastVisitFilter })
            }
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Any time" />
            </SelectTrigger>
            <SelectContent>
              {LAST_VISIT_OPTIONS.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-800">Client status</Label>
          <Select
            value={filters.status}
            onValueChange={(status) =>
              commitFilters({ ...filters, status: status as CampaignAudienceFilters["status"] })
            }
          >
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-800">Total spend (₹)</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min={0}
              placeholder="Min"
              value={filters.totalSpentMin}
              onChange={(e) => commitFilters({ ...filters, totalSpentMin: e.target.value })}
              className="h-10"
            />
            <Input
              type="number"
              min={0}
              placeholder="Max"
              value={filters.totalSpentMax}
              onChange={(e) => commitFilters({ ...filters, totalSpentMax: e.target.value })}
              className="h-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-800">Total visits</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min={0}
              placeholder="Min"
              value={filters.totalVisitsMin}
              onChange={(e) => commitFilters({ ...filters, totalVisitsMin: e.target.value })}
              className="h-10"
            />
            <Input
              type="number"
              min={0}
              placeholder="Max"
              value={filters.totalVisitsMax}
              onChange={(e) => commitFilters({ ...filters, totalVisitsMax: e.target.value })}
              className="h-10"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-800">Last visit from</Label>
          <Input
            type="date"
            value={filters.lastVisitFrom}
            onChange={(e) => commitFilters({ ...filters, lastVisitFrom: e.target.value })}
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-800">Last visit to</Label>
          <Input
            type="date"
            value={filters.lastVisitTo}
            onChange={(e) => commitFilters({ ...filters, lastVisitTo: e.target.value })}
            className="h-10"
          />
        </div>
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        Optional date range overrides the last-visit preset above when both are set.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
        <div>
          <Label htmlFor="campaign-birthday-month" className="text-sm font-medium text-slate-800">
            Birthday this month
          </Label>
          <p className="text-xs text-slate-500">Great for birthday offers</p>
        </div>
        <Switch
          id="campaign-birthday-month"
          checked={filters.birthdayThisMonth}
          onCheckedChange={(birthdayThisMonth) => commitFilters({ ...filters, birthdayThisMonth })}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
        <div>
          <Label htmlFor="campaign-has-dues" className="text-sm font-medium text-slate-800">
            Has outstanding dues
          </Label>
          <p className="text-xs text-slate-500">Unpaid or partially paid bills</p>
        </div>
        <Switch
          id="campaign-has-dues"
          checked={filters.hasDues}
          onCheckedChange={(hasDues) => commitFilters({ ...filters, hasDues })}
        />
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 text-xs text-emerald-800">
        <MessageCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          All filters still require WhatsApp promo opt-in and exclude Meta-level marketing
          opt-outs automatically.
        </p>
      </div>
    </div>
  )
}
