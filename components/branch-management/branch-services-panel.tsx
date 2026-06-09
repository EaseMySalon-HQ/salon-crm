"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Save, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { BranchManagementAPI, type BranchServiceRow } from "@/lib/api"
import { STALE_TIME } from "@/lib/queries/staleness"
import { formatINR } from "./branch-format"

type OverrideMap = Record<
  string,
  { enabled?: boolean; durationMinutes?: number; price?: number; tier?: "standard" | "premium" }
>

export function BranchServicesPanel({
  branchId,
  branchName,
  onDirtyChange,
}: {
  branchId: string
  branchName?: string
  onDirtyChange?: (dirty: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [overrides, setOverrides] = useState<OverrideMap>({})
  const [baseline, setBaseline] = useState("{}")
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["branch-management", "branch-services", branchId],
    queryFn: async () => {
      const res = await BranchManagementAPI.getBranchServices(branchId)
      if (!res.success) throw new Error(res.error || "Failed to load services")
      return res.data.services
    },
    enabled: !!branchId,
    staleTime: STALE_TIME.businessSettings,
  })

  useEffect(() => {
    setOverrides({})
    setBaseline("{}")
    setSearch("")
  }, [branchId])

  const dirty = useMemo(() => JSON.stringify(overrides) !== baseline, [overrides, baseline])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const updateService = (key: string, patch: OverrideMap[string]) => {
    setOverrides((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
  }

  const handleSave = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      const res = await BranchManagementAPI.updateBranchServices(branchId, overrides)
      if (!res.success) {
        toast({ title: "Couldn't save", description: res.error, variant: "destructive" })
        return
      }
      setBaseline(JSON.stringify(overrides))
      toast({ title: "Service overrides saved" })
      queryClient.invalidateQueries({ queryKey: ["branch-management", "branch-services", branchId] })
    } catch (err: any) {
      toast({
        title: "Couldn't save",
        description: err?.message || "Try again.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const services = data ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return services
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.sku.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    )
  }, [services, search])

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />

  const title = branchName ? `Edit services — ${branchName}` : "Edit branch services"

  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold text-slate-800">{title}</CardTitle>
          <p className="text-xs text-slate-500">
            Change price, duration, or disable a service for this branch only. Click Save when done.
          </p>
        </div>
        <Button size="sm" disabled={!dirty || saving} onClick={handleSave} className="gap-2 shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save overrides
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8"
          />
        </div>

        {services.length === 0 ? (
          <p className="text-sm text-slate-500">No services found for this branch.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500">No services match your search.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="min-w-[12rem]">Service</TableHead>
                  <TableHead className="min-w-[6rem]">Category</TableHead>
                  <TableHead className="w-[5.5rem] text-center">Enabled</TableHead>
                  <TableHead className="min-w-[7rem]">Price (₹)</TableHead>
                  <TableHead className="min-w-[7rem]">Duration (min)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <ServiceRow
                    key={s.key}
                    service={s}
                    override={overrides[s.key]}
                    onChange={(patch) => updateService(s.key, patch)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ServiceRow({
  service,
  override,
  onChange,
}: {
  service: BranchServiceRow
  override?: OverrideMap[string]
  onChange: (patch: OverrideMap[string]) => void
}) {
  const enabled = override?.enabled ?? service.enabled
  const price = override?.price ?? service.price
  const duration = override?.durationMinutes ?? service.durationMinutes

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-slate-800">{service.name}</p>
        <p className="text-xs text-slate-400">
          Catalog: {formatINR(service.price)} · {service.durationMinutes} min
          {service.hasOverride && " · saved override"}
        </p>
      </TableCell>
      <TableCell className="text-sm text-slate-600">{service.category || "—"}</TableCell>
      <TableCell className="text-center">
        <div className="inline-flex flex-col items-center gap-1">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => onChange({ enabled: v })}
            aria-label={`${service.name} enabled`}
          />
          <span className="text-[10px] text-slate-500">{enabled ? "On" : "Off"}</span>
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          step={1}
          inputMode="decimal"
          className="h-9 w-full min-w-[6rem]"
          value={Number.isFinite(price) ? price : ""}
          onChange={(e) => {
            const next = e.target.value === "" ? 0 : Number(e.target.value)
            if (Number.isFinite(next)) onChange({ price: next })
          }}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={5}
          step={5}
          inputMode="numeric"
          className="h-9 w-full min-w-[5rem]"
          value={Number.isFinite(duration) ? duration : ""}
          onChange={(e) => {
            const next = e.target.value === "" ? 0 : Number(e.target.value)
            if (Number.isFinite(next)) onChange({ durationMinutes: next })
          }}
        />
      </TableCell>
    </TableRow>
  )
}
