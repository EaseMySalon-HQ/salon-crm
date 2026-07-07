"use client"

import { useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"

import { StaffTable } from "@/components/staff/staff-table"
import { StaffWorkingHoursContent } from "@/components/staff/staff-working-hours-content"
import { StaffAttendanceContent } from "@/components/staff/staff-attendance-content"
import { StaffPayrollContent } from "@/components/staff/staff-payroll-content"
import { CommissionProfileList } from "@/components/settings/commission-profile-list"
import { StaffCommissionAssignments } from "@/components/settings/staff-commission-assignments"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Clock, Award, Wallet, UserCheck } from "lucide-react"
import { useFeature } from "@/hooks/use-entitlements"
import { useAuth } from "@/lib/auth-context"

const MAIN_TABS = ["staff-list", "working-hours", "attendance", "payroll", "commission"] as const
type MainTab = (typeof MAIN_TABS)[number]

const COMMISSION_PANELS = ["profiles", "assignments"] as const
type CommissionPanel = (typeof COMMISSION_PANELS)[number]

function isMainTab(v: string | null): v is MainTab {
  return v != null && (MAIN_TABS as readonly string[]).includes(v)
}

function isCommissionPanel(v: string | null): v is CommissionPanel {
  return v != null && (COMMISSION_PANELS as readonly string[]).includes(v)
}

function buildStaffDirectoryUrl(params: URLSearchParams, inSettings: boolean): string {
  if (inSettings) {
    params.set("section", "staff-directory")
    return `/settings?${params.toString()}`
  }
  const q = params.toString()
  return q ? `/staff?${q}` : "/staff"
}

type StaffDirectoryProps = {
  /** When true, tab URLs use /settings?section=staff-directory */
  inSettings?: boolean
}

