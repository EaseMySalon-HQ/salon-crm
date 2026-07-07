"use client"

import { useState, useEffect, useRef } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Camera, Save, Upload, X } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Check, ChevronsUpDown, ChevronDown, ChevronUp } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ProfilePhotoCropDialog } from "@/components/ui/profile-photo-crop-dialog"
import { useToast } from "@/hooks/use-toast"
import { StaffAPI, CommissionProfileAPI, AttendancePayrollSettingsAPI } from "@/lib/api"
import { useCurrency } from "@/hooks/use-currency"
import {
  applyShiftToWorkSchedule,
  findShiftById,
  formatShiftTimeRange,
  mergeAttendancePayrollSettings,
  type ShiftTemplate,
} from "@/lib/attendance-payroll-settings"

const workScheduleDaySchema = z.object({
  day: z.number().min(0).max(6),
  enabled: z.boolean(),
  startTime: z.string(),
  endTime: z.string(),
})

const staffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  role: z.enum(["admin", "manager", "staff"], {
    required_error: "Please select a role",
  }),
  salary: z.string().optional(),
  commissionProfileIds: z.array(z.string()).optional(),
  hasLoginAccess: z.boolean().optional(),
  allowAppointmentScheduling: z.boolean().optional(),
  password: z.string().optional(),
  notes: z.string().optional(),
  shiftId: z.string().optional(),
  workSchedule: z.array(workScheduleDaySchema).optional(),
})

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function getDefaultWorkSchedule(existing?: Array<{ day: number; enabled?: boolean; startTime?: string; endTime?: string }>) {
  const defaultRow = (day: number) => ({
    day,
    enabled: true,
    startTime: "09:00",
    endTime: "21:00",
  })
  if (!existing || !Array.isArray(existing) || existing.length === 0) {
    return DAY_NAMES.map((_, day) => defaultRow(day))
  }
  const byDay = new Map<number, { day: number; enabled: boolean; startTime: string; endTime: string }>()
  for (const r of existing) {
    const d = typeof r.day === "number" ? r.day : parseInt(String(r.day), 10)
    if (d >= 0 && d <= 6) {
      byDay.set(d, {
        day: d,
        enabled: r.enabled !== false,
        startTime: typeof r.startTime === "string" ? r.startTime : "09:00",
        endTime: typeof r.endTime === "string" ? r.endTime : "21:00",
      })
    }
  }
  return DAY_NAMES.map((_, day) => byDay.get(day) ?? defaultRow(day))
}

interface StaffFormProps {
  staff?: any
  onSuccess?: () => void
  /** When editing a staff who already has login access, call this to open the reset-password flow (e.g. from staff directory dialog) */
  onResetPassword?: () => void
}

