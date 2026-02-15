"use client"

import { useState, useRef, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Camera, Save, Edit, X, Upload, Download, Trash2, Shield, AlertTriangle } from "lucide-react"
import { useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { StaffAPI, UsersAPI, GDPRAPI } from "@/lib/api"
import { ConsentManagement } from "@/components/gdpr/consent-management"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const profileSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  mobile: z.string().min(10, "Mobile number must be at least 10 digits"),
})

export function ProfilePage() {
  const { user, updateUser, logout } = useAuth()
  const searchParams = useSearchParams()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [staffData, setStaffData] = useState<any>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExportData = async () => {
    if (!user?._id || user?.role !== 'admin') return

    toast({ title: "Export requested", description: "Generating your data export...", duration: 3000 })
    setIsExporting(true)
    try {
      const response = await GDPRAPI.exportUserData(user._id)
      if (response.success && response.data) {
        // Create downloadable JSON file
        const dataStr = JSON.stringify(response.data, null, 2)
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = `my-data-export-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast({
          title: "Data Export Successful",
          description: "Your data has been downloaded successfully.",
        })
      } else {
        throw new Error(response.error || "Failed to export data")
      }
    } catch (error) {
      console.error("Data export error:", error)
      toast({
        title: "Export Failed",
        description: "Failed to export your data. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  // Check URL params for GDPR actions (only for admin)
  useEffect(() => {
    if (user?.role !== 'admin') return
    
    const action = searchParams.get('action')
    if (action === 'export-data') {
      handleExportData()
    } else if (action === 'delete-account') {
      setShowDeleteDialog(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.role])

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      mobile: "",
    },
  })

  // Fetch user/staff data from database
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?._id) return
      
      try {
        setIsLoading(true)
        let response
        
        // Admin users are in User collection, staff/manager are in Staff collection
        if (user.role === 'admin') {
          response = await UsersAPI.getById(user._id)
        } else {
          response = await StaffAPI.getById(user._id)
        }
        
        if (response.success && response.data) {
          const userData = response.data
          setStaffData(userData)
          
          // Update form with fetched data
          // User model uses: firstName, lastName, email, mobile
          // Staff model uses: name, email, phone
          if (user.role === 'admin') {
            form.reset({
              firstName: userData.firstName || "",
              lastName: userData.lastName || "",
              email: userData.email || "",
              mobile: userData.mobile || userData.phone || "",
            })
          } else {
            // Staff model
            const nameParts = (userData.name || "").split(" ")
          form.reset({
            firstName: nameParts[0] || "",
            lastName: nameParts.slice(1).join(" ") || "",
              email: userData.email || "",
              mobile: userData.phone || "",
          })
          }
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error)
        toast({
          title: "Error",
          description: "Failed to load profile data",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserData()
  }, [user?._id, user?.role, form])

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file",
          variant: "destructive",
        })
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB",
          variant: "destructive",
        })
        return
      }

      // Create preview URL
      const reader = new FileReader()
      reader.onload = (e) => {
        setProfilePhoto(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleEditToggle = () => {
    setIsEditMode(!isEditMode)
    if (isEditMode) {
      // Cancel edit - reset form to original values
      if (staffData) {
        if (user?.role === 'admin') {
          // User model
          form.reset({
            firstName: staffData.firstName || "",
            lastName: staffData.lastName || "",
            email: staffData.email || "",
            mobile: staffData.mobile || staffData.phone || "",
          })
        } else {
          // Staff model
        const nameParts = (staffData.name || "").split(" ")
        form.reset({
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || "",
          email: staffData.email || "",
          mobile: staffData.phone || "",
        })
        }
        setProfilePhoto(null)
      }
    }
  }

  async function onSubmit(values: z.infer<typeof profileSchema>) {
    if (!user?._id || !staffData) return

    setIsSubmitting(true)

    try {
      let response
      
      // Admin users use User model, staff/manager use Staff model
      if (user.role === 'admin') {
        // User model uses: firstName, lastName, email, mobile
        const updateData = {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          mobile: values.mobile,
        }
        response = await UsersAPI.update(user._id, updateData)
        
        if (response.success) {
          setStaffData({ 
            ...staffData, 
            firstName: updateData.firstName,
            lastName: updateData.lastName,
            email: updateData.email,
            mobile: updateData.mobile
          })
        }
      } else {
        // Staff model uses: name, email, phone
      const updateData = {
        name: `${values.firstName} ${values.lastName}`.trim(),
        email: values.email,
        phone: values.mobile,
      }
        response = await StaffAPI.update(user._id, updateData)
      
      if (response.success) {
        setStaffData({ 
          ...staffData, 
          name: updateData.name,
          email: updateData.email,
          phone: updateData.phone
        })
        }
      }
        
      if (response.success) {
        // Update auth context to sync with dropdown menu
        updateUser({
          name: `${values.firstName} ${values.lastName}`,
          email: values.email
        })
        
        setIsEditMode(false)
        
        toast({
          title: "Profile updated",
          description: "Your profile has been successfully updated.",
        })
      } else {
        throw new Error(response.error || "Failed to update profile")
      }
    } catch (error) {
      console.error("Profile update error:", error)
      toast({
        title: "Update failed",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!user?._id || user?.role !== 'admin') return

    setIsDeleting(true)
    try {
      const response = await GDPRAPI.deleteUserData(user._id)
      if (response.success) {
        toast({
          title: "Account Deletion Requested",
          description: "Your account and data will be permanently deleted within 30 days.",
        })
        
        // Logout user after deletion request
        setTimeout(() => {
          logout()
          window.location.href = '/login'
        }, 2000)
      } else {
        throw new Error(response.error || "Failed to delete account")
      }
    } catch (error) {
      console.error("Account deletion error:", error)
      toast({
        title: "Deletion Failed",
        description: "Failed to delete your account. Please contact support.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "destructive"
      case "manager":
        return "default"
      default:
        return "secondary"
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col space-y-6 max-w-2xl">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
                <p className="text-muted-foreground">Manage your account settings and preferences</p>
              </div>
              <Button
                onClick={handleEditToggle}
                variant={isEditMode ? "outline" : "default"}
                className="flex items-center gap-2"
              >
                {isEditMode ? (
                  <>
                    <X className="h-4 w-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Edit className="h-4 w-4" />
                    Edit Profile
                  </>
                )}
              </Button>
            </div>

            {/* Profile Header */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Avatar className="h-20 w-20">
                      <AvatarImage 
                        src={profilePhoto || "/placeholder.svg"} 
                        alt={staffData?.name || staffData?.firstName || user?.name || "User"} 
                      />
                      <AvatarFallback className="text-lg">
                        {(staffData?.firstName || staffData?.name || user?.name || "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {isEditMode && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-white shadow-md"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Camera className="h-4 w-4" />
                      </Button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-semibold">
                      {staffData?.firstName && staffData?.lastName 
                        ? `${staffData.firstName} ${staffData.lastName}`
                        : staffData?.name || user?.name || "User"}
                    </h2>
                    <p className="text-muted-foreground">{staffData?.email || user?.email}</p>
                    <Badge variant={getRoleBadgeVariant(staffData?.role || user?.role || "staff")}>
                      {(staffData?.role || user?.role || "staff").charAt(0).toUpperCase() + (staffData?.role || user?.role || "staff").slice(1)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Profile Form */}
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Update your personal details and account settings</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter your first name" 
                                {...field} 
                                disabled={!isEditMode}
                                className={!isEditMode ? "bg-gray-50" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter your last name" 
                                {...field} 
                                disabled={!isEditMode}
                                className={!isEditMode ? "bg-gray-50" : ""}
                              />
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
                            <FormLabel>Email Address</FormLabel>
                            <FormControl>
                              <Input 
                                type="email" 
                                placeholder="Enter your email" 
                                {...field} 
                                disabled={!isEditMode}
                                className={!isEditMode ? "bg-gray-50" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mobile"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mobile Number</FormLabel>
                            <FormControl>
                              <Input 
                                type="tel" 
                                placeholder="Enter your mobile number" 
                                {...field} 
                                disabled={!isEditMode}
                                className={!isEditMode ? "bg-gray-50" : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {isEditMode && (
                      <div className="flex justify-end gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleEditToggle}
                          disabled={isSubmitting}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                          <Save className="mr-2 h-4 w-4" />
                          {isSubmitting ? "Saving..." : "Save Changes"}
                        </Button>
                      </div>
                    )}
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* GDPR Data Rights Section - Only for Admin */}
            {user?.role === 'admin' && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  Your Data Rights (GDPR)
                </CardTitle>
                <CardDescription>
                  Manage your personal data in accordance with GDPR regulations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Your Privacy Rights</AlertTitle>
                  <AlertDescription>
                    Under GDPR, you have the right to access, export, and delete your personal data. 
                    Learn more in our <a href="/privacy-policy" className="text-blue-600 hover:underline font-medium">Privacy Policy</a>.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Data Export */}
                  <div className="p-4 border rounded-lg bg-white">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          <Download className="h-4 w-4 text-blue-600" />
                          Export My Data
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Download all your personal data in JSON format (Right to Data Portability)
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleExportData}
                      disabled={isExporting}
                      variant="outline"
                      className="w-full"
                    >
                      {isExporting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Export Data
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Account Deletion */}
                  <div className="p-4 border rounded-lg bg-white">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          <Trash2 className="h-4 w-4 text-red-600" />
                          Delete My Account
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Permanently delete your account and all associated data (Right to Erasure)
                        </p>
                      </div>
                    </div>
                    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full border-red-300 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Account
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                            Delete Account Permanently?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-2">
                            <p>
                              This action cannot be undone. This will permanently delete your account and remove all 
                              your data from our servers.
                            </p>
                            <p className="font-semibold text-red-600">
                              All of the following will be deleted:
                            </p>
                            <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                              <li>Your profile and personal information</li>
                              <li>All associated client data (if you're the owner)</li>
                              <li>Sales and transaction history</li>
                              <li>Appointments and schedules</li>
                              <li>All other account-related data</li>
                            </ul>
                            <p className="text-sm text-gray-600 mt-3">
                              Data deletion will be completed within 30 days as per GDPR requirements.
                            </p>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeleteAccount}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {isDeleting ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                Deleting...
                              </>
                            ) : (
                              "Yes, Delete My Account"
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-xs text-gray-500">
                    Need help? Contact our Data Protection Officer at{" "}
                    <a href="mailto:privacy@easemysalon.in" className="text-blue-600 hover:underline">
                      privacy@easemysalon.in
                    </a>
                  </p>
                </div>
              </CardContent>
            </Card>
            )}

            {/* Consent Management Section - Only for Admin */}
            {user?.role === 'admin' && (
            <ConsentManagement />
            )}
          </div>
  )
}
