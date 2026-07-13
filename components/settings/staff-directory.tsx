"use client"

import { useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"

import { StaffTable } from "@/components/staff/staff-table"
import { StaffWorkingHoursContent } from "@/components/staff/staff-working-hours-content"
import { StaffAttendanceContent } from "@/components/staff/staff-attendance-content"
import { StaffPayrollContent } from "@/components/staff/staff-payroll-content"
import { CommissionProfileList } from "@/components/settings/commission-profile-list"
import { StaffCommissionAssignments } from "@/components/settings/staff-commission-assignments"
import { SalesTargetTracking } from "@/components/settings/sales-target-tracking"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Clock, Award, Wallet, UserCheck } from "lucide-react"
import { useFeature } from "@/hooks/use-entitlements"
import { useAuth } from "@/lib/auth-context"
import { hasStaffDirectoryTabPermission } from "@/lib/permission-mappings"
import {
  SETTINGS_PANEL_SHELL,
  SETTINGS_TAB_TRIGGER,
  SETTINGS_TABS_LIST,
} from "@/lib/settings-panel-theme"

const MAIN_TABS = ["staff-list", "working-hours", "attendance", "payroll", "commission"] as const
type MainTab = (typeof MAIN_TABS)[number]

const COMMISSION_PANELS = ["profiles", "assignments", "targets"] as const
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
  const { hasPermission, user } = useAuth()
  const { hasAccess: canIncentive, isLoading: entitlementsLoading } = useFeature("incentive_management")
  const { hasAccess: canPayroll, isLoading: payrollEntitlementsLoading } = useFeature("payroll")
  const { hasAccess: canAttendance, isLoading: attendanceEntitlementsLoading } = useFeature("attendance")
  const userPermissions = user?.permissions
  const canViewStaffList = hasStaffDirectoryTabPermission(hasPermission, "staff", "view", userPermissions)
  const canViewTimesheet = hasStaffDirectoryTabPermission(hasPermission, "staff_timesheet", "view", userPermissions)
  const canViewAttendance = hasStaffDirectoryTabPermission(hasPermission, "staff_attendance", "view", userPermissions)
  const canViewPayroll = hasStaffDirectoryTabPermission(hasPermission, "staff_payroll", "view", userPermissions)
  const canViewIncentive = hasStaffDirectoryTabPermission(hasPermission, "staff_incentive", "view", userPermissions)
  const showPayrollTab = canPayroll && canViewPayroll
  const showIncentiveTab = canIncentive && canViewIncentive
  const showTimesheetTab = canAttendance && canViewTimesheet
  const showAttendanceTab = canAttendance && canViewAttendance
  const tabParam = searchParams.get("tab")
  const panelParam = searchParams.get("panel")

  const activeMainTab: MainTab = (() => {
    if (!isMainTab(tabParam)) {
      if (canViewStaffList) return "staff-list"
      if (showTimesheetTab) return "working-hours"
      if (showAttendanceTab) return "attendance"
      if (showPayrollTab) return "payroll"
      if (showIncentiveTab) return "commission"
      return "staff-list"
    }
    if (tabParam === "staff-list" && !canViewStaffList) {
      if (showTimesheetTab) return "working-hours"
      if (showAttendanceTab) return "attendance"
      if (showPayrollTab) return "payroll"
      if (showIncentiveTab) return "commission"
      return "staff-list"
    }
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
      <div className={SETTINGS_PANEL_SHELL}>
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-transparent dark:border-blue-500/30">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-foreground">Staff Directory</h2>
              <p className="text-slate-600 dark:text-muted-foreground">Manage staff accounts, roles, and access permissions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab list: outside the header card */}
      <TabsList className={SETTINGS_TABS_LIST}>
        {canViewStaffList && (
        <TabsTrigger value="staff-list" className={SETTINGS_TAB_TRIGGER}>
          <Users className="h-4 w-4" />
          Staff List
        </TabsTrigger>
        )}
        {showTimesheetTab && (
          <TabsTrigger value="working-hours" className={SETTINGS_TAB_TRIGGER}>
            <Clock className="h-4 w-4" />
            Time Sheet
          </TabsTrigger>
        )}
        {showAttendanceTab && (
          <TabsTrigger value="attendance" className={SETTINGS_TAB_TRIGGER}>
            <UserCheck className="h-4 w-4" />
            Attendance
          </TabsTrigger>
        )}
        {showPayrollTab && (
          <TabsTrigger value="payroll" className={SETTINGS_TAB_TRIGGER}>
            <Wallet className="h-4 w-4" />
            Payroll
          </TabsTrigger>
        )}
        {showIncentiveTab && (
          <TabsTrigger value="commission" className={SETTINGS_TAB_TRIGGER}>
            <Award className="h-4 w-4" />
            Incentive Management
          </TabsTrigger>
        )}
      </TabsList>

      {/* Content card: tab panels only */}
      <div className={SETTINGS_PANEL_SHELL}>
        <div className="p-6">
          {canViewStaffList && (
          <TabsContent value="staff-list" className="mt-0">
            <StaffTable />
          </TabsContent>
          )}
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
                <TabsList className="grid w-full max-w-2xl grid-cols-3 h-auto">
                  <TabsTrigger value="profiles">Commission profiles</TabsTrigger>
                  <TabsTrigger value="assignments">Staff &amp; profiles</TabsTrigger>
                  <TabsTrigger value="targets">Sales Target Tracking</TabsTrigger>
                </TabsList>
                <TabsContent value="profiles" className="mt-0 outline-none">
                  <CommissionProfileList />
                </TabsContent>
                <TabsContent value="assignments" className="mt-0 outline-none">
                  <StaffCommissionAssignments />
                </TabsContent>
                <TabsContent value="targets" className="mt-0 outline-none">
                  <SalesTargetTracking />
                </TabsContent>
              </Tabs>
            </TabsContent>
          )}
        </div>
      </div>
    </Tabs>
  )
}
