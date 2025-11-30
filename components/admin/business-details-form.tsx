"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Building2, User, CreditCard, Loader2, Phone, MapPin, TrendingUp, Settings, Edit, Users, Shield, Clock, Calendar, DollarSign, Calculator, Bell, Palette } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { getAdminAuthToken } from "@/lib/admin-auth-storage"

interface BusinessDetails {
  _id: string
  name: string
  code: string
  businessType: string
  status: string
  address: {
    street: string
    city: string
    state: string
    zipCode: string
    country: string
  }
  contact: {
    phone: string
    email: string
    website?: string
  }
  owner: {
    _id: string
    name: string
    email: string
    phone: string
  }
  settings?: {
    timezone: string
    currency: string
    taxRate: number
    gstNumber?: string
  }
  createdAt: string
  updatedAt: string
  isOnboarded: boolean
  onboardingStep: number
  deletedAt?: string
  deletedBy?: {
    _id: string
    name: string
    email: string
  } | null
}

export function BusinessDetailsForm() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [business, setBusiness] = useState<BusinessDetails | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Define API_URL at component level
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

  const authHeaders = (extra: HeadersInit = {}) => {
    const token = getAdminAuthToken()
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    }
  }

  useEffect(() => {
    if (params.id) {
      fetchBusinessDetails()
    }
  }, [params.id])

  const fetchBusinessDetails = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/businesses/${params.id}`, {
        headers: authHeaders({
          'Content-Type': 'application/json'
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setBusiness(data.data)
        }
      }
    } catch (error) {
      console.error('Error fetching business details:', error)
      toast({
        title: "Error",
        description: "Failed to fetch business details",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    router.push(`/admin/businesses/${params.id}/edit`)
  }


  const handleSuspend = async () => {
    if (!business) return
    
    // Only handle active <-> suspended transitions
    // Inactive businesses are handled automatically by login
    const newStatus = business.status === 'active' ? 'suspended' : 'active'
    
    try {
      const response = await fetch(`${API_URL}/admin/businesses/${params.id}/status`, {
        method: 'PATCH',
        headers: authHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setBusiness({ ...business, status: newStatus })
          toast({
            title: "Success",
            description: `Business ${newStatus} successfully`,
          })
        }
      }
    } catch (error) {
      console.error('Error updating business status:', error)
      toast({
        title: "Error",
        description: "Failed to update business status",
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading business details...</p>
        </div>
      </div>
    )
  }

  if (!business) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Building2 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Business Not Found</h2>
          <p className="text-gray-600 mb-6">The business you're looking for doesn't exist.</p>
          <Button onClick={() => router.push('/admin/businesses')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Businesses
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      {/* Header Section */}
      <div className="mb-8">
        <div className="bg-white rounded-2xl p-8 border-2 border-gray-200 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/admin/businesses')}
                className="text-gray-600 hover:bg-gray-100"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-gray-900">
                  Business Details
                </h1>
                <p className="text-gray-600 text-lg">Business Code: {business.code}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={business.status === 'active' ? 'default' : 'destructive'} className="text-sm px-3 py-1">
                {business.status}
              </Badge>
              <Button onClick={handleEdit} variant="secondary" className="bg-gray-100 hover:bg-gray-200 border-gray-300">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              {business.status === 'inactive' ? (
                <Button disabled variant="secondary" className="opacity-50 cursor-not-allowed">
                  <Calendar className="h-4 w-4 mr-2" />
                  Inactive (Auto-reactivates on login)
                </Button>
              ) : (
                <Button 
                  onClick={handleSuspend} 
                  variant={business.status === 'active' ? 'destructive' : 'default'} 
                  className="transform hover:scale-105 transition-all duration-300"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  {business.status === 'active' ? 'Suspend' : 'Activate'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Business Form in Read-Only Mode */}
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Business Information */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg border-b border-blue-100">
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Building2 className="h-5 w-5" />
              Business Information
            </CardTitle>
            <CardDescription>
              Basic business details and contact information
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Business Name</Label>
                <Input
                  value={business.name}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Business Type</Label>
                <Input
                  value={business.businessType.charAt(0).toUpperCase() + business.businessType.slice(1).replace('_', ' ')}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-blue-600" />
                Address Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Street Address</Label>
                  <Input
                    value={business.address.street}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">City</Label>
                  <Input
                    value={business.address.city}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">State</Label>
                  <Input
                    value={business.address.state}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">ZIP Code</Label>
                  <Input
                    value={business.address.zipCode}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Country</Label>
                  <Input
                    value={business.address.country}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Phone className="h-5 w-5 text-green-600" />
                Contact Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Phone Number</Label>
                  <Input
                    value={business.contact.phone}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Email Address</Label>
                  <Input
                    value={business.contact.email}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Website</Label>
                  <Input
                    value={business.contact.website || 'Not provided'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Owner Information */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-lg border-b border-green-100">
            <CardTitle className="flex items-center gap-2 text-green-800">
              <User className="h-5 w-5" />
              Owner Information
            </CardTitle>
            <CardDescription>
              Business owner details and contact information
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Owner Name</Label>
                <Input
                  value={business.owner.name}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Owner Email</Label>
                <Input
                  value={business.owner.email}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Owner Phone</Label>
                <Input
                  value={business.owner.phone}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>
            </div>
          </CardContent>
        </Card>


        {/* Business Settings */}
        {business.settings && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-t-lg border-b border-orange-100">
              <CardTitle className="flex items-center gap-2 text-orange-800">
                <Settings className="h-5 w-5" />
                Business Settings
              </CardTitle>
              <CardDescription>
                Configuration and operational settings
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Timezone</Label>
                  <Input
                    value={business.settings.timezone}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Currency</Label>
                  <Input
                    value={business.settings.currency}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Tax Rate (%)</Label>
                  <Input
                    value={business.settings.taxRate?.toString() || 'Not set'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">GST Number</Label>
                  <Input
                    value={business.settings.gstNumber || 'Not provided'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* General Settings */}
        {business.settings && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-t-lg border-b border-blue-100">
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <Settings className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Basic application preferences and configurations
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Date Format</Label>
                  <Input
                    value={business.settings.dateFormat || 'DD/MM/YYYY'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Time Format</Label>
                  <Input
                    value={business.settings.timeFormat === '12' ? '12 Hour' : '24 Hour'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Business License</Label>
                  <Input
                    value={business.settings.businessLicense || 'Not provided'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Operating Hours */}
        {business.settings?.operatingHours && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-lg border-b border-green-100">
              <CardTitle className="flex items-center gap-2 text-green-800">
                <Clock className="h-5 w-5" />
                Operating Hours
              </CardTitle>
              <CardDescription>
                Business operating hours for each day of the week
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(business.settings.operatingHours).map(([day, hours]) => (
                  <div key={day} className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700 capitalize">
                      {day}
                    </Label>
                    <div className="flex items-center gap-2">
                      {hours.closed ? (
                        <Input
                          value="Closed"
                          readOnly
                          className="bg-red-50 cursor-not-allowed text-red-600"
                        />
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            value={hours.open || 'Not set'}
                            readOnly
                            className="bg-gray-50 cursor-not-allowed"
                            placeholder="Open time"
                          />
                          <span className="flex items-center text-gray-500">to</span>
                          <Input
                            value={hours.close || 'Not set'}
                            readOnly
                            className="bg-gray-50 cursor-not-allowed"
                            placeholder="Close time"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Appointment Settings */}
        {business.settings?.appointmentSettings && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-t-lg border-b border-purple-100">
              <CardTitle className="flex items-center gap-2 text-purple-800">
                <Calendar className="h-5 w-5" />
                Appointment Settings
              </CardTitle>
              <CardDescription>
                Booking rules, time slots, and appointment preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Slot Duration (minutes)</Label>
                  <Input
                    value={business.settings.appointmentSettings.slotDuration?.toString() || '30'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Advance Booking Days</Label>
                  <Input
                    value={business.settings.appointmentSettings.advanceBookingDays?.toString() || '30'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Buffer Time (minutes)</Label>
                  <Input
                    value={business.settings.appointmentSettings.bufferTime?.toString() || '15'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Allow Online Booking</Label>
                  <Input
                    value={business.settings.appointmentSettings.allowOnlineBooking ? 'Yes' : 'No'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Currency Settings */}
        {business.settings && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-t-lg border-b border-yellow-100">
              <CardTitle className="flex items-center gap-2 text-yellow-800">
                <DollarSign className="h-5 w-5" />
                Currency Settings
              </CardTitle>
              <CardDescription>
                Default currency, symbols, and formatting options
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Currency Code</Label>
                  <Input
                    value={business.settings.currency || 'INR'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Currency Symbol</Label>
                  <Input
                    value={business.settings.currencySymbol || '₹'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tax Settings */}
        {business.settings && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-red-50 to-rose-50 rounded-t-lg border-b border-red-100">
              <CardTitle className="flex items-center gap-2 text-red-800">
                <Calculator className="h-5 w-5" />
                Tax Settings
              </CardTitle>
              <CardDescription>
                Tax rates, GST configuration, and calculation methods
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Tax Rate (%)</Label>
                  <Input
                    value={business.settings.taxRate?.toString() || '18'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">GST Number</Label>
                  <Input
                    value={business.settings.gstNumber || 'Not provided'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notification Settings */}
        {business.settings?.notifications && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-t-lg border-b border-indigo-100">
              <CardTitle className="flex items-center gap-2 text-indigo-800">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Email alerts, SMS notifications, and reminder settings
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Email Notifications</Label>
                  <Input
                    value={business.settings.notifications.emailNotifications ? 'Enabled' : 'Disabled'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">SMS Notifications</Label>
                  <Input
                    value={business.settings.notifications.smsNotifications ? 'Enabled' : 'Disabled'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Appointment Reminders</Label>
                  <Input
                    value={business.settings.notifications.appointmentReminders ? 'Enabled' : 'Disabled'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Payment Confirmations</Label>
                  <Input
                    value={business.settings.notifications.paymentConfirmations ? 'Enabled' : 'Disabled'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Branding Settings */}
        {business.settings?.branding && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-t-lg border-b border-pink-100">
              <CardTitle className="flex items-center gap-2 text-pink-800">
                <Palette className="h-5 w-5" />
                Branding Settings
              </CardTitle>
              <CardDescription>
                Logo, colors, and visual identity settings
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Primary Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={business.settings.branding.primaryColor || '#3B82F6'}
                      readOnly
                      className="bg-gray-50 cursor-not-allowed"
                    />
                    <div 
                      className="w-8 h-8 rounded border"
                      style={{ backgroundColor: business.settings.branding.primaryColor || '#3B82F6' }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Secondary Color</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={business.settings.branding.secondaryColor || '#1E40AF'}
                      readOnly
                      className="bg-gray-50 cursor-not-allowed"
                    />
                    <div 
                      className="w-8 h-8 rounded border"
                      style={{ backgroundColor: business.settings.branding.secondaryColor || '#1E40AF' }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Font Family</Label>
                  <Input
                    value={business.settings.branding.fontFamily || 'Inter'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Logo</Label>
                  <Input
                    value={business.settings.branding.logo ? 'Uploaded' : 'Not uploaded'}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payment Settings */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-t-lg border-b border-emerald-100">
            <CardTitle className="flex items-center gap-2 text-emerald-800">
              <CreditCard className="h-5 w-5" />
              Payment Settings
            </CardTitle>
            <CardDescription>
              Payment methods and processing configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Cash Payments</Label>
                <Input
                  value="Enabled"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Card Payments</Label>
                <Input
                  value="Enabled"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">UPI Payments</Label>
                <Input
                  value="Enabled"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Digital Wallet</Label>
                <Input
                  value="Enabled"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* POS Settings */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-t-lg border-b border-orange-100">
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <Calculator className="h-5 w-5" />
              POS Settings
            </CardTitle>
            <CardDescription>
              Invoice sequence management and custom prefix configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Invoice Prefix</Label>
                <Input
                  value="INV"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Receipt Prefix</Label>
                <Input
                  value="RCP"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Next Invoice Number</Label>
                <Input
                  value="001"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Auto Numbering</Label>
                <Input
                  value="Enabled"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Business User Overview */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-t-lg border-b border-violet-100">
            <CardTitle className="flex items-center gap-2 text-violet-800">
              <Users className="h-5 w-5" />
              Business User Overview
            </CardTitle>
            <CardDescription>
              High-level user structure and branch information
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Business Admins</Label>
                <Input
                  value="1"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500">Total admin accounts</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Active Staff</Label>
                <Input
                  value="0"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500">Currently active staff members</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Total Branches</Label>
                <Input
                  value="1"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500">Number of business locations</p>
              </div>
            </div>
            
            <div className="pt-4 border-t border-violet-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Branch 1 - Main Location</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value="Active Staff: 0"
                      readOnly
                      className="bg-gray-50 cursor-not-allowed"
                    />
                    <Badge variant="default" className="text-xs">Main Branch</Badge>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">User Management</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value="Self-managed"
                      readOnly
                      className="bg-gray-50 cursor-not-allowed"
                    />
                    <Badge variant="outline" className="text-xs">Business handles own staff</Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Commission Management */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-t-lg border-b border-amber-100">
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <TrendingUp className="h-5 w-5" />
              Commission Management
            </CardTitle>
            <CardDescription>
              Commission profiles and target-based incentives
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Commission Enabled</Label>
                <Input
                  value="No"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Commission Type</Label>
                <Input
                  value="Not configured"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Default Rate (%)</Label>
                <Input
                  value="0"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Target Tracking</Label>
                <Input
                  value="Disabled"
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-t-lg border-b border-gray-100">
            <CardTitle className="flex items-center gap-2 text-gray-800">
              <TrendingUp className="h-5 w-5" />
              Additional Information
            </CardTitle>
            <CardDescription>
              Business status and onboarding information
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Business Status</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={business.status}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                  />
                  <Badge variant={business.status === 'active' ? 'default' : 'destructive'} className="text-xs">
                    {business.status}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Onboarding Status</Label>
                <Input
                  value={business.isOnboarded ? 'Completed' : `Step ${business.onboardingStep}`}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>
              
              {business.status === 'deleted' && business.deletedAt && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-red-700">Deleted At</Label>
                    <Input
                      value={new Date(business.deletedAt).toLocaleString()}
                      readOnly
                      className="bg-red-50 cursor-not-allowed border-red-200"
                    />
                  </div>
                  {business.deletedBy && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-red-700">Deleted By</Label>
                      <Input
                        value={`${business.deletedBy.name} (${business.deletedBy.email})`}
                        readOnly
                        className="bg-red-50 cursor-not-allowed border-red-200"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Created Date</Label>
                <Input
                  value={new Date(business.createdAt).toLocaleDateString()}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Last Updated</Label>
                <Input
                  value={new Date(business.updatedAt).toLocaleDateString()}
                  readOnly
                  className="bg-gray-50 cursor-not-allowed"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
