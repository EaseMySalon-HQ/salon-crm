"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Home,
  Receipt,
  CalendarDays,
  Users,
  Phone,
  Megaphone,
  Wrench,
  Package,
  Banknote,
  PieChart,
  BarChart3,
  Settings,
  Lock,
  Unlock,
  Check,
  X,
  Shield,
  SlidersHorizontal,
  Building2,
  CreditCard,
  Bell,
  Wallet,
  DollarSign,
  Calculator,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { StaffAPI } from "@/lib/api"
import { cn } from "@/lib/utils"

interface Permission {
  module: string
  feature: string
  enabled: boolean
}

interface Staff {
  _id: string
  name: string
  email: string
  role: string
  hasLoginAccess: boolean
  allowAppointmentScheduling: boolean
  permissions: Permission[]
  permissionsTemplate?: "admin" | "manager" | "staff" | "custom" | null
  isOwner?: boolean
}

interface StaffPermissionsModalProps {
  isOpen: boolean
  onClose: () => void
  staff: Staff | null
  onUpdate: () => void
}

type AccessLevel = "none" | "view" | "edit" | "full"

const ACCESS_LEVELS: { value: AccessLevel; label: string; color: string }[] = [
  { value: "none", label: "No Access", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "view", label: "View Only", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "edit", label: "Edit Access", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "full", label: "Full Access", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
]
// Mixed state: some nested full, some none - show Full Access in orange
const MIXED_ACCESS = { label: "Full Access", color: "bg-orange-50 text-orange-700 border-orange-200" }

const accessLevelToPermissions = (module: string, level: AccessLevel): Permission[] => {
  const features = ["view", "create", "edit", "delete", "manage"] as const
  let perms: Permission[] = []
  if (level === "none") perms = features.map((f) => ({ module, feature: f, enabled: false }))
  else if (level === "view") perms = features.map((f) => ({ module, feature: f, enabled: f === "view" }))
  else if (level === "edit")
    perms = features.map((f) => ({ module, feature: f, enabled: ["view", "create", "edit"].includes(f) }))
  else perms = features.map((f) => ({ module, feature: f, enabled: true }))

  // Reports has granular view features; set them explicitly when changing level
  if (module === "reports") {
    const viewEnabled = level !== "none"
    perms.push(
      { module, feature: "view_financial_reports", enabled: viewEnabled },
      { module, feature: "view_staff_commission", enabled: viewEnabled }
    )
  }
  return perms
}

const permissionsToAccessLevel = (perms: Permission[], module: string): AccessLevel => {
  const m = perms.filter((p) => p.module === module)
  const v = m.find((p) => p.feature === "view")?.enabled ?? false
  // Reports has granular view features; count as "view" if any is enabled
  const reportsView =
    module === "reports"
      ? v ||
        (m.find((p) => p.feature === "view_financial_reports")?.enabled ?? false) ||
        (m.find((p) => p.feature === "view_staff_commission")?.enabled ?? false)
      : v
  const c = m.find((p) => p.feature === "create")?.enabled ?? false
  const e = m.find((p) => p.feature === "edit")?.enabled ?? false
  const d = m.find((p) => p.feature === "delete")?.enabled ?? false
  const mg = m.find((p) => p.feature === "manage")?.enabled ?? false
  if (mg && d && e && c && reportsView) return "full"
  if (e || c) return "edit"
  if (reportsView) return "view"
  return "none"
}

// For categories with nested items: if some have full/edit/view and some have none, show "Full Access" in orange
function getNestedDisplayLevel(perms: Permission[], nestedModuleIds: readonly string[]): { label: string; color: string } | null {
  const levels = nestedModuleIds.map((id) => permissionsToAccessLevel(perms, id))
  const hasAccess = levels.some((l) => l === "full" || l === "edit" || l === "view")
  const hasNone = levels.some((l) => l === "none")
  if (hasAccess && hasNone) return MIXED_ACCESS
  return null
}

// Feature mapping: custom feature id -> backend feature
const FEATURE_TO_BACKEND: Record<string, string> = {
  create_bill: "create",
  edit_bill: "edit",
  delete_bill: "delete",
  apply_discount: "edit",
  issue_refund: "manage",
  add_tip: "edit",
  open_shift: "create",
  close_shift: "manage",
  modify_past_shifts: "edit",
  view_cash_difference: "view",
  verify_lock_day: "manage",
  view_financial_reports: "view_financial_reports",
  view_staff_commission: "view_staff_commission",
  export_reports: "manage",
  add_staff: "create",
  edit_staff: "edit",
  delete_staff: "delete",
  manage_permissions: "manage",
}

// Sidebar modules (Level 1) - matches side-nav
const SIDEBAR_MODULES = [
  { id: "dashboard", label: "Dashboard", module: "dashboard", icon: Home },
  {
    id: "quick_sale",
    label: "Quick Sale",
    module: "sales",
    icon: Receipt,
    hasFeatureLevel: true,
    features: [
      { id: "create_bill", label: "Create Bill" },
      { id: "edit_bill", label: "Edit Bill" },
      { id: "delete_bill", label: "Delete Bill" },
      { id: "apply_discount", label: "Apply Discount" },
      { id: "issue_refund", label: "Issue Refund" },
      { id: "add_tip", label: "Add Tip" },
    ],
  },
  { id: "appointments", label: "Appointments", module: "appointments", icon: CalendarDays },
  { id: "clients", label: "Clients", module: "clients", icon: Users },
  { id: "leads", label: "Leads", module: "lead_management", icon: Phone },
  { id: "campaigns", label: "Campaigns", module: "campaigns", icon: Megaphone },
  { id: "services", label: "Services", module: "services", icon: Wrench },
  { id: "products", label: "Products", module: "products", icon: Package },
  {
    id: "cash_register",
    label: "Cash Register",
    module: "cash_registry",
    icon: Banknote,
    hasFeatureLevel: true,
    features: [
      { id: "open_shift", label: "Open Shift" },
      { id: "close_shift", label: "Close Shift" },
      { id: "modify_past_shifts", label: "Modify Past Shifts" },
      { id: "view_cash_difference", label: "View Cash Difference" },
      { id: "verify_lock_day", label: "Verify & Lock Day" },
    ],
  },
  { id: "analytics", label: "Analytics", module: "analytics", icon: PieChart },
  {
    id: "reports",
    label: "Reports",
    module: "reports",
    icon: BarChart3,
    hasFeatureLevel: true,
    features: [
      { id: "view_financial_reports", label: "View Financial Reports" },
      { id: "view_staff_commission", label: "View Staff Commission" },
      { id: "export_reports", label: "Export Reports" },
    ],
  },
  {
    id: "staff_directory",
    label: "Staff Directory",
    module: "staff",
    icon: Users,
    hasFeatureLevel: true,
    features: [
      { id: "add_staff", label: "Add Staff" },
      { id: "edit_staff", label: "Edit Staff" },
      { id: "delete_staff", label: "Delete Staff" },
      { id: "manage_permissions", label: "Manage Permissions" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    module: "settings",
    icon: Settings,
    isSettingsParent: true,
  },
] as const

// Settings categories - matches settings-page exactly
// adminOnly: only Admin role can access by default; Admin permissions can be managed
const SETTINGS_CATEGORIES = [
  { id: "general_settings", label: "General Settings", icon: Settings, adminOnly: false },
  { id: "business_settings", label: "Business Settings", icon: Building2, adminOnly: false },
  { id: "appointment_settings", label: "Appointment Settings", icon: CalendarDays, adminOnly: false },
  { id: "currency_settings", label: "Currency Settings", icon: DollarSign, adminOnly: false },
  { id: "tax_settings", label: "Tax Settings", icon: Calculator, adminOnly: false },
  { id: "payment_settings", label: "Payment Settings", icon: CreditCard, adminOnly: true },
  { id: "pos_settings", label: "POS Settings", icon: Receipt, adminOnly: true },
  { id: "notification_settings", label: "Notifications", icon: Bell, adminOnly: false },
  { id: "plan_billing", label: "Plan & Billing", icon: Wallet, adminOnly: true },
] as const

const ADMIN_ONLY_SETTINGS = SETTINGS_CATEGORIES.filter((s) => s.adminOnly).map((s) => s.id)

function mergePermissions(existing: Permission[], updates: Permission[]): Permission[] {
  const byKey = new Map<string, Permission>()
  existing.forEach((p) => byKey.set(`${p.module}:${p.feature}`, p))
  updates.forEach((p) => byKey.set(`${p.module}:${p.feature}`, p))
  return Array.from(byKey.values())
}

// Build role templates with all modules
const ALL_PAGE_MODULES = [
  ...SIDEBAR_MODULES.filter((m) => !m.isSettingsParent).map((m) => m.module),
  ...SETTINGS_CATEGORIES.map((s) => s.id),
]
function buildRoleTemplate(role: "admin" | "manager" | "staff"): Permission[] {
  const perms: Permission[] = []
  const features = ["view", "create", "edit", "delete", "manage"] as const

  if (role === "admin") {
    ALL_PAGE_MODULES.forEach((mod) => {
      features.forEach((f) => perms.push({ module: mod, feature: f, enabled: true }))
    })
    return perms
  }

  if (role === "manager") {
    const managerModules = [
      "dashboard",
      "sales",
      "appointments",
      "clients",
      "lead_management",
      "campaigns",
      "services",
      "products",
      "cash_registry",
      "analytics",
      "reports",
      "general_settings",
      "business_settings",
      "appointment_settings",
      "currency_settings",
      "tax_settings",
      "notification_settings",
    ]
    managerModules.forEach((mod) => {
      features.forEach((f) => perms.push({ module: mod, feature: f, enabled: true }))
    })
    return perms
  }

  // staff
  const staffModules = [
    { m: "dashboard", f: ["view"] },
    { m: "sales", f: ["view", "create"] },
    { m: "appointments", f: ["view", "create", "edit"] },
    { m: "clients", f: ["view", "create", "edit"] },
    { m: "services", f: ["view"] },
    { m: "products", f: ["view"] },
    { m: "general_settings", f: ["view"] },
  ]
  staffModules.forEach(({ m, f }) => {
    features.forEach((fe) => perms.push({ module: m, feature: fe, enabled: f.includes(fe) }))
  })
  return perms
}

const ROLE_TEMPLATES = {
  admin: buildRoleTemplate("admin"),
  manager: buildRoleTemplate("manager"),
  staff: buildRoleTemplate("staff"),
}

export function StaffPermissionsModal({ isOpen, onClose, staff, onUpdate }: StaffPermissionsModalProps) {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [selectedRole, setSelectedRole] = useState<"admin" | "manager" | "staff" | "custom">("staff")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [initialPermissions, setInitialPermissions] = useState<Permission[]>([])
  const [adminChangeWarningOpen, setAdminChangeWarningOpen] = useState(false)
  const [cashRegisterConfirmOpen, setCashRegisterConfirmOpen] = useState(false)
  const [pendingRole, setPendingRole] = useState<"admin" | "manager" | "staff" | "custom" | null>(null)
  const [pendingModuleChange, setPendingModuleChange] = useState<{ module: string; level: AccessLevel } | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (staff) {
      const perms = staff.permissions || []
      setPermissions(perms)
      setInitialPermissions(perms)
      // Use last saved template if set, otherwise fall back to staff.role
      const template = staff.permissionsTemplate ?? staff.role
      if (template === "admin") setSelectedRole("admin")
      else if (template === "manager") setSelectedRole("manager")
      else if (template === "staff") setSelectedRole("staff")
      else setSelectedRole("custom")
    }
  }, [staff])

  const isOwner = staff?.isOwner ?? false
  // Only lock for business owner; Admin role permissions can be managed
  const isLocked = isOwner

  const hasChanges = useMemo(() => {
    const sortedA = [...initialPermissions].sort((a, b) =>
      `${a.module}:${a.feature}`.localeCompare(`${b.module}:${b.feature}`)
    )
    const sortedB = [...permissions].sort((a, b) =>
      `${a.module}:${a.feature}`.localeCompare(`${b.module}:${b.feature}`)
    )
    return JSON.stringify(sortedA) !== JSON.stringify(sortedB)
  }, [initialPermissions, permissions])

  const changeCount = useMemo(() => {
    const initMap = new Map(initialPermissions.map((p) => [`${p.module}:${p.feature}`, p.enabled]))
    const currMap = new Map(permissions.map((p) => [`${p.module}:${p.feature}`, p.enabled]))
    const allKeys = new Set([...initMap.keys(), ...currMap.keys()])
    let count = 0
    allKeys.forEach((key) => {
      if (initMap.get(key) !== currMap.get(key)) count++
    })
    return count
  }, [initialPermissions, permissions])

  const handleRoleSelect = (role: "admin" | "manager" | "staff" | "custom") => {
    if (isOwner && role !== "admin") return
    if (selectedRole === "admin" && role !== "admin" && !isOwner) {
      setPendingRole(role)
      setAdminChangeWarningOpen(true)
      return
    }
    applyRoleSelect(role)
  }

  const applyRoleSelect = (role: "admin" | "manager" | "staff" | "custom") => {
    setPendingRole(null)
    setAdminChangeWarningOpen(false)
    setSelectedRole(role)
    if (role === "custom") {
      const noAccess = ALL_PAGE_MODULES.flatMap((m) => accessLevelToPermissions(m, "none"))
      setPermissions(noAccess)
    } else {
      setPermissions(ROLE_TEMPLATES[role])
    }
  }

  const handleAccessLevelChange = (module: string, level: AccessLevel) => {
    if (isLocked) return
    if (module === "cash_registry" && level === "none") {
      const current = permissionsToAccessLevel(permissions, module)
      if (current !== "none") {
        setPendingModuleChange({ module, level })
        setCashRegisterConfirmOpen(true)
        return
      }
    }
    applyAccessLevelChange(module, level)
  }

  const applyAccessLevelChange = (module: string, level: AccessLevel) => {
    setPendingModuleChange(null)
    setCashRegisterConfirmOpen(false)
    const updates = accessLevelToPermissions(module, level)
    setPermissions((prev) => mergePermissions(prev, updates))
    setSelectedRole("custom")
  }

  const handleFeatureToggle = (module: string, featureId: string, enabled: boolean) => {
    if (isLocked) return
    const backendFeature = FEATURE_TO_BACKEND[featureId] ?? "view"
    setPermissions((prev) => {
      const existing = prev.find((p) => p.module === module && p.feature === backendFeature)
      if (existing) {
        return prev.map((p) =>
          p.module === module && p.feature === backendFeature ? { ...p, enabled } : p
        )
      }
      return [...prev, { module, feature: backendFeature, enabled }]
    })
    setSelectedRole("custom")
  }

  const getModuleAccessLevel = (module: string) => permissionsToAccessLevel(permissions, module)

  const getFeatureEnabled = (module: string, featureId: string) => {
    const backendFeature = FEATURE_TO_BACKEND[featureId] ?? "view"
    const explicit = permissions.find((p) => p.module === module && p.feature === backendFeature)?.enabled
    if (explicit !== undefined) return explicit
    // Fallback: view_financial_reports and view_staff_commission inherit from "view" when not explicitly set
    if (
      (backendFeature === "view_financial_reports" || backendFeature === "view_staff_commission") &&
      module === "reports"
    ) {
      return permissions.find((p) => p.module === module && p.feature === "view")?.enabled ?? false
    }
    return false
  }

  const handleSave = async () => {
    if (!staff) return
    setIsLoading(true)
    try {
      await StaffAPI.update(staff._id, { permissions, permissionsTemplate: selectedRole })
      toast({ title: "Success", description: "Permissions updated successfully" })
      onUpdate()
      onClose()
    } catch (error) {
      console.error("Error updating permissions:", error)
      toast({ title: "Error", description: "Failed to update permissions", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const summary = useMemo(() => {
    const modules = [...new Set(permissions.map((p) => p.module))]
    let full = 0,
      limited = 0,
      restricted = 0
    modules.forEach((m) => {
      const level = permissionsToAccessLevel(permissions, m)
      if (level === "full") full++
      else if (level === "view" || level === "edit") limited++
      else restricted++
    })
    return { full, limited, restricted }
  }, [permissions])

  const isModuleDisabled = (moduleId: string, backendModule: string) => {
    if (isLocked) return true
    // Allow all modules to be managed; changing any "No Access" field will switch role to Custom
    return false
  }

  if (!staff) return null

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 bg-slate-50/95">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-slate-200 bg-white/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white rounded-xl shadow-sm border border-slate-100">
                  <Shield className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-slate-900">
                    Staff Permissions
                  </DialogTitle>
                  <DialogDescription className="text-slate-600 text-sm">
                    Hybrid role-based access for {staff.name}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="advanced-controls"
                  checked={showAdvanced}
                  onCheckedChange={setShowAdvanced}
                />
                <label
                  htmlFor="advanced-controls"
                  className="text-sm text-slate-600 flex items-center gap-1.5 cursor-pointer"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Show Advanced Controls
                </label>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
              {/* Left Sidebar Panel */}
              <div className="lg:col-span-4 p-6 space-y-4 bg-slate-50/50 border-r border-slate-200">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-14 w-14 rounded-xl border-2 border-slate-100 shrink-0">
                      <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700 text-lg font-semibold rounded-xl">
                        {staff.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{staff.name}</h3>
                      <p className="text-sm text-slate-500 truncate">{staff.email}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            staff.role === "admin"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : staff.role === "manager"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                          )}
                        >
                          {staff.role === "admin" ? "Admin" : staff.role === "manager" ? "Manager" : "Staff"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            staff.hasLoginAccess ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
                          )}
                        >
                          {staff.hasLoginAccess ? <><Unlock className="h-3 w-3 mr-1" /> Login</> : <><Lock className="h-3 w-3 mr-1" /> No Login</>}
                        </Badge>
                        {isOwner && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            <Lock className="h-3 w-3 mr-1" /> Protected
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Role Template</p>
                  <div className="flex rounded-lg bg-slate-100 p-1 gap-0.5">
                    {(["admin", "manager", "staff", "custom"] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => handleRoleSelect(role)}
                        disabled={isOwner && role !== "admin"}
                        className={cn(
                          "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all",
                          selectedRole === role ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                          isOwner && role !== "admin" && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {role === "admin" ? "Admin" : role.charAt(0).toUpperCase() + role.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Permission Overview</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <Check className="h-4 w-4" />
                      <span>{summary.full} Full Access</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Check className="h-4 w-4" />
                      <span>{summary.limited} Limited</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <X className="h-4 w-4" />
                      <span>{summary.restricted} Restricted</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Main Panel - Accordion */}
              <div className="lg:col-span-8 p-6">
                <Accordion type="multiple" defaultValue={["dashboard", "quick_sale", "appointments", "settings"]} className="space-y-2">
                  {SIDEBAR_MODULES.map((mod) => {
                    const Icon = mod.icon
                    const backendModule = mod.module
                    const level = getModuleAccessLevel(backendModule)
                    const disabled = isModuleDisabled(mod.id, backendModule)
                    const isSettings = mod.isSettingsParent

                    // For categories with nested items: show "Full Access" in orange when mixed (some full, some none)
                    const nestedIds = isSettings ? SETTINGS_CATEGORIES.map((s) => s.id) : []
                    const mixedDisplay = nestedIds.length > 0 ? getNestedDisplayLevel(permissions, nestedIds) : null
                    const effectiveLevel =
                      isSettings && nestedIds.length > 0
                        ? nestedIds.reduce<AccessLevel>((max, id) => {
                            const l = permissionsToAccessLevel(permissions, id)
                            const order = { full: 4, edit: 3, view: 2, none: 1 }
                            return order[l] > order[max] ? l : max
                          }, "none")
                        : level
                    const badgeInfo = mixedDisplay
                      ? mixedDisplay
                      : ACCESS_LEVELS.find((a) => a.value === effectiveLevel) ?? { label: effectiveLevel, color: "bg-slate-100 text-slate-700 border-slate-200" }

                    return (
                      <AccordionItem
                        key={mod.id}
                        value={mod.id}
                        className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden data-[state=open]:shadow-md"
                      >
                        <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50/50 [&[data-state=open]]:bg-slate-50/50">
                          <div className="flex items-center justify-between w-full pr-4">
                            <div className="flex items-center gap-3 text-left">
                              <div className="p-1.5 bg-slate-100 rounded-lg">
                                <Icon className="h-4 w-4 text-slate-600" />
                              </div>
                              <span className="font-medium text-slate-900">{mod.label}</span>
                            </div>
                            <Badge variant="outline" className={cn("text-xs", badgeInfo.color)}>
                              {badgeInfo.label}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 pt-0">
                          <div className="space-y-4 pt-2">
                            {/* Page-level dropdown */}
                            {!isSettings && (
                              <div className="flex items-center justify-between py-2">
                                <span className="text-sm text-slate-600">Access Level</span>
                                <Select
                                  value={level}
                                  onValueChange={(v) => handleAccessLevelChange(backendModule, v as AccessLevel)}
                                  disabled={disabled}
                                >
                                  <SelectTrigger className={cn("w-[150px] h-9", disabled && "opacity-60")}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ACCESS_LEVELS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {/* Feature-level controls (when Show Advanced is ON) */}
                            {showAdvanced && mod.hasFeatureLevel && mod.features && (
                              <div className="mt-4 pt-4 border-t border-slate-200 bg-slate-50/50 rounded-lg p-4 -mx-1">
                                <p className="text-xs font-medium text-slate-500 mb-3">Feature Permissions</p>
                                <div className="space-y-2">
                                  {mod.features.map((f) => (
                                    <div
                                      key={f.id}
                                      className="flex items-center justify-between py-2 px-3 rounded-md"
                                    >
                                      <span className="text-sm text-slate-700">{f.label}</span>
                                      <Switch
                                        checked={getFeatureEnabled(backendModule, f.id)}
                                        onCheckedChange={(enabled) => handleFeatureToggle(backendModule, f.id, enabled)}
                                        disabled={isLocked}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Settings nested categories */}
                            {isSettings && (
                              <div className="space-y-3 mt-2">
                                {SETTINGS_CATEGORIES.map((setCat) => {
                                  const SetIcon = setCat.icon
                                  const setLevel = getModuleAccessLevel(setCat.id)
                                  return (
                                    <div
                                      key={setCat.id}
                                      className="flex items-center justify-between py-2 pl-4 border-l-2 border-slate-200"
                                    >
                                      <div className="flex items-center gap-2">
                                        <SetIcon className="h-4 w-4 text-slate-500" />
                                        <span className="text-sm font-medium text-slate-800">{setCat.label}</span>
                                        {setCat.adminOnly && selectedRole !== "admin" && (
                                          <Lock className="h-3.5 w-3.5 text-amber-500" title="Admin Only" />
                                        )}
                                      </div>
                                      <Select
                                        value={setLevel}
                                        onValueChange={(v) => {
                                          const updates = accessLevelToPermissions(setCat.id, v as AccessLevel)
                                          setPermissions((prev) => mergePermissions(prev, updates))
                                          setSelectedRole("custom")
                                        }}
                                        disabled={setCat.adminOnly && selectedRole !== "admin"}
                                      >
                                        <SelectTrigger className={cn("w-[140px] h-8 text-sm", (setCat.adminOnly && selectedRole !== "admin") && "opacity-60")}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {ACCESS_LEVELS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                              {opt.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>

                <p className="text-xs text-slate-500 mt-6">
                  Admin has full access to all categories by default. Payment Settings, POS Settings, and Plan & Billing are admin-only; permissions can be managed.
                </p>
              </div>
            </div>
          </div>

          {/* Sticky Footer */}
          <div
            className={cn(
              "sticky bottom-0 left-0 right-0 px-6 py-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex items-center justify-between",
              hasChanges && "bg-amber-50/80 border-amber-200"
            )}
          >
            <span className="text-sm text-slate-600">
              {hasChanges && (
                <span className="text-amber-700 font-medium">
                  Unsaved Changes {changeCount > 0 && `(${changeCount})`}
                </span>
              )}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isLoading || !hasChanges || isOwner}>
                {isLoading ? "Saving..." : "Save Permissions"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin change warning */}
      <AlertDialog open={adminChangeWarningOpen} onOpenChange={setAdminChangeWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change from Admin role?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to change from the Admin role. This will remove full administrative access. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingRole(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingRole && applyRoleSelect(pendingRole)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cash Register removal confirmation */}
      <AlertDialog open={cashRegisterConfirmOpen} onOpenChange={setCashRegisterConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Cash Register access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke all Cash Register permissions. The user will no longer be able to open shifts, close shifts, or view cash differences. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingModuleChange(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingModuleChange && applyAccessLevelChange(pendingModuleChange.module, pendingModuleChange.level)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