export function StaffForm({ staff, onSuccess, onResetPassword }: StaffFormProps) {
  const { getSymbol } = useCurrency()
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [commissionProfiles, setCommissionProfiles] = useState<any[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [commissionDropdownOpen, setCommissionDropdownOpen] = useState(false)
  const [workScheduleOpen, setWorkScheduleOpen] = useState(false)
  const [shifts, setShifts] = useState<ShiftTemplate[]>([])
  const [loadingShifts, setLoadingShifts] = useState(true)
  const [profilePhoto, setProfilePhoto] = useState<string | null>(staff?.avatar || null)
  const [photoChanged, setPhotoChanged] = useState(false)
  const [cropDialogOpen, setCropDialogOpen] = useState(false)
  const [cropSourceImage, setCropSourceImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setProfilePhoto(staff?.avatar || null)
    setPhotoChanged(false)
  }, [staff?._id, staff?.avatar])

  const staffInitials = (name?: string) =>
    (name || "?")
      .split(/\s+/)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select a PNG, JPG, or WebP image.",
        variant: "destructive",
      })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB.",
        variant: "destructive",
      })
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = (e.target?.result as string) || null
      if (!dataUrl) return
      setCropSourceImage(dataUrl)
      setCropDialogOpen(true)
    }
    reader.readAsDataURL(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleCropComplete = (croppedDataUrl: string) => {
    setProfilePhoto(croppedDataUrl)
    setPhotoChanged(true)
    setCropSourceImage(null)
  }

  const handleCropDialogOpenChange = (open: boolean) => {
    setCropDialogOpen(open)
    if (!open) setCropSourceImage(null)
  }

  const handleRemovePhoto = () => {
    setProfilePhoto(null)
    setPhotoChanged(true)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const form = useForm<z.infer<typeof staffSchema>>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: staff?.name || "",
      email: staff?.email || "",
      phone: staff?.phone || "",
      role: staff?.role || "staff",
      salary: staff?.salary?.toString() || "",
      commissionProfileIds: staff?.commissionProfileIds || [],
      hasLoginAccess: staff?.hasLoginAccess || false,
      allowAppointmentScheduling: staff?.allowAppointmentScheduling || false,
      password: "",
      notes: staff?.notes || "",
      shiftId: staff?.shiftId || "",
      workSchedule: getDefaultWorkSchedule(staff?.workSchedule),
    },
  })

  const handleShiftChange = (shiftId: string) => {
    form.setValue("shiftId", shiftId)
    const current = form.getValues("workSchedule") || getDefaultWorkSchedule()
    if (!shiftId) return
    const shift = findShiftById(shifts, shiftId)
    if (!shift) return
    form.setValue("workSchedule", applyShiftToWorkSchedule(current, shift))
  }

  const getEnabledDayTimes = () => {
    const shift = findShiftById(shifts, form.getValues("shiftId"))
    if (shift) return { startTime: shift.startTime, endTime: shift.endTime }
    return { startTime: "09:00", endTime: "21:00" }
  }

  // Fetch commission profiles
  useEffect(() => {
    const fetchCommissionProfiles = async () => {
      try {
        setLoadingProfiles(true)
        const response = await CommissionProfileAPI.getProfiles()
        if (response.success) {
          setCommissionProfiles(response.data)
        }
      } catch (error) {
        console.error('Error fetching commission profiles:', error)
        toast({
          title: "Error",
          description: "Failed to load commission profiles",
          variant: "destructive",
        })
      } finally {
        setLoadingProfiles(false)
      }
    }

    fetchCommissionProfiles()
  }, [toast])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoadingShifts(true)
      try {
        const res = await AttendancePayrollSettingsAPI.get()
        if (active && res.success && res.data) {
          setShifts(mergeAttendancePayrollSettings(res.data).attendance.shifts)
        }
      } catch (error) {
        console.error("Error fetching shifts:", error)
      } finally {
        if (active) setLoadingShifts(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  async function onSubmit(values: z.infer<typeof staffSchema>) {
    // Require password only when enabling login for the first time (new staff or staff who didn't have login)
    if (values.hasLoginAccess && (!staff || !staff.hasLoginAccess) && (!values.password || values.password.trim() === "")) {
      form.setError("password", { type: "manual", message: "Enter a new password when enabling login access for the first time." })
      return
    }
    setIsSubmitting(true)

    try {
      const staffData = {
        name: values.name,
        email: values.email,
        phone: values.phone,
        role: values.role,
        specialties: staff?.specialties || [],
        salary: values.salary && values.salary.trim() ? parseFloat(values.salary) : 0,
        commissionProfileIds: values.commissionProfileIds || [],
        hasLoginAccess: values.hasLoginAccess || false,
        allowAppointmentScheduling: values.allowAppointmentScheduling || false,
        password: values.password || undefined,
        notes: values.notes,
        shiftId: values.shiftId || "",
        isActive: staff?.isActive ?? true,
        workSchedule: values.workSchedule && values.workSchedule.length === 7
          ? values.workSchedule.map((ws) => ({
              day: ws.day,
              enabled: ws.enabled,
              startTime: ws.startTime,
              endTime: ws.endTime,
            }))
          : undefined,
      }

      if (photoChanged) {
        staffData.avatar = profilePhoto || ""
      } else if (profilePhoto) {
        staffData.avatar = profilePhoto
      }

      console.log("Submitting staff data:", staffData)
      
      let response
      if (staff) {
        // Update existing staff
        response = await StaffAPI.update(staff._id, staffData)
        console.log("Staff API update response:", response)
      } else {
        // Create new staff
        response = await StaffAPI.create(staffData)
        console.log("Staff API create response:", response)
      }

      if (response.success) {
        toast({
          title: "Success",
          description: `Staff member has been ${staff ? 'updated' : 'added'} successfully.`,
        })
        
        if (onSuccess) {
          onSuccess()
        } else {
          router.push("/settings")
        }
      } else {
        throw new Error(response.error || `Failed to ${staff ? 'update' : 'create'} staff member`)
      }
    } catch (error) {
      console.error(`Error ${staff ? 'updating' : 'creating'} staff member:`, error)
      toast({
        title: "Error",
        description: `Failed to ${staff ? 'update' : 'create'} staff member. Please try again.`,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ProfilePhotoCropDialog
        open={cropDialogOpen}
        imageSrc={cropSourceImage}
        onOpenChange={handleCropDialogOpenChange}
        onCropComplete={handleCropComplete}
      />
      <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
          <p className="text-sm font-medium text-slate-900 mb-3">Profile photo</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="relative shrink-0">
              <Avatar className="h-20 w-20 border-2 border-white shadow-sm">
                <AvatarImage
                  src={profilePhoto || undefined}
                  alt={form.watch("name") || "Staff"}
                />
                <AvatarFallback className="bg-violet-100 text-violet-700 text-lg font-semibold">
                  {staffInitials(form.watch("name"))}
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-white shadow-md"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Upload a photo for this staff member. Shown on the appointments calendar and staff directory.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {profilePhoto ? "Change photo" : "Upload photo"}
                </Button>
                {profilePhoto ? (
                  <Button type="button" variant="ghost" size="sm" onClick={handleRemovePhoto}>
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG, or WebP · Max 5MB</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter full name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address *</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Enter email address" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number *</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="Enter phone number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="salary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salary ({getSymbol()})</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="commissionProfileIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Commission Profiles</FormLabel>
                <FormControl>
                  <Popover open={commissionDropdownOpen} onOpenChange={setCommissionDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={commissionDropdownOpen}
                        className="w-full justify-between"
                        disabled={loadingProfiles}
                      >
                        {loadingProfiles ? (
                          "Loading commission profiles..."
                        ) : field.value && field.value.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {field.value.map((profileId) => {
                              const profile = commissionProfiles.find(p => p.id === profileId)
                              return profile ? (
                                <Badge key={profileId} variant="secondary" className="text-xs">
                                  {profile.name}
                                </Badge>
                              ) : null
                            })}
                          </div>
                        ) : (
                          "Select commission profiles..."
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search commission profiles..." />
                        <CommandEmpty>No commission profiles found.</CommandEmpty>
                        <CommandGroup>
                          {commissionProfiles.map((profile) => (
                            <CommandItem
                              key={profile.id}
                              value={profile.name}
                              onSelect={() => {
                                const currentValues = field.value || []
                                const isSelected = currentValues.includes(profile.id)
                                
                                if (isSelected) {
                                  field.onChange(currentValues.filter(id => id !== profile.id))
                                } else {
                                  field.onChange([...currentValues, profile.id])
                                }
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  field.value?.includes(profile.id) ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              <div className="flex items-center gap-2">
                                <span>{profile.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {profile.type === 'target_based'
                                    ? 'Target Based'
                                    : profile.type === 'service_based'
                                      ? 'Service Based'
                                      : 'Item Based'}
                                </Badge>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Permissions Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-slate-800">Permissions</h3>
          
          <FormField
            control={form.control}
            name="hasLoginAccess"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    Provide login access to this staff
                  </FormLabel>
                  <div className="text-sm text-muted-foreground">
                    Allow this staff member to log into the system
                  </div>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={staff?.isOwner}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {/* Password: show "Enter new password" only when enabling login for the first time; otherwise show "Reset password" option */}
          {form.watch("hasLoginAccess") && (
            (staff?.hasLoginAccess ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <p className="text-sm text-slate-700">
                  Password is already set for this staff member.
                </p>
                {onResetPassword && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={onResetPassword}
                  >
                    Reset password
                  </Button>
                )}
              </div>
            ) : (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Enter new password *</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter new password for login access (min. 6 characters)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )
          ))}

          <FormField
            control={form.control}
            name="allowAppointmentScheduling"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    Allow appointment scheduling for this staff
                  </FormLabel>
                  <div className="text-sm text-muted-foreground">
                    Allow this staff member to schedule and manage appointments
                  </div>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={staff?.isOwner}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          <div>
            <h3 className="text-lg font-medium text-slate-800">Shift</h3>
            <p className="text-sm text-muted-foreground">
              Assign a business shift. Working hours come from the shift; use Work Schedule below to pick days off.
            </p>
          </div>
          <FormField
            control={form.control}
            name="shiftId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assigned shift</FormLabel>
                <Select
                  value={field.value || "none"}
                  onValueChange={(v) => handleShiftChange(v === "none" ? "" : v)}
                  disabled={loadingShifts}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingShifts ? "Loading shifts…" : "Select a shift"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No shift assigned</SelectItem>
                    {shifts.map((shift) => (
                      <SelectItem key={shift.id} value={shift.id}>
                        {shift.name} ({formatShiftTimeRange(shift.startTime, shift.endTime)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Work Schedule - Collapsible */}
        <Collapsible open={workScheduleOpen} onOpenChange={setWorkScheduleOpen}>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between py-3 px-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <div>
                  <h3 className="text-lg font-medium text-slate-800">Work Schedule</h3>
                  <p className="text-sm text-muted-foreground">
                    Select working days. Unselected days are week off.
                  </p>
                </div>
                {workScheduleOpen ? (
                  <ChevronUp className="h-5 w-5 text-slate-500 shrink-0 ml-2" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-500 shrink-0 ml-2" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 pt-0">
                <FormField
                  control={form.control}
                  name="workSchedule"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-800">Working days</FormLabel>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(field.value || []).map((row) => {
                          const on = row.enabled !== false
                          return (
                            <button
                              key={row.day}
                              type="button"
                              onClick={() => {
                                const times = getEnabledDayTimes()
                                const next = (field.value || []).map((r) =>
                                  r.day === row.day
                                    ? on
                                      ? { ...r, enabled: false }
                                      : { ...r, enabled: true, ...times }
                                    : r
                                )
                                field.onChange(next)
                              }}
                              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                on
                                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                  : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
                              }`}
                            >
                              {DAY_NAMES[row.day].slice(0, 3)}
                            </button>
                          )
                        })}
                      </div>
                      {(() => {
                        const selectedShift = findShiftById(shifts, form.watch("shiftId"))
                        if (selectedShift) {
                          return (
                            <p className="mt-3 text-xs text-muted-foreground">
                              Hours on working days follow the assigned shift (
                              {formatShiftTimeRange(selectedShift.startTime, selectedShift.endTime)}).
                            </p>
                          )
                        }
                        return (
                          <p className="mt-3 text-xs text-muted-foreground">
                            Assign a shift above to set working hours, or default hours (9 AM – 9 PM) apply.
                          </p>
                        )
                      })()}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Additional Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any additional information about the staff member..."
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting 
              ? (staff ? "Updating..." : "Adding...") 
              : (staff ? "Update Staff Details" : "Add Staff Member")
            }
          </Button>
        </div>
      </form>
    </Form>
    </>
  )
}