export function StaffDirectory({ inSettings = false }: StaffDirectoryProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { hasPermission } = useAuth()
  const { hasAccess: canIncentive, isLoading: entitlementsLoading } = useFeature("incentive_management")
  const { hasAccess: canPayroll, isLoading: payrollEntitlementsLoading } = useFeature("payroll")
  const { hasAccess: canAttendance, isLoading: attendanceEntitlementsLoading } = useFeature("attendance")
  const canViewPayrollSettings = hasPermission("payroll_settings", "view")
  const canViewIncentiveSettings = hasPermission("incentive_settings", "view")
  const showPayrollTab = canPayroll && canViewPayrollSettings
  const showIncentiveTab = canIncentive && canViewIncentiveSettings
  const showTimesheetTab = canAttendance && canViewPayrollSettings
  const showAttendanceTab = canAttendance && canViewPayrollSettings
  const tabParam = searchParams.get("tab")
  const panelParam = searchParams.get("panel")

  const activeMainTab: MainTab = (() => {
    if (!isMainTab(tabParam)) return "staff-list"
    if (tabParam === "commission" && !showIncentiveTab) return "staff-list"
    if (tabParam === "payroll" && !showPayrollTab) return "staff-list"
    if ((tabParam === "working-hours" || tabParam === "attendance") && !showTimesheetTab) {
      return "staff-list"
    }
    return tabParam
  })()
  const commissionPanel: CommissionPanel =
    activeMainTab === "commission" && isCommissionPanel(panelParam) ? panelParam : "profiles"

  const pushStaffUrl = (params: URLSearchParams) => {
    router.push(buildStaffDirectoryUrl(params, inSettings))
  }

  useEffect(() => {
    if (entitlementsLoading || showIncentiveTab) return
    if (tabParam === "commission") {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("tab")
      params.delete("panel")
      router.replace(buildStaffDirectoryUrl(params, inSettings))
    }
  }, [showIncentiveTab, entitlementsLoading, tabParam, searchParams, router, inSettings])

  useEffect(() => {
    if (payrollEntitlementsLoading || attendanceEntitlementsLoading) return
    if (
      (tabParam === "payroll" && !showPayrollTab) ||
      ((tabParam === "working-hours" || tabParam === "attendance") && !showTimesheetTab)
    ) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("tab")
      params.delete("panel")
      router.replace(buildStaffDirectoryUrl(params, inSettings))
    }
  }, [
    showPayrollTab,
    showTimesheetTab,
    payrollEntitlementsLoading,
    attendanceEntitlementsLoading,
    tabParam,
    searchParams,
    router,
    inSettings,
  ])

  const onMainTabChange = (value: string) => {
    if (!isMainTab(value)) return
    const params = new URLSearchParams(searchParams.toString())
    if (value === "staff-list") {
      params.delete("tab")
      params.delete("panel")
    } else if (value === "working-hours" || value === "attendance" || value === "payroll") {
      params.set("tab", value)
      params.delete("panel")
    } else {
      params.set("tab", "commission")
      if (!isCommissionPanel(params.get("panel"))) {
        params.delete("panel")
      }
    }
    pushStaffUrl(params)
  }

  const onCommissionPanelChange = (value: string) => {
    if (!isCommissionPanel(value)) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", "commission")
    if (value === "profiles") {
      params.delete("panel")
    } else {
      params.set("panel", value)
    }
    pushStaffUrl(params)
  }

  return (
    <Tabs value={activeMainTab} onValueChange={onMainTabChange} className="w-full space-y-6">
      {/* Header card: title and description only */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Staff Directory</h2>
              <p className="text-slate-600">Manage staff accounts, roles, and access permissions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab list: outside the header card */}
      <TabsList className="h-11 rounded-xl bg-slate-100 p-1 gap-1 w-full sm:w-auto inline-flex">
        <TabsTrigger value="staff-list" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm flex-1 sm:flex-initial">
          <Users className="h-4 w-4" />
          Staff List
        </TabsTrigger>
        {showTimesheetTab && (
          <TabsTrigger value="working-hours" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm flex-1 sm:flex-initial">
            <Clock className="h-4 w-4" />
            Time Sheet
          </TabsTrigger>
        )}
        {showAttendanceTab && (
          <TabsTrigger value="attendance" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm flex-1 sm:flex-initial">
            <UserCheck className="h-4 w-4" />
            Attendance
          </TabsTrigger>
        )}
        {showPayrollTab && (
          <TabsTrigger value="payroll" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm flex-1 sm:flex-initial">
            <Wallet className="h-4 w-4" />
            Payroll
          </TabsTrigger>
        )}
        {showIncentiveTab && (
          <TabsTrigger value="commission" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm flex-1 sm:flex-initial">
            <Award className="h-4 w-4" />
            Incentive Management
          </TabsTrigger>
        )}
      </TabsList>

      {/* Content card: tab panels only */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <TabsContent value="staff-list" className="mt-0">
            <StaffTable />
          </TabsContent>
          {showTimesheetTab && (
            <TabsContent value="working-hours" className="mt-0">
              <StaffWorkingHoursContent />
            </TabsContent>
          )}
          {showAttendanceTab && (
            <TabsContent value="attendance" className="mt-0">
              <StaffAttendanceContent />
            </TabsContent>
          )}
          {showPayrollTab && (
            <TabsContent value="payroll" className="mt-0">
              <StaffPayrollContent />
            </TabsContent>
          )}
          {showIncentiveTab && (
            <TabsContent value="commission" className="mt-0">
              <Tabs
                value={commissionPanel}
                onValueChange={onCommissionPanelChange}
                className="space-y-6"
              >
                <TabsList className="grid w-full max-w-md grid-cols-2 h-auto">
                  <TabsTrigger value="profiles">Commission profiles</TabsTrigger>
                  <TabsTrigger value="assignments">Staff &amp; profiles</TabsTrigger>
                </TabsList>
                <TabsContent value="profiles" className="mt-0 outline-none">
                  <CommissionProfileList />
                </TabsContent>
                <TabsContent value="assignments" className="mt-0 outline-none">
                  <StaffCommissionAssignments />
                </TabsContent>
              </Tabs>
            </TabsContent>
          )}
        </div>
      </div>
    </Tabs>
  )
}
