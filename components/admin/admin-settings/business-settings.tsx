"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { 
  Building2, 
  Clock, 
  DollarSign, 
  Globe, 
  Settings,
  Users,
  Calendar,
  Shield
} from "lucide-react"

interface BusinessSettingsProps {
  settings?: any
  onSettingsChange: (settings: any) => void
}

export function BusinessSettings({ settings: propSettings, onSettingsChange }: BusinessSettingsProps) {
  const [settings, setSettings] = useState(propSettings || {
    // Default Business Settings
    defaults: {
      timezone: "Asia/Kolkata",
      currency: "INR",
      currencySymbol: "₹",
      taxRate: 18,
      dateFormat: "DD/MM/YYYY",
      timeFormat: "12", // 12 or 24 hour
      businessType: "salon",
      gstNumber: "",
      businessLicense: ""
    },
    
    // Operating Hours
    operatingHours: {
      monday: { open: "09:00", close: "18:00", closed: false },
      tuesday: { open: "09:00", close: "18:00", closed: false },
      wednesday: { open: "09:00", close: "18:00", closed: false },
      thursday: { open: "09:00", close: "18:00", closed: false },
      friday: { open: "09:00", close: "18:00", closed: false },
      saturday: { open: "09:00", close: "18:00", closed: false },
      sunday: { open: "09:00", close: "18:00", closed: true }
    },
    
    // Appointment Settings
    appointmentSettings: {
      slotDuration: 30, // minutes
      advanceBookingDays: 30,
      bufferTime: 15, // minutes
      allowOnlineBooking: false,
      requireDeposit: false,
      depositPercentage: 20,
      cancellationWindow: 24, // hours
      noShowPolicy: "charge_full"
    },
    
    // Business Creation Rules
    creationRules: {
      requireGSTNumber: false,
      requireBusinessLicense: false,
      requireWebsite: false,
      requireSocialMedia: false,
      autoGenerateCode: true,
      codePrefix: "SALON",
      codeLength: 6,
      requireOnboarding: true,
      onboardingSteps: [
        "business_info",
        "owner_details", 
        "settings_config",
        "staff_setup",
        "service_setup"
      ]
    },
    
    // Branding Defaults
    branding: {
      primaryColor: "#3B82F6",
      secondaryColor: "#1E40AF",
      fontFamily: "Inter",
      logo: "",
      favicon: ""
    }
  })

  // Update settings when propSettings change (merge so nested objects always exist)
  useEffect(() => {
    if (propSettings) {
      setSettings(prev => {
        const next = { ...prev, ...propSettings }
        if (!next.defaults || typeof next.defaults !== 'object') next.defaults = { timezone: 'Asia/Kolkata', currency: 'INR', currencySymbol: '₹', taxRate: 18, dateFormat: 'DD/MM/YYYY', timeFormat: '12', businessType: 'salon', gstNumber: '', businessLicense: '', ...(prev?.defaults || {}), ...(propSettings?.defaults || {}) }
        if (!next.operatingHours || typeof next.operatingHours !== 'object') next.operatingHours = prev?.operatingHours || {}
        if (!next.appointmentSettings || typeof next.appointmentSettings !== 'object') next.appointmentSettings = prev?.appointmentSettings || {}
        if (!next.creationRules || typeof next.creationRules !== 'object') next.creationRules = prev?.creationRules || {}
        return next
      })
    }
  }, [propSettings])

  const handleSettingChange = (path: string, value: any) => {
    setSettings(prev => {
      const newSettings = { ...prev }
      const keys = path.split('.')
      let current: any = newSettings
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]
        if (current[k] == null || typeof current[k] !== 'object') current[k] = {}
        current = current[k]
      }
      current[keys[keys.length - 1]] = value
      onSettingsChange(newSettings)
      return newSettings
    })
  }

  const handleOperatingHoursChange = (day: string, field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: {
          ...prev.operatingHours[day],
          [field]: value
        }
      }
    }))
    onSettingsChange()
  }

  const days = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' }
  ]

  return (
    <div className="space-y-6">
      {/* Default Business Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-blue-600" />
            <span>Default Business Settings</span>
          </CardTitle>
          <CardDescription>
            Default values applied to new businesses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timezone">Default Timezone</Label>
              <Select
                value={settings?.defaults?.timezone ?? 'Asia/Kolkata'}
                onValueChange={(value) => handleSettingChange('defaults.timezone', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                  <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                  <SelectItem value="Australia/Sydney">Australia/Sydney (AEST)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Default Currency</Label>
              <Select
                value={settings?.defaults?.currency ?? 'INR'}
                onValueChange={(value) => handleSettingChange('defaults.currency', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR (₹)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="AUD">AUD (A$)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxRate">Default Tax Rate (%)</Label>
              <Input
                id="taxRate"
                type="number"
                min="0"
                max="50"
                step="0.01"
                value={settings?.defaults?.taxRate ?? 18}
                onChange={(e) => handleSettingChange('defaults.taxRate', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessType">Default Business Type</Label>
              <Select
                value={settings?.defaults?.businessType ?? 'salon'}
                onValueChange={(value) => handleSettingChange('defaults.businessType', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salon">Salon</SelectItem>
                  <SelectItem value="spa">Spa</SelectItem>
                  <SelectItem value="barbershop">Barbershop</SelectItem>
                  <SelectItem value="beauty_clinic">Beauty Clinic</SelectItem>
                  <SelectItem value="nail_salon">Nail Salon</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateFormat">Date Format</Label>
              <Select
                value={settings?.defaults?.dateFormat ?? 'DD/MM/YYYY'}
                onValueChange={(value) => handleSettingChange('defaults.dateFormat', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="DD-MM-YYYY">DD-MM-YYYY</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeFormat">Time Format</Label>
              <Select
                value={settings?.defaults?.timeFormat ?? '12'}
                onValueChange={(value) => handleSettingChange('defaults.timeFormat', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">12 Hour (AM/PM)</SelectItem>
                  <SelectItem value="24">24 Hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Operating Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-green-600" />
            <span>Default Operating Hours</span>
          </CardTitle>
          <CardDescription>
            Standard operating hours for new businesses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {days.map((day) => (
            <div key={day.key} className="flex items-center space-x-4 p-4 border rounded-lg">
              <div className="w-24">
                <Label className="font-medium">{day.label}</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  checked={!settings?.operatingHours?.[day.key]?.closed}
                  onCheckedChange={(checked) => handleOperatingHoursChange(day.key, 'closed', !checked)}
                />
                <span className="text-sm text-gray-600">
                  {settings?.operatingHours?.[day.key]?.closed ? 'Closed' : 'Open'}
                </span>
              </div>

              {!settings?.operatingHours?.[day.key]?.closed && (
                <div className="flex items-center space-x-2">
                  <Input
                    type="time"
                    value={settings?.operatingHours?.[day.key]?.open ?? '09:00'}
                    onChange={(e) => handleOperatingHoursChange(day.key, 'open', e.target.value)}
                    className="w-32"
                  />
                  <span className="text-gray-500">to</span>
                  <Input
                    type="time"
                    value={settings?.operatingHours?.[day.key]?.close ?? '18:00'}
                    onChange={(e) => handleOperatingHoursChange(day.key, 'close', e.target.value)}
                    className="w-32"
                  />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Appointment Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-purple-600" />
            <span>Default Appointment Settings</span>
          </CardTitle>
          <CardDescription>
            Default appointment configuration for new businesses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="slotDuration">Slot Duration (minutes)</Label>
              <Input
                id="slotDuration"
                type="number"
                min="15"
                max="120"
                step="15"
                value={settings.appointmentSettings.slotDuration}
                onChange={(e) => handleSettingChange('appointmentSettings.slotDuration', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="advanceBookingDays">Advance Booking (days)</Label>
              <Input
                id="advanceBookingDays"
                type="number"
                min="1"
                max="365"
                value={settings.appointmentSettings.advanceBookingDays}
                onChange={(e) => handleSettingChange('appointmentSettings.advanceBookingDays', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bufferTime">Buffer Time (minutes)</Label>
              <Input
                id="bufferTime"
                type="number"
                min="0"
                max="60"
                value={settings.appointmentSettings.bufferTime}
                onChange={(e) => handleSettingChange('appointmentSettings.bufferTime', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="depositPercentage">Deposit Percentage (%)</Label>
              <Input
                id="depositPercentage"
                type="number"
                min="0"
                max="100"
                value={settings.appointmentSettings.depositPercentage}
                onChange={(e) => handleSettingChange('appointmentSettings.depositPercentage', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cancellationWindow">Cancellation Window (hours)</Label>
              <Input
                id="cancellationWindow"
                type="number"
                min="1"
                max="168"
                value={settings.appointmentSettings.cancellationWindow}
                onChange={(e) => handleSettingChange('appointmentSettings.cancellationWindow', parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="noShowPolicy">No-Show Policy</Label>
              <Select
                value={settings.appointmentSettings.noShowPolicy}
                onValueChange={(value) => handleSettingChange('appointmentSettings.noShowPolicy', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="charge_full">Charge Full Amount</SelectItem>
                  <SelectItem value="charge_deposit">Charge Deposit Only</SelectItem>
                  <SelectItem value="no_charge">No Charge</SelectItem>
                  <SelectItem value="ban_client">Ban Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Allow Online Booking</Label>
                <p className="text-xs text-gray-500">
                  Enable online appointment booking
                </p>
              </div>
              <Switch
                checked={settings.appointmentSettings.allowOnlineBooking}
                onCheckedChange={(checked) => handleSettingChange('appointmentSettings.allowOnlineBooking', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Require Deposit</Label>
                <p className="text-xs text-gray-500">
                  Require deposit for appointments
                </p>
              </div>
              <Switch
                checked={settings.appointmentSettings.requireDeposit}
                onCheckedChange={(checked) => handleSettingChange('appointmentSettings.requireDeposit', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Creation Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-red-600" />
            <span>Business Creation Rules</span>
          </CardTitle>
          <CardDescription>
            Rules and requirements for business creation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codePrefix">Business Code Prefix</Label>
              <Input
                id="codePrefix"
                value={settings.creationRules.codePrefix}
                onChange={(e) => handleSettingChange('creationRules.codePrefix', e.target.value)}
                className="w-full"
                placeholder="SALON"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="codeLength">Code Length</Label>
              <Input
                id="codeLength"
                type="number"
                min="4"
                max="10"
                value={settings.creationRules.codeLength}
                onChange={(e) => handleSettingChange('creationRules.codeLength', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Require GST Number</Label>
                <p className="text-xs text-gray-500">
                  Make GST number mandatory for business creation
                </p>
              </div>
              <Switch
                checked={settings.creationRules.requireGSTNumber}
                onCheckedChange={(checked) => handleSettingChange('creationRules.requireGSTNumber', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Require Business License</Label>
                <p className="text-xs text-gray-500">
                  Make business license mandatory
                </p>
              </div>
              <Switch
                checked={settings.creationRules.requireBusinessLicense}
                onCheckedChange={(checked) => handleSettingChange('creationRules.requireBusinessLicense', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Require Website</Label>
                <p className="text-xs text-gray-500">
                  Make website URL mandatory
                </p>
              </div>
              <Switch
                checked={settings.creationRules.requireWebsite}
                onCheckedChange={(checked) => handleSettingChange('creationRules.requireWebsite', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Auto-Generate Business Code</Label>
                <p className="text-xs text-gray-500">
                  Automatically generate unique business codes
                </p>
              </div>
              <Switch
                checked={settings.creationRules.autoGenerateCode}
                onCheckedChange={(checked) => handleSettingChange('creationRules.autoGenerateCode', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Require Onboarding</Label>
                <p className="text-xs text-gray-500">
                  Force businesses through onboarding process
                </p>
              </div>
              <Switch
                checked={settings.creationRules.requireOnboarding}
                onCheckedChange={(checked) => handleSettingChange('creationRules.requireOnboarding', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branding Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Globe className="h-5 w-5 text-indigo-600" />
            <span>Default Branding</span>
          </CardTitle>
          <CardDescription>
            Default branding settings for new businesses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Primary Color</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="primaryColor"
                  type="color"
                  value={settings.branding.primaryColor}
                  onChange={(e) => handleSettingChange('branding.primaryColor', e.target.value)}
                  className="w-16 h-10 p-1 border rounded"
                />
                <Input
                  value={settings.branding.primaryColor}
                  onChange={(e) => handleSettingChange('branding.primaryColor', e.target.value)}
                  className="flex-1"
                  placeholder="#3B82F6"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondaryColor">Secondary Color</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="secondaryColor"
                  type="color"
                  value={settings.branding.secondaryColor}
                  onChange={(e) => handleSettingChange('branding.secondaryColor', e.target.value)}
                  className="w-16 h-10 p-1 border rounded"
                />
                <Input
                  value={settings.branding.secondaryColor}
                  onChange={(e) => handleSettingChange('branding.secondaryColor', e.target.value)}
                  className="flex-1"
                  placeholder="#1E40AF"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fontFamily">Font Family</Label>
              <Select
                value={settings.branding.fontFamily}
                onValueChange={(value) => handleSettingChange('branding.fontFamily', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inter">Inter</SelectItem>
                  <SelectItem value="Roboto">Roboto</SelectItem>
                  <SelectItem value="Open Sans">Open Sans</SelectItem>
                  <SelectItem value="Lato">Lato</SelectItem>
                  <SelectItem value="Poppins">Poppins</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
