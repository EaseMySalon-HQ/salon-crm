"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { HelpCircle, Lock } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/use-toast"
import { UsersAPI, CommissionProfileAPI } from "@/lib/api"
import { CommissionProfile } from "@/lib/commission-profile-types"

const userSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Please enter a valid email"),
  password: z.string().optional(),
  mobile: z.string().min(10, "Mobile number is required and must be at least 10 digits"),
  hasLoginAccess: z.boolean(),
  allowAppointmentScheduling: z.boolean(),
  role: z.string().optional(),
  commissionProfileIds: z.array(z.string()).optional(),
}).refine((data) => {
  // Password is required for new users if login access is enabled
  if (data.hasLoginAccess && !data.password) {
    return false;
  }
  return true;
}, {
  message: "Password is required when login access is enabled",
  path: ["password"],
});

const createUserEditSchema = (mode: string, user: any) => z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Please enter a valid email"),
  password: z.string().optional(),
  mobile: z.string().min(10, "Mobile number is required and must be at least 10 digits"),
  hasLoginAccess: z.boolean(),
  allowAppointmentScheduling: z.boolean(),
  role: z.string().optional(),
  commissionProfileIds: z.array(z.string()).optional(),
}).refine((data) => {
  // For edit mode, password is only required if the user is changing from no login access to having login access
  // For add mode, password is required if login access is enabled
  // Admin users always have login access and don't need password validation for updates
  if (data.hasLoginAccess && !data.password && data.role !== 'admin') {
    // Check if this is edit mode and the user already has login access
    // If so, don't require password unless they're changing it
    if (mode === "edit" && user?.hasLoginAccess) {
      return true; // Allow form submission without password for existing users with login access
    }
    // For new users or users enabling login access for the first time, require password
    return false;
  }
  return true;
}, {
  message: "Password is required when enabling login access",
  path: ["password"],
});

