"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { MarketingTemplatesAPI } from "@/lib/api"

export function TemplateCreationDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: { 
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    templateName: '',
    language: 'en',
    headerText: '',
    bodyText: '',
    footerText: '',
    buttonType: 'none',
    buttonText: '',
    buttonUrl: '',
    description: '',
    tags: [] as string[]
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.templateName || !formData.bodyText) {
      toast({
        title: "Error",
        description: "Template name and body text are required",
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)

      // Build components array
      const components: any[] = []

      // Header component
      if (formData.headerText) {
        const headerComponent: any = {
          type: "HEADER",
          format: "TEXT",
          text: formData.headerText
        }
        // MSG91 requires example for HEADER with TEXT format
        headerComponent.example = {
          header_text: [formData.headerText]
        }
        components.push(headerComponent)
      }

      // Body component
      // MSG91 requires body_text to be an array of arrays: [[var1, var2, var3]]
      // Each inner array represents one example set
      const bodyExamples = extractVariableExamples(formData.bodyText)
      
      // MSG91 always requires example.body_text, even if there are no variables
      // Format: body_text must be an array containing arrays
      const bodyComponent: any = {
        type: "BODY",
        text: formData.bodyText
      }
      
      // Always include example field - MSG91 requires it
      if (bodyExamples.length > 0) {
        bodyComponent.example = {
          body_text: [bodyExamples]
        }
      } else {
        // Even with no variables, MSG91 requires example field
        bodyComponent.example = {
          body_text: [["Sample text"]]
        }
      }
      
      components.push(bodyComponent)

      // Footer component
      if (formData.footerText) {
        components.push({
          type: "FOOTER",
          text: formData.footerText
        })
      }

      // Buttons component
      if (formData.buttonType !== 'none') {
        const buttons: any[] = []
        
        if (formData.buttonType === 'url' && formData.buttonUrl) {
          buttons.push({
            type: "URL",
            text: formData.buttonText || "Visit",
            url: formData.buttonUrl,
            example: [formData.buttonUrl.replace(/\{\{\d+\}\}/g, 'example')]
          })
        } else if (formData.buttonType === 'quick_reply' && formData.buttonText) {
          buttons.push({
            type: "QUICK_REPLY",
            text: formData.buttonText
          })
        }

        if (buttons.length > 0) {
          components.push({
            type: "BUTTONS",
            buttons
          })
        }
      }

      // Log each component to verify structure
      console.log('📱 [Template Create] Components being sent:')
      components.forEach((comp, idx) => {
        console.log(`  Component ${idx + 1}:`, {
          type: comp.type,
          hasExample: !!comp.example,
          example: comp.example,
          text: comp.text?.substring(0, 50) + '...'
        })
      })
      
      console.log('📱 [Template Create] Full components payload:', JSON.stringify(components, null, 2))

      const response = await MarketingTemplatesAPI.create({
        templateName: formData.templateName,
        language: formData.language,
        components,
        description: formData.description,
        tags: formData.tags
      })

      console.log('📱 [Template Create] Response received:', response)

      if (response.success) {
        toast({
          title: "Success",
          description: "Template created and submitted for approval!",
        })
        onSuccess()
        // Reset form
        setFormData({
          templateName: '',
          language: 'en',
          headerText: '',
          bodyText: '',
          footerText: '',
          buttonType: 'none',
          buttonText: '',
          buttonUrl: '',
          description: '',
          tags: []
        })
      } else {
        // Response has success: false, extract the error message
        console.log('Template creation failed response:', response)
        // Extract error from details.errors (MSG91 error format)
        const msg91Error = response.details?.errors || response.details?.data || response.details?.error
        const errorMessage = msg91Error || 
                            response.error || 
                            (response.details && typeof response.details === 'object' 
                              ? (response.details.message || JSON.stringify(response.details))
                              : response.details) || 
                            'Failed to create template'
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        })
        return
      }
    } catch (error: any) {
      console.error('Template creation error:', error)
      const errorMessage = error?.response?.data?.error || 
                          error?.response?.data?.message || 
                          error?.message || 
                          "Failed to create template"
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const extractVariableExamples = (text: string): string[] => {
    const matches = text.match(/\{\{(\d+)\}\}/g)
    if (!matches) return []
    
    // Extract unique variable numbers and sort them
    const variableNumbers = [...new Set(matches.map(m => parseInt(m.replace(/\{\{|\}\}/g, ''))))].sort((a, b) => a - b)
    
    // Create example values for each variable in order
    const variables = variableNumbers.map(num => {
      return `Sample value ${num}`
    })
    
    return variables
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create WhatsApp Template</DialogTitle>
            <DialogDescription>
              Create a new template that will be submitted to MSG91 for approval
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Template Name */}
            <div className="space-y-2">
              <Label htmlFor="templateName">Template Name *</Label>
              <Input
                id="templateName"
                value={formData.templateName}
                onChange={(e) => setFormData(prev => ({ ...prev, templateName: e.target.value }))}
                placeholder="e.g., appointment_confirmation"
                required
              />
              <p className="text-xs text-muted-foreground">
                Use lowercase with underscores (e.g., appointment_confirmation)
              </p>
            </div>

            {/* Language and Category */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="language">Language *</Label>
                <Select
                  value={formData.language}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, language: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Header */}
            <div className="space-y-2">
              <Label htmlFor="headerText">Header Text (Optional)</Label>
              <Input
                id="headerText"
                value={formData.headerText}
                onChange={(e) => setFormData(prev => ({ ...prev, headerText: e.target.value }))}
                placeholder="Template header text"
              />
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label htmlFor="bodyText">Body Text *</Label>
              <Textarea
                id="bodyText"
                value={formData.bodyText}
                onChange={(e) => setFormData(prev => ({ ...prev, bodyText: e.target.value }))}
                placeholder="Hello {{1}}, your appointment for {{2}} on {{3}} is confirmed."
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{1}}'}, {'{{2}}'}, {'{{3}}'} etc. for variables. Example: "Hello {'{{1}}'}, your appointment is on {'{{2}}'}"
              </p>
            </div>

            {/* Footer */}
            <div className="space-y-2">
              <Label htmlFor="footerText">Footer Text (Optional)</Label>
              <Input
                id="footerText"
                value={formData.footerText}
                onChange={(e) => setFormData(prev => ({ ...prev, footerText: e.target.value }))}
                placeholder="Thank you for choosing us!"
              />
            </div>

            {/* Button Type */}
            <div className="space-y-2">
              <Label htmlFor="buttonType">Button Type</Label>
              <Select
                value={formData.buttonType}
                onValueChange={(value) => setFormData(prev => ({ ...prev, buttonType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Button</SelectItem>
                  <SelectItem value="url">URL Button</SelectItem>
                  <SelectItem value="quick_reply">Quick Reply</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Button Details */}
            {formData.buttonType !== 'none' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="buttonText">Button Text</Label>
                  <Input
                    id="buttonText"
                    value={formData.buttonText}
                    onChange={(e) => setFormData(prev => ({ ...prev, buttonText: e.target.value }))}
                    placeholder="Visit Website"
                  />
                </div>

                {formData.buttonType === 'url' && (
                  <div className="space-y-2">
                    <Label htmlFor="buttonUrl">Button URL</Label>
                    <Input
                      id="buttonUrl"
                      value={formData.buttonUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, buttonUrl: e.target.value }))}
                      placeholder="https://yourapp.com/{{4}}"
                    />
                    <p className="text-xs text-muted-foreground">
                      You can use variables like {'{{4}}'} in the URL
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this template is used for"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.templateName || !formData.bodyText}>
              {loading ? "Creating..." : "Create & Submit for Approval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

