"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { SettingsAPI } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { Settings, Upload, Image, X, Building2, Receipt, Lock } from "lucide-react"

export function BusinessSettings() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission("business_settings", "edit") || hasPermission("general_settings", "edit")
  const [businessInfo, setBusinessInfo] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    googleMapsUrl: "",
    googleReviewUrl: "",
    allowFeedbackResubmission: false,
    website: "",
    description: "",
    socialMedia: "",
    logo: "",
    gstNumber: "",
    showGstOnClientReceipts: true,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Load business settings on component mount
  useEffect(() => {
    loadBusinessSettings()
  }, [])

  const loadBusinessSettings = async () => {
    setIsLoading(true)
    try {
      const response = await SettingsAPI.getBusinessSettings()
      if (response.success) {
        const d = response.data
        setBusinessInfo((prev) => ({
          ...prev,
          ...d,
          googleReviewUrl: d.googleReviewUrl ?? "",
          allowFeedbackResubmission: d.allowFeedbackResubmission === true,
          showGstOnClientReceipts: d.receiptTemplate?.showGstNumber !== false,
        }))
      }
    } catch (error) {
      console.error('Error loading business settings:', error)
      toast({
        title: "Error",
        description: "Failed to load business settings",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (PNG, JPG, JPEG, etc.)",
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

    setIsUploading(true)
    try {
      // Convert file to base64 for storage
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64String = e.target?.result as string
        setBusinessInfo({ ...businessInfo, logo: base64String })
        toast({
          title: "Logo uploaded",
          description: "Logo has been uploaded successfully",
        })
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error uploading logo:', error)
      toast({
        title: "Upload failed",
        description: "Failed to upload logo. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const removeLogo = () => {
    setBusinessInfo({ ...businessInfo, logo: "" })
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await SettingsAPI.updateBusinessSettings(businessInfo)
      
      if (response.success) {
        toast({
          title: "Success",
          description: "Business information updated successfully",
        })
        // Reload business settings to ensure we have the latest data
        await loadBusinessSettings()
      } else {
        throw new Error(response.error || 'Failed to update business settings')
      }
    } catch (error: any) {
      console.error('Error saving business settings:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to save business information. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Settings className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Business Information</h2>
                <p className="text-slate-600">Loading business settings...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Settings className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Business Information</h2>
              <p className="text-slate-600">Manage your salon&apos;s contact details and branding</p>
            </div>
          </div>
        </div>
      </div>

      {/* Basic Information Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg flex items-center justify-center">
              <Settings className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Basic Information</h3>
              <p className="text-slate-600 text-sm">Your salon&apos;s primary business details</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="name" className="text-sm font-medium text-slate-700">Business Name *</Label>
                <Input
                  id="name"
                  value={businessInfo.name || ""}
                  onChange={(e) => setBusinessInfo({ ...businessInfo, name: e.target.value })}
                  placeholder="Enter business name"
                  className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="email" className="text-sm font-medium text-slate-700">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={businessInfo.email || ""}
                  onChange={(e) => setBusinessInfo({ ...businessInfo, email: e.target.value })}
                  placeholder="Enter email address"
                  className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="phone" className="text-sm font-medium text-slate-700">Phone *</Label>
                <Input
                  id="phone"
                  value={businessInfo.phone || ""}
                  onChange={(e) => setBusinessInfo({ ...businessInfo, phone: e.target.value })}
                  placeholder="Enter phone number"
                  className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="website" className="text-sm font-medium text-slate-700">Website</Label>
                <Input
                  id="website"
                  value={businessInfo.website || ""}
                  onChange={(e) => setBusinessInfo({ ...businessInfo, website: e.target.value })}
                  placeholder="Enter website URL"
                  className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <Label htmlFor="description" className="text-sm font-medium text-slate-700">Description</Label>
              <Textarea
                id="description"
                value={businessInfo.description || ""}
                onChange={(e) => setBusinessInfo({ ...businessInfo, description: e.target.value })}
                rows={3}
                placeholder="Enter business description"
                className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            
            <div className="space-y-3">
              <Label htmlFor="socialMedia" className="text-sm font-medium text-slate-700">Social Media Handle</Label>
              <Input
                id="socialMedia"
                value={businessInfo.socialMedia || ""}
                onChange={(e) => setBusinessInfo({ ...businessInfo, socialMedia: e.target.value })}
                placeholder="e.g., @glamoursalon"
                className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Address Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-lg flex items-center justify-center">
              <Settings className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Address</h3>
              <p className="text-slate-600 text-sm">Your salon&apos;s physical location</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="address" className="text-sm font-medium text-slate-700">Street Address *</Label>
              <Input
                id="address"
                value={businessInfo.address || ""}
                onChange={(e) => setBusinessInfo({ ...businessInfo, address: e.target.value })}
                placeholder="Enter street address"
                className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <Label htmlFor="city" className="text-sm font-medium text-slate-700">City *</Label>
                <Input
                  id="city"
                  value={businessInfo.city || ""}
                  onChange={(e) => setBusinessInfo({ ...businessInfo, city: e.target.value })}
                  placeholder="Enter city"
                  className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="state" className="text-sm font-medium text-slate-700">State *</Label>
                <Input
                  id="state"
                  value={businessInfo.state || ""}
                  onChange={(e) => setBusinessInfo({ ...businessInfo, state: e.target.value })}
                  placeholder="Enter state"
                  className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="zipCode" className="text-sm font-medium text-slate-700">ZIP Code *</Label>
                <Input
                  id="zipCode"
                  value={businessInfo.zipCode || ""}
                  onChange={(e) => setBusinessInfo({ ...businessInfo, zipCode: e.target.value })}
                  placeholder="Enter ZIP code"
                  className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="googleMapsUrl" className="text-sm font-medium text-slate-700">Google Maps URL</Label>
              <Input
                id="googleMapsUrl"
                type="text"
                inputMode="url"
                value={businessInfo.googleMapsUrl || ""}
                onChange={(e) => setBusinessInfo({ ...businessInfo, googleMapsUrl: e.target.value })}
                placeholder="https://maps.app.goo.gl/... or short code only"
                className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500">
                Optional. Full link (e.g. https://maps.app.goo.gl/rwY2PmLdcE4TNo8w9) or only the short code after maps.app.goo.gl/ — used for WhatsApp buttons and directions.
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="googleReviewUrl" className="text-sm font-medium text-slate-700">
                Google Review URL
              </Label>
              <Input
                id="googleReviewUrl"
                type="url"
                inputMode="url"
                value={businessInfo.googleReviewUrl || ""}
                onChange={(e) => setBusinessInfo({ ...businessInfo, googleReviewUrl: e.target.value })}
                placeholder="https://g.page/... or Google review link"
                className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500">
                Optional. Shown to customers only after they leave 5-star feedback so they can post on Google.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="allowFeedbackResubmission" className="text-sm font-medium text-slate-800">
                  Allow feedback resubmission
                </Label>
                <p className="text-xs text-slate-500">
                  When on, customers can change their rating for the same invoice link more than once.
                </p>
              </div>
              <Switch
                id="allowFeedbackResubmission"
                checked={businessInfo.allowFeedbackResubmission === true}
                onCheckedChange={(checked) =>
                  setBusinessInfo({ ...businessInfo, allowFeedbackResubmission: checked })
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Branding & Logo Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg flex items-center justify-center">
              <Image className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Branding & Logo</h3>
              <p className="text-slate-600 text-sm">Upload your salon&apos;s logo for receipts and branding</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="flex items-start gap-6">
              {/* Logo Preview */}
              <div className="flex-shrink-0">
                <div className="w-24 h-24 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50">
                  {businessInfo.logo ? (
                    <div className="relative">
                      <img 
                        src={businessInfo.logo} 
                        alt="Business Logo" 
                        className="w-20 h-20 object-contain rounded"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={removeLogo}
                        className="absolute -top-2 -right-2 h-6 w-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded-full"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Image className="h-8 w-8 text-slate-400" />
                  )}
                </div>
              </div>
              
              {/* Upload Controls */}
              <div className="flex-1 space-y-4">
                <div>
                  <Label className="text-sm font-medium text-slate-700">Business Logo</Label>
                  <p className="text-xs text-slate-500 mt-1">
                    Upload a high-quality logo (PNG, JPG, JPEG). Max size: 5MB. Recommended: 200x200px
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    aria-label="Upload business logo"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    {isUploading ? "Uploading..." : businessInfo.logo ? "Change Logo" : "Upload Logo"}
                  </Button>
                  
                  {businessInfo.logo && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={removeLogo}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Remove Logo
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tax Information Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg flex items-center justify-center">
              <Receipt className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Tax Information</h3>
              <p className="text-slate-600 text-sm">Configure tax details for billing and compliance</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="gstNumber" className="text-sm font-medium text-slate-700">GST Number</Label>
              <Input
                id="gstNumber"
                value={businessInfo.gstNumber || ""}
                onChange={(e) => setBusinessInfo({ ...businessInfo, gstNumber: e.target.value })}
                placeholder="Enter GST number (e.g., 22AAAAA0000A1Z5)"
                className="border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                maxLength={15}
              />
              <p className="text-xs text-slate-500">
                Enter your 15-character GST registration number.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="showGstOnClientReceipts" className="text-sm font-medium text-slate-800">
                  Show GST on client receipts
                </Label>
                <p className="text-xs text-slate-500">
                  When enabled, this GST number appears on receipts for client services and products.
                  When disabled, it is used only on tax invoices for wallet recharges.
                </p>
              </div>
              <Switch
                id="showGstOnClientReceipts"
                checked={businessInfo.showGstOnClientReceipts !== false}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setBusinessInfo({ ...businessInfo, showGstOnClientReceipts: checked })
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end items-center gap-3">
        {!canEdit && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> You don't have permission to edit business settings
          </span>
        )}
        <Button
          onClick={handleSave}
          disabled={isSaving || !canEdit}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 shadow-md hover:shadow-lg transition-all duration-300 rounded-lg font-medium disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
