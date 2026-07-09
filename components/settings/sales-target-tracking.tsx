"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Loader2, RefreshCw, Search, Target } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { CommissionProfileAPI, SalesAPI, StaffDirectoryAPI } from "@/lib/api"
import type { CommissionProfile } from "@/lib/commission-profile-types"
import {
  buildStaffTargetProgressRows,
  formatTargetProgressInr,
  getTargetProfilesForStaff,
  intervalLabel,
  unionIntervalForTargetStaff,
} from "@/lib/staff-target-progress"
import { cn } from "@/lib/utils"

type DirectoryStaff = {
  _id: string
  name: string
  email?: string
  role?: string
  commissionProfileIds?: string[]
  isActive?: boolean
}

export function SalesTargetTracking() {
  const { toast } = useToast()
  const [anchorDate, setAnchorDate] = useState(() => format(new Date(), "yyyy-MM-dd"))
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [staff, setStaff] = useState<DirectoryStaff[]>([])
  const [profiles, setProfiles] = useState<CommissionProfile[]>([])
  const [rows, setRows] = useState<ReturnType<typeof buildStaffTargetProgressRows>>([])

  const targetStaff = useMemo(
    () =>
      staff.filter(
        (s) => getTargetProfilesForStaff(s.commissionProfileIds ?? [], profiles).length > 0
      ),
    [staff, profiles]
  )

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) setRefreshing(true)
      else setLoading(true)
      try {
        const [dirRes, profRes] = await Promise.all([
          StaffDirectoryAPI.getAll({}),
          CommissionProfileAPI.getProfiles(),
        ])

        const staffList = Array.isArray(dirRes?.data) ? (dirRes.data as DirectoryStaff[]) : []
        const profileList = Array.isArray(profRes?.data)
          ? (profRes.data as CommissionProfile[])
          : []

        setStaff(staffList)
        setProfiles(profileList)

        const eligible = staffList.filter(
          (s) => getTargetProfilesForStaff(s.commissionProfileIds ?? [], profileList).length > 0
        )

        if (eligible.length === 0) {
          setRows([])
          return
        }

        const interval = unionIntervalForTargetStaff(anchorDate, eligible, profileList)
        if (!interval) {
          setRows([])
          return
        }

        const sales = await SalesAPI.getAllMergePages({
          dateFrom: interval.dateFrom,
          dateTo: interval.dateTo,
          batchSize: 500,
        })

        setRows(buildStaffTargetProgressRows(eligible, profileList, sales, anchorDate))
      } catch (error) {
        console.error(error)
        toast({
          title: "Unable to load sales target tracking",
          description: "Please try again.",
          variant: "destructive",
        })
        setRows([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [anchorDate, toast]
  )

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.staffName.toLowerCase().includes(q) ||
        r.profileName.toLowerCase().includes(q)
    )
  }, [rows, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Staff assigned a <strong>Commission by Target</strong> profile are tracked here. Progress
          uses qualifying sales in each profile&apos;s calculation interval; the lowest tier{" "}
          <strong>From (₹)</strong> is the target amount.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            className="w-[11.5rem]"
            aria-label="Reference date for target periods"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadData({ silent: true })}
            disabled={loading || refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search staff or profile…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search sales target tracking"
        />
      </div>

      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="font-semibold text-slate-700 py-3 px-4">Staff</TableHead>
                <TableHead className="font-semibold text-slate-700 py-3 px-4">Target profile</TableHead>
                <TableHead className="font-semibold text-slate-700 py-3 px-4">Period</TableHead>
                <TableHead className="font-semibold text-slate-700 py-3 px-4 text-right">
                  Achieved / Target
                </TableHead>
                <TableHead className="font-semibold text-slate-700 py-3 px-4 min-w-[200px]">
                  Progress
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    Loading target progress…
                  </TableCell>
                </TableRow>
              ) : targetStaff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No staff have a <strong>Commission by Target</strong> profile assigned. Assign one
                    under <strong>Staff &amp; profiles</strong>.
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    No matches for your search.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const met = row.currentRevenue >= row.targetAmount
                  const pctLabel = Math.round(row.progressPercent)
                  return (
                    <TableRow key={`${row.staffId}-${row.profileId}`} className="border-b border-slate-100">
                      <TableCell className="py-3 px-4 font-medium text-slate-900">
                        {row.staffName}
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <Badge variant="secondary" className="font-normal">
                          {row.profileName}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-sm text-slate-600">
                        <div>{row.periodLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          {intervalLabel(row.calculationInterval)}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right tabular-nums text-sm">
                        <span className={cn("font-medium", met ? "text-emerald-700" : "text-slate-800")}>
                          {formatTargetProgressInr(row.currentRevenue)}
                        </span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="text-slate-600">{formatTargetProgressInr(row.targetAmount)}</span>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <Progress
                            value={row.progressPercent}
                            className={cn(
                              "h-2.5 flex-1",
                              met ? "[&>div]:bg-emerald-600" : "[&>div]:bg-violet-600"
                            )}
                          />
                          <span
                            className={cn(
                              "text-xs font-semibold tabular-nums w-10 text-right shrink-0",
                              met ? "text-emerald-700" : "text-violet-700"
                            )}
                          >
                            {pctLabel}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