const passwordChangeSchema = z.object({
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type UserFormData = z.infer<typeof userSchema>
type PasswordChangeData = z.infer<typeof passwordChangeSchema>

interface UserFormProps {
  user?: any
  onSubmit: (data: UserFormData) => void
  mode?: "add" | "edit"
}

export function UserForm({ user, onSubmit, mode = "add" }: UserFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false)
  const [isAdminPasswordDialogOpen, setIsAdminPasswordDialogOpen] = useState(false)
  const [adminPassword, setAdminPassword] = useState("")
  const [isEnablingLoginAccess, setIsEnablingLoginAccess] = useState(false)
  const [commissionProfiles, setCommissionProfiles] = useState<CommissionProfile[]>([])
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false)

  const form = useForm<UserFormData>({
    resolver: zodResolver(mode === "edit" ? createUserEditSchema(mode, user) : userSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      password: "",
      mobile: user?.mobile || "",
      hasLoginAccess: user?.hasLoginAccess || false,
      allowAppointmentScheduling: user?.allowAppointmentScheduling || false,
      role: user?.role || "staff",
      commissionProfileIds: user?.commissionProfileIds || [],
    },
  })

  // Watch for changes in login access
  const hasLoginAccess = form.watch("hasLoginAccess")
  
  // Update state when login access changes
  useEffect(() => {
    if (mode === "edit" && !user?.hasLoginAccess && hasLoginAccess) {
      setIsEnablingLoginAccess(true)
    } else {
      setIsEnablingLoginAccess(false)
    }
  }, [hasLoginAccess, user?.hasLoginAccess, mode])

  // Load commission profiles on component mount
  useEffect(() => {
    const loadCommissionProfiles = async () => {
      setIsLoadingProfiles(true)
      try {
        const response = await CommissionProfileAPI.getProfiles()
        if (response.success) {
          setCommissionProfiles(response.data || [])
        } else {
          console.error('Failed to load commission profiles:', response.error)
        }
      } catch (error) {
        console.error('Error loading commission profiles:', error)
      } finally {
        setIsLoadingProfiles(false)
      }
    }

    loadCommissionProfiles()
  }, [])


  const passwordForm = useForm<PasswordChangeData>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  })



  const handleSubmit = async (data: UserFormData) => {
    console.log('handleSubmit called with data:', data)
    console.log('Current mode:', mode)
    console.log('User role:', user?.role)
    
    // For admin edits, require password verification
    if (mode === "edit" && user?.role === 'admin') {
      console.log('Admin edit detected, showing password dialog')
      setIsAdminPasswordDialogOpen(true)
      return
    }

    console.log('Proceeding with form submission')
    setIsSubmitting(true)
    try {
      // Only include password if it's provided (for new users or when enabling login access)
      const formData = {
        ...data,
        commissionProfileIds: data.commissionProfileIds || [], // Ensure it's always an array
        ...(data.password ? { password: data.password } : {}),
      }
      console.log('Sending form data to API:', formData)
      await onSubmit(formData)
    } catch (error) {
      console.error("Form submission error:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAdminPasswordVerification = async () => {
    if (!adminPassword.trim()) {
      toast({
        title: "Error",
        description: "Please enter your password to update admin details",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      // Verify admin password using the API
      const result = await UsersAPI.verifyAdminPassword(user._id, adminPassword)

      if (result.success) {
        // If password is correct, proceed with update
        const formData = {
          ...form.getValues(),
          commissionProfileIds: form.getValues().commissionProfileIds || [], // Ensure it's always an array
        }
        await onSubmit(formData)
        
        setIsAdminPasswordDialogOpen(false)
        setAdminPassword("")
      } else {
        toast({
          title: "Error",
          description: "Incorrect password. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Admin password verification error:", error)
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to verify password",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePasswordChange = async (data: PasswordChangeData) => {
    setIsPasswordSubmitting(true)
    try {
      // Call API to change password using the centralized API client
      const result = await UsersAPI.changePassword(user._id, data.newPassword)

      if (result.success) {
        toast({
          title: "Success",
          description: "Password changed successfully",
        })
        setIsPasswordDialogOpen(false)
        passwordForm.reset()
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to change password",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Password change error:", error)
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to change password",
        variant: "destructive",
      })
    } finally {
      setIsPasswordSubmitting(false)
    }
  }

  return (
    <>
      <form onSubmit={form.handleSubmit(handleSubmit, (errors) => {
        console.log('Form validation errors:', errors)
        console.log('Form values:', form.getValues())
        console.log('Form errors:', form.formState.errors)
      })} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="firstName" className="flex items-center gap-1 text-sm font-medium">
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="firstName"
                {...form.register("firstName")}
                placeholder="Enter first name"
                className="mt-2"
              />
              {form.formState.errors.firstName && (
                <p className="text-sm text-red-500 mt-2">
                  {form.formState.errors.firstName.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="mobile" className="flex items-center gap-1 text-sm font-medium">
                Mobile Number <span className="text-red-500">*</span>
              </Label>
              <div className="flex mt-2">
                <div className="flex items-center px-4 bg-gray-50 border border-r-0 rounded-l-md text-sm text-gray-600">
                  +91
                </div>
                <Input
                  id="mobile"
                  {...form.register("mobile")}
                  placeholder="Enter mobile number"
                  className="rounded-l-none"
                />
              </div>
              {form.formState.errors.mobile && (
                <p className="text-sm text-red-500 mt-2">
                  {form.formState.errors.mobile.message}
                </p>
              )}
            </div>

            {/* Commission Profile Selection */}
            <div>
              <div className="flex items-center gap-1">
                <Label className="text-sm font-medium">
                  Commission Profiles
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-medium">Commission Profiles</p>
                        <p className="text-sm">
                          Commission profiles define how staff members earn commissions based on their sales performance. 
                          You can assign multiple profiles to create flexible incentive structures.
                        </p>
                        <ul className="text-xs space-y-1 mt-2">
                          <li>• <strong>Target-based:</strong> Commissions based on sales targets</li>
                          <li>• <strong>Item-based:</strong> Commissions per service/product sold</li>
                          <li>• <strong>Multiple profiles:</strong> Combine different incentive types</li>
                        </ul>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value=""
                onValueChange={(value) => {
                  if (value && value !== "none") {
                    const currentIds = form.watch("commissionProfileIds") || []
                    if (!currentIds.includes(value)) {
                      form.setValue("commissionProfileIds", [...currentIds, value])
                    }
                  }
                }}
                disabled={isLoadingProfiles}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder={isLoadingProfiles ? "Loading profiles..." : "Add commission profile..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>Select a profile to add</SelectItem>
                  {commissionProfiles
                    .filter(profile => !form.watch("commissionProfileIds")?.includes(profile.id))
                    .map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              
              {/* Selected Profiles Display */}
              {(() => {
                const selectedIds = form.watch("commissionProfileIds")
                return selectedIds && selectedIds.length > 0
              })() && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-600 font-medium">Selected Profiles:</p>
                  <div className="space-y-1">
                    {form.watch("commissionProfileIds")?.map((profileId) => {
                      const profile = commissionProfiles.find(p => p.id === profileId)
                      return profile ? (
                        <div key={profileId} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2">
                          <div className="flex-1">
                            <span className="text-sm font-medium">{profile.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const currentIds = form.watch("commissionProfileIds") || []
                              form.setValue("commissionProfileIds", currentIds.filter(id => id !== profileId))
                            }}
                            className="ml-2 text-red-500 hover:text-red-700 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      ) : null
                    })}
                  </div>
                </div>
              )}
              
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <div>
              <Label htmlFor="lastName" className="text-sm font-medium">Last Name</Label>
              <Input
                id="lastName"
                {...form.register("lastName")}
                placeholder="Enter last name"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="email" className="flex items-center gap-1 text-sm font-medium">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                placeholder="Enter email address"
                className="mt-2"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-500 mt-2">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Password field - show for new users with login access OR existing users being given login access for the first time */}
            {((mode === "add" && hasLoginAccess) || isEnablingLoginAccess) && (
              <div>
                <Label htmlFor="password" className="flex items-center gap-1 text-sm font-medium">
                  Password <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  {...form.register("password")}
                  placeholder="Enter password"
                  className="mt-2"
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-red-500 mt-2">
                    {form.formState.errors.password.message}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  {mode === "edit" ? "Set initial password for login access" : "Password required for login access"}
                </p>
              </div>
            )}

            {/* Change Password Link - only show for edit mode and users who already have login access */}
            {mode === "edit" && user?.hasLoginAccess && !isEnablingLoginAccess && (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPasswordDialogOpen(true)}
                  className="flex items-center gap-2 mt-2"
                >
                  <Lock className="h-4 w-4" />
                  Change Password
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Toggle Switches */}
        <div className="space-y-6 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Label htmlFor="hasLoginAccess" className="text-sm font-medium">
                Provide login access to this staff
                {user?.role === 'admin' && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Always Enabled
                  </Badge>
                )}
              </Label>
              <HelpCircle className="h-4 w-4 text-gray-400" />
            </div>
            <Switch
              id="hasLoginAccess"
              checked={user?.role === 'admin' ? true : form.watch("hasLoginAccess")}
              onCheckedChange={(checked) => {
                // Admin login access cannot be disabled
                if (user?.role === 'admin') {
                  form.setValue("hasLoginAccess", true)
                } else {
                  form.setValue("hasLoginAccess", checked)
                }
              }}
              disabled={user?.role === 'admin'}
            />
          </div>
          {/* Help text for password requirement */}
          {mode === "edit" && !user?.hasLoginAccess && hasLoginAccess && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Note:</strong> You'll need to set an initial password for this user to enable login access.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Label htmlFor="allowAppointmentScheduling" className="text-sm font-medium">
                Allow appointment scheduling for this staff
              </Label>
              <HelpCircle className="h-4 w-4 text-gray-400" />
            </div>
            <Switch
              id="allowAppointmentScheduling"
              checked={form.watch("allowAppointmentScheduling")}
              onCheckedChange={(checked) => form.setValue("allowAppointmentScheduling", checked)}
            />
          </div>

        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-6 border-t border-gray-200">
          <Button 
            type="submit" 
            disabled={isSubmitting} 
            className="px-8"
            onClick={() => {
              console.log('Update Staff button clicked')
              console.log('Form state:', form.formState)
              console.log('Form values:', form.getValues())
            }}
          >
            {isSubmitting ? "Saving..." : mode === "add" ? "Add Staff" : "Update Staff"}
          </Button>
        </div>
      </form>

      {/* Password Change Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <form onSubmit={passwordForm.handleSubmit(handlePasswordChange)} className="space-y-4">
            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                {...passwordForm.register("newPassword")}
                placeholder="Enter new password"
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-sm text-red-500 mt-1">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                {...passwordForm.register("confirmPassword")}
                placeholder="Confirm new password"
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-sm text-red-500 mt-1">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsPasswordDialogOpen(false)
                  passwordForm.reset()
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPasswordSubmitting}>
                {isPasswordSubmitting ? "Changing..." : "Change Password"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Admin Password Verification Dialog */}
      <Dialog open={isAdminPasswordDialogOpen} onOpenChange={setIsAdminPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin Password Verification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              To update admin details, please enter your current password for verification.
            </p>
            <div>
              <Label htmlFor="adminPassword">Current Password</Label>
              <Input
                id="adminPassword"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter your current password"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAdminPasswordDialogOpen(false)
                  setAdminPassword("")
                }}
              >
                Cancel
              </Button>
              <Button 
                type="button" 
                onClick={handleAdminPasswordVerification}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Verifying..." : "Verify & Update"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
} 