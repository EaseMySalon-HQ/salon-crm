"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, Building2, User, Loader2, Phone, MapPin, CreditCard } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"

// Create schema factory function
const createBusinessSchema = (isEditMode: boolean) => z.object({
  // Business Information
  businessName: isEditMode ? z.string().optional() : z.string().min(2, "Business name must be at least 2 characters"),
  businessType: isEditMode ? z.enum(["salon", "spa", "barbershop", "beauty_clinic"]).optional() : z.enum(["salon", "spa", "barbershop", "beauty_clinic"]),
  street: isEditMode ? z.string().optional() : z.string().min(5, "Street address is required"),
  city: isEditMode ? z.string().optional() : z.string().min(2, "City is required"),
  state: isEditMode ? z.string().optional() : z.string().min(2, "State is required"),
  zipCode: isEditMode ? z.string().optional() : z.string().min(5, "ZIP code is required"),
  country: z.string().default("India"),
  phone: isEditMode ? z.string().optional() : z.string().min(10, "Phone number is required"),
  email: isEditMode ? z.string().email("Valid email is required").optional() : z.string().email("Valid email is required"),
  website: z.string().optional(),
  
  // Owner Information
  ownerFirstName: isEditMode ? z.string().optional() : z.string().min(2, "First name is required"),
  ownerLastName: isEditMode ? z.string().optional() : z.string().min(2, "Last name is required"),
  ownerEmail: isEditMode ? z.string().email("Valid email is required").optional() : z.string().email("Valid email is required"),
  ownerPhone: isEditMode ? z.string().optional() : z.string().min(10, "Phone number is required"),
  ownerPassword: isEditMode ? z.string().optional() : z.string().min(6, "Password must be at least 6 characters"),
  
  // Plan Information
  planId: isEditMode ? z.string().optional() : z.string().min(1, "Plan selection is required"),
  billingPeriod: z.enum(["monthly", "yearly"]).default("monthly"),
})

type BusinessFormData = z.infer<ReturnType<typeof createBusinessSchema>>

interface BusinessFormProps {
  mode?: 'create' | 'edit'
  businessId?: string
}

export function CreateBusinessForm({ mode = 'create', businessId }: BusinessFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [plans, setPlans] = useState<any[]>([])
  const { toast } = useToast()
  const router = useRouter()
  const params = useParams()
  
  // Get business ID from params if not provided as prop
  const currentBusinessId = businessId || params?.id as string
  const isEditMode = mode === 'edit' || !!currentBusinessId
  
  // Define API_URL at component level
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

  const form = useForm<BusinessFormData>({
    resolver: zodResolver(createBusinessSchema(isEditMode)) as any,
    defaultValues: {
      businessName: "",
      businessType: "salon",
      street: "",
      city: "",
      state: "",
      zipCode: "",
      country: "India",
      phone: "",
      email: "",
      website: "",
      ownerFirstName: "",
      ownerLastName: "",
      ownerEmail: "",
      ownerPhone: "",
      ownerPassword: "",
      planId: "starter",
      billingPeriod: "monthly",
    },
  })

  // Load plans and business data
  useEffect(() => {
    fetchPlans()
    if (isEditMode && currentBusinessId) {
      loadBusinessData()
    }
  }, [isEditMode, currentBusinessId])

  const fetchPlans = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/plans/config`, {
        headers: adminRequestHeaders(),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setPlans(data.data.plans)
        }
      }
    } catch (error) {
      console.error('Error fetching plans:', error)
    }
  }

  const loadBusinessData = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${API_URL}/admin/businesses/${currentBusinessId}`, {
        headers: adminRequestHeaders({
          'Content-Type': 'application/json'
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const business = data.data
          
          // Map the business data to form format
          form.reset({
            businessName: business.name,
            businessType: business.businessType,
            street: business.address.street,
            city: business.address.city,
            state: business.address.state,
            zipCode: business.address.zipCode,
            country: business.address.country,
            phone: business.contact.phone,
            email: business.contact.email,
            website: business.contact.website || '',
            ownerFirstName: business.owner.name.split(' ')[0] || '',
            ownerLastName: business.owner.name.split(' ').slice(1).join(' ') || '',
            ownerEmail: business.owner.email,
            ownerPhone: business.owner.phone,
            ownerPassword: '', // Don't pre-fill password for security
          })
        }
      }
    } catch (error) {
      console.error('Error loading business data:', error)
      toast({
        title: "Error",
        description: "Failed to load business data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmit = async (data: BusinessFormData) => {
    setIsSubmitting(true)
    
    try {
      // Filter out empty/undefined values for edit mode
      const filterEmptyValues = (obj: any) => {
        const filtered: any = {}
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined && value !== null && value !== '') {
            if (typeof value === 'object' && !Array.isArray(value)) {
              const nested = filterEmptyValues(value)
              if (Object.keys(nested).length > 0) {
                filtered[key] = nested
              }
            } else {
              filtered[key] = value
            }
          }
        }
        return filtered
      }

      const businessData = {
        businessInfo: {
          name: data.businessName || '',
          businessType: data.businessType || 'salon',
          address: {
            street: data.street || 'Not provided',
            city: data.city || '',
            state: data.state || '',
            zipCode: data.zipCode || '',
            country: data.country || 'India'
          },
          contact: {
            phone: data.phone || '',
            email: data.email || '',
            website: data.website || ''
          },
          settings: {
            operatingHours: {
              monday: { open: "09:00", close: "18:00", closed: false },
              tuesday: { open: "09:00", close: "18:00", closed: false },
              wednesday: { open: "09:00", close: "18:00", closed: false },
              thursday: { open: "09:00", close: "18:00", closed: false },
              friday: { open: "09:00", close: "18:00", closed: false },
              saturday: { open: "09:00", close: "18:00", closed: false },
              sunday: { open: "09:00", close: "18:00", closed: true }
            }
          }
        },
        ownerInfo: {
          firstName: data.ownerFirstName || '',
          lastName: data.ownerLastName || '',
          email: data.ownerEmail || '',
          phone: data.ownerPhone || '',
          password: data.ownerPassword || ''
        },
        plan: {
          planId: data.planId || 'starter',
          billingPeriod: data.billingPeriod || 'monthly',
          renewalDate: null,
          isTrial: false,
          trialEndsAt: null,
          overrides: {
            features: [],
            expiresAt: null,
            notes: '',
          },
          addons: {
            whatsapp: { enabled: false, quota: 0, used: 0, lastResetAt: null },
            sms: { enabled: false, quota: 0, used: 0, lastResetAt: null },
          },
        },
      }


      // Filter out empty nested objects for edit mode
      const filteredBusinessData = isEditMode ? filterEmptyValues(businessData) : businessData

      let response
      if (isEditMode) {
        // Update existing business
        response = await fetch(`${API_URL}/admin/businesses/${currentBusinessId}`, {
          method: 'PUT',
          headers: adminRequestHeaders({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(filteredBusinessData)
        })
      } else {
        // Create new business
        response = await fetch(`${API_URL}/admin/businesses`, {
          method: 'POST',
          headers: adminRequestHeaders({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(businessData)
        })
      }

      const result = await response.json()

      if (result.success) {
        toast({
          title: isEditMode ? "Business Updated Successfully" : "Business Created Successfully",
          description: isEditMode 
            ? `Business "${data.businessName}" has been updated successfully.`
            : `Business "${data.businessName}" has been created with owner access.`,
        })
        router.push('/admin/businesses')
      } else {
        toast({
          title: isEditMode ? "Update Failed" : "Creation Failed",
          description: result.error || `Failed to ${isEditMode ? 'update' : 'create'} business`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error(`${isEditMode ? 'Update' : 'Create'} business error:`, error)
      toast({
        title: isEditMode ? "Update Failed" : "Creation Failed",
        description: `An error occurred while ${isEditMode ? 'updating' : 'creating'} the business`,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }


  // Helper function to get label with optional asterisk
  const getLabel = (text: string, required: boolean = true) => {
    return isEditMode ? text : `${text}${required ? ' *' : ''}`
  }

  // Show loading state when loading business data for edit
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading business data...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      {/* Header Section with Gradient */}
      <div className="mb-8 animate-in fade-in" style={{ animationDelay: '200ms' }}>
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl p-8 text-white shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:scale-[1.01]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="text-white hover:bg-white/20 backdrop-blur-sm"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-100">
                  {isEditMode ? 'Edit Business' : 'Create New Business'}
                </h1>
                <p className="text-indigo-100 text-lg">
                  {isEditMode ? 'Update business information and settings' : 'Set up a new salon business account'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Sections */}
      <div className="max-w-6xl mx-auto">
        <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-8">

          {/* Business Information Section */}
          <div className="space-y-8 animate-in slide-in-from-bottom-2" style={{ animationDelay: '400ms' }}>
              
              <Card className="transform hover:scale-[1.01] transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg border-b border-blue-100">
                  <CardTitle className="flex items-center gap-2 text-blue-800">
                    <Building2 className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                  <CardDescription className="text-blue-600">
                    Enter the basic information about the salon business
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="businessName" className="text-sm font-medium text-gray-700">{getLabel("Business Name")}</Label>
                      <Input
                        id="businessName"
                        placeholder="e.g., Glamour Salon & Spa"
                        {...form.register("businessName")}
                        className="mt-1"
                      />
                      {form.formState.errors.businessName && (
                        <p className="text-sm text-red-600">
                          {form.formState.errors.businessName.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="businessType" className="text-sm font-medium text-gray-700">{getLabel("Business Type")}</Label>
                      <Select onValueChange={(value) => form.setValue("businessType", value as any)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select business type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="salon">Salon</SelectItem>
                          <SelectItem value="spa">Spa</SelectItem>
                          <SelectItem value="barbershop">Barbershop</SelectItem>
                          <SelectItem value="beauty_clinic">Beauty Clinic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-purple-600" />
                      <h4 className="text-lg font-semibold text-gray-800">Address</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2 space-y-2">
                        <Label htmlFor="street" className="text-sm font-medium text-gray-700">{getLabel("Street Address")}</Label>
                        <Input
                          id="street"
                          placeholder="123 Beauty Street"
                          {...form.register("street")}
                          className="mt-1"
                        />
                        {form.formState.errors.street && (
                          <p className="text-sm text-red-600">
                            {form.formState.errors.street.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="city" className="text-sm font-medium text-gray-700">{getLabel("City")}</Label>
                        <Input
                          id="city"
                          placeholder="Mumbai"
                          {...form.register("city")}
                          className="mt-1"
                        />
                        {form.formState.errors.city && (
                          <p className="text-sm text-red-600">
                            {form.formState.errors.city.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="state" className="text-sm font-medium text-gray-700">{getLabel("State")}</Label>
                        <Input
                          id="state"
                          placeholder="Maharashtra"
                          {...form.register("state")}
                          className="mt-1"
                        />
                        {form.formState.errors.state && (
                          <p className="text-sm text-red-600">
                            {form.formState.errors.state.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="zipCode" className="text-sm font-medium text-gray-700">{getLabel("ZIP Code")}</Label>
                        <Input
                          id="zipCode"
                          placeholder="400001"
                          {...form.register("zipCode")}
                          className="mt-1"
                        />
                        {form.formState.errors.zipCode && (
                          <p className="text-sm text-red-600">
                            {form.formState.errors.zipCode.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="country" className="text-sm font-medium text-gray-700">Country</Label>
                        <Input
                          id="country"
                          value="India"
                          disabled
                          {...form.register("country")}
                          className="mt-1"
                        />
                      </div>
                  </div>
                </div>

                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-green-600" />
                      <h4 className="text-lg font-semibold text-gray-800">Contact Information</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-sm font-medium text-gray-700">{getLabel("Phone Number")}</Label>
                        <Input
                          id="phone"
                          placeholder="+91 98765 43210"
                          {...form.register("phone")}
                          className="mt-1"
                        />
                        {form.formState.errors.phone && (
                          <p className="text-sm text-red-600">
                            {form.formState.errors.phone.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-medium text-gray-700">{getLabel("Business Email")}</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="info@glamoursalon.com"
                          {...form.register("email")}
                          className="mt-1"
                        />
                        {form.formState.errors.email && (
                          <p className="text-sm text-red-600">
                            {form.formState.errors.email.message}
                          </p>
                        )}
                      </div>

                      <div className="md:col-span-2 space-y-2">
                        <Label htmlFor="website" className="text-sm font-medium text-gray-700">Website (Optional)</Label>
                        <Input
                          id="website"
                          placeholder="https://www.glamoursalon.com"
                          {...form.register("website")}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>

              </CardContent>
            </Card>
          </div>

          {/* Plan Selection Section */}
          {!isEditMode && (
            <div className="space-y-8 animate-in slide-in-from-bottom-2" style={{ animationDelay: '500ms' }}>
              <Card className="transform hover:scale-[1.01] transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-t-lg border-b border-purple-100">
                  <CardTitle className="flex items-center gap-2 text-purple-800">
                    <CreditCard className="h-5 w-5" />
                    Pricing Plan
                  </CardTitle>
                  <CardDescription className="text-purple-600">
                    Select a pricing plan for this business
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="planId" className="text-sm font-medium text-gray-700">{getLabel("Plan")}</Label>
                      <Select 
                        value={form.watch("planId")} 
                        onValueChange={(value) => form.setValue("planId", value)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select a plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {plans.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} {plan.monthlyPrice && `- ₹${plan.monthlyPrice.toLocaleString()}/mo`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.planId && (
                        <p className="text-sm text-red-600">
                          {form.formState.errors.planId.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="billingPeriod" className="text-sm font-medium text-gray-700">{getLabel("Billing Period")}</Label>
                      <Select 
                        value={form.watch("billingPeriod")} 
                        onValueChange={(value) => form.setValue("billingPeriod", value as "monthly" | "yearly")}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="yearly">Yearly (Save 20%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {form.watch("planId") && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      {(() => {
                        const selectedPlan = plans.find(p => p.id === form.watch("planId"))
                        if (!selectedPlan) return null
                        return (
                          <div>
                            <div className="font-semibold text-sm text-gray-700 mb-2">
                              {selectedPlan.name} - {selectedPlan.description}
                            </div>
                            <div className="text-xs text-gray-600">
                              Includes {selectedPlan.features.length} features • {selectedPlan.limits.locations === Infinity ? 'Unlimited' : selectedPlan.limits.locations} location(s)
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Owner Information Section */}
          <div className="space-y-8 animate-in slide-in-from-bottom-2" style={{ animationDelay: '600ms' }}>
              
              <Card className="transform hover:scale-[1.01] transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-lg border-b border-green-100">
                  <CardTitle className="flex items-center gap-2 text-green-800">
                    <User className="h-5 w-5" />
                    Owner Account Details
                  </CardTitle>
                  <CardDescription className="text-green-600">
                    Set up the business owner account details
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="ownerFirstName" className="text-sm font-medium text-gray-700">{getLabel("First Name")}</Label>
                      <Input
                        id="ownerFirstName"
                        placeholder="John"
                        {...form.register("ownerFirstName")}
                        className="mt-1"
                      />
                      {form.formState.errors.ownerFirstName && (
                        <p className="text-sm text-red-600">
                          {form.formState.errors.ownerFirstName.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ownerLastName" className="text-sm font-medium text-gray-700">{getLabel("Last Name")}</Label>
                      <Input
                        id="ownerLastName"
                        placeholder="Doe"
                        {...form.register("ownerLastName")}
                        className="mt-1"
                      />
                      {form.formState.errors.ownerLastName && (
                        <p className="text-sm text-red-600">
                          {form.formState.errors.ownerLastName.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ownerEmail" className="text-sm font-medium text-gray-700">{getLabel("Email Address")}</Label>
                      <Input
                        id="ownerEmail"
                        type="email"
                        placeholder="john@glamoursalon.com"
                        {...form.register("ownerEmail")}
                        className="mt-1"
                      />
                      {form.formState.errors.ownerEmail && (
                        <p className="text-sm text-red-600">
                          {form.formState.errors.ownerEmail.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ownerPhone" className="text-sm font-medium text-gray-700">{getLabel("Phone Number")}</Label>
                      <Input
                        id="ownerPhone"
                        placeholder="+91 98765 43210"
                        {...form.register("ownerPhone")}
                        className="mt-1"
                      />
                      {form.formState.errors.ownerPhone && (
                        <p className="text-sm text-red-600">
                          {form.formState.errors.ownerPhone.message}
                        </p>
                      )}
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="ownerPassword" className="text-sm font-medium text-gray-700">
                        {isEditMode ? 'New Password (Optional)' : 'Password *'}
                      </Label>
                      <Input
                        id="ownerPassword"
                        type="password"
                        placeholder={isEditMode ? "Leave blank to keep current password" : "Enter a strong password"}
                        {...form.register("ownerPassword")}
                        className="mt-1"
                      />
                      {form.formState.errors.ownerPassword && (
                        <p className="text-sm text-red-600">
                          {form.formState.errors.ownerPassword.message}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        {isEditMode 
                          ? "Only enter a new password if you want to change it. Leave blank to keep the current password."
                          : "This will be the login password for the business owner"
                        }
                      </p>
                    </div>
                  </div>
              </CardContent>
            </Card>
          </div>


          <div className="flex justify-end space-x-4 pt-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
              className="px-8 py-2"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 transform hover:scale-105 transition-all duration-300 px-8 py-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditMode ? 'Updating Business...' : 'Creating Business...'}
                </>
              ) : (
                isEditMode ? 'Update Business' : 'Create Business'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
