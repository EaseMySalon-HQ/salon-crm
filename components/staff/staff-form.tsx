"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Save } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Check, ChevronsUpDown, ChevronDown, ChevronUp } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useToast } from "@/hooks/use-toast"
import { StaffAPI, CommissionProfileAPI } from "@/lib/api"
import { useCurrency } from "@/hooks/use-currency"

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
  specialties: z.array(z.string()).optional(),
  salary: z.string().min(1, "Please enter salary"),
  commissionProfileIds: z.array(z.string()).optional(),
  hasLoginAccess: z.boolean().optional(),
  allowAppointmentScheduling: z.boolean().optional(),
  password: z.string().optional(),
  notes: z.string().optional(),
  workSchedule: z.array(workScheduleDaySchema).optional(),
}).refine((data) => {
  // If appointment scheduling is enabled, specialties are required
  if (data.allowAppointmentScheduling && (!data.specialties || data.specialties.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Please select at least one specialty when appointment scheduling is enabled",
  path: ["specialties"],
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

const specialtyOptions = [
  "Haircut",
  "Hair Color",
  "Hair Styling",
  "Manicure",
  "Pedicure",
  "Facial",
  "Massage",
  "Eyebrow Threading",
  "Makeup",
  "Hair Extensions",
]

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

  const form = useForm<z.infer<typeof staffSchema>>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: staff?.name || "",
      email: staff?.email || "",
      phone: staff?.phone || "",
      role: staff?.role || "staff",
      specialties: staff?.specialties || [],
      salary: staff?.salary?.toString() || "",
      commissionProfileIds: staff?.commissionProfileIds || [],
      hasLoginAccess: staff?.hasLoginAccess || false,
      allowAppointmentScheduling: staff?.allowAppointmentScheduling || false,
      password: "",
      notes: staff?.notes || "",
      workSchedule: getDefaultWorkSchedule(staff?.workSchedule),
    },
  })

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
        specialties: values.specialties || [],
        salary: parseFloat(values.salary),
        commissionProfileIds: values.commissionProfileIds || [],
        hasLoginAccess: values.hasLoginAccess || false,
        allowAppointmentScheduling: values.allowAppointmentScheduling || false,
        password: values.password || undefined,
        notes: values.notes,
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                <FormLabel>Salary ({getSymbol()}) *</FormLabel>
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
                                  {profile.type === 'target_based' ? 'Target Based' : 'Item Based'}
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
                <p className="text-sm text-slate-600 mt-1">
                  Use <strong>Reset password</strong> from the staff directory menu to change it.
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
                    Set working days and hours for this staff member
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
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left font-semibold text-slate-700 py-3 px-4 w-[140px]">Day</th>
                              <th className="text-left font-semibold text-slate-700 py-3 px-4">Start Time</th>
                              <th className="text-left font-semibold text-slate-700 py-3 px-4">End Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(field.value || []).map((row) => (
                              <tr key={row.day} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={row.enabled}
                                      onCheckedChange={(checked) => {
                                        const next = (field.value || []).map((r) =>
                                          r.day === row.day ? { ...r, enabled: !!checked } : r
                                        )
                                        field.onChange(next)
                                      }}
                                    />
                                    <span className={row.enabled ? "text-slate-800" : "text-slate-400"}>{DAY_NAMES[row.day]}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-4">
                                  <Input
                                    type="time"
                                    value={row.startTime}
                                    disabled={!row.enabled}
                                    className="w-full max-w-[140px] bg-white"
                                    onChange={(e) => {
                                      const next = (field.value || []).map((r) =>
                                        r.day === row.day ? { ...r, startTime: e.target.value } : r
                                      )
                                      field.onChange(next)
                                    }}
                                  />
                                </td>
                                <td className="py-2.5 px-4">
                                  <Input
                                    type="time"
                                    value={row.endTime}
                                    disabled={!row.enabled}
                                    className="w-full max-w-[140px] bg-white"
                                    onChange={(e) => {
                                      const next = (field.value || []).map((r) =>
                                        r.day === row.day ? { ...r, endTime: e.target.value } : r
                                      )
                                      field.onChange(next)
                                    }}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Specialties - only show when appointment scheduling is enabled */}
        {form.watch("allowAppointmentScheduling") && (
          <FormField
            control={form.control}
            name="specialties"
            render={() => (
              <FormItem>
                <div className="mb-4">
                  <FormLabel className="text-base">Specialties *</FormLabel>
                  <div className="text-sm text-muted-foreground">
                    Select the services this staff member can provide
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {specialtyOptions.map((specialty) => (
                    <FormField
                      key={specialty}
                      control={form.control}
                      name="specialties"
                      render={({ field }) => {
                        return (
                          <FormItem key={specialty} className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(specialty)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...field.value, specialty])
                                    : field.onChange(field.value?.filter((value) => value !== specialty))
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">{specialty}</FormLabel>
                          </FormItem>
                        )
                      }}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

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
  )
}
