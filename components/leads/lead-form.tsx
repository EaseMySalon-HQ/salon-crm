"use client"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { User, Mail, Phone, Calendar as CalendarIcon, FileText } from "lucide-react"
import { format } from "date-fns"
import { LeadsAPI } from "@/lib/api"
import { ServicesAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

interface LeadFormProps {
  lead?: any
  isEditMode?: boolean
  onSuccess?: () => void
  onCancel?: () => void
}

const formSchema = z.object({
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  phone: z.string().regex(/^\d{10}$/, {
    message: "Phone number must be exactly 10 digits.",
  }),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }).optional().or(z.literal("")),
  source: z.enum(["walk-in", "phone", "website", "social", "referral", "other"]),
  status: z.enum(["new", "follow-up", "converted", "lost"]),
  gender: z.enum(["male", "female", "others"]).optional(),
  interestedServices: z.string().optional(),
  assignedStaffId: z.string().optional(),
  followUpDate: z.string().optional(),
  notes: z.string().optional(),
})

export function LeadForm({ lead, isEditMode = false, onSuccess, onCancel }: LeadFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [services, setServices] = useState<any[]>([])
  const [loadingServices, setLoadingServices] = useState(false)
  const [interestedServicesText, setInterestedServicesText] = useState("")

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      source: "walk-in",
      status: "new",
      gender: undefined,
      interestedServices: "",
      assignedStaffId: "none",
      followUpDate: "",
      notes: "",
    },
  })

  useEffect(() => {
    if (lead) {
      const interestedServices = lead.interestedServices?.map((s: any) => 
        s.serviceName || s.serviceId?.name || s.name
      ).join(", ") || ""
      
      form.reset({
        name: lead.name || "",
        phone: lead.phone || "",
        email: lead.email || "",
        source: lead.source || "walk-in",
        status: lead.status || "new",
        gender: lead.gender || undefined,
        interestedServices: interestedServices,
        assignedStaffId: lead.assignedStaffId?._id || lead.assignedStaffId || "none",
        followUpDate: lead.followUpDate ? new Date(lead.followUpDate).toISOString().split('T')[0] : "",
        notes: lead.notes || "",
      })
      setInterestedServicesText(interestedServices)
    }
  }, [lead, form])

  // Clear follow-up date when status changes away from "follow-up"
  const status = form.watch("status")
  useEffect(() => {
    if (status !== "follow-up" && form.getValues("followUpDate")) {
      form.setValue("followUpDate", "")
    }
  }, [status, form])

  useEffect(() => {
    loadServices()
  }, [])

  const loadServices = async () => {
    try {
      setLoadingServices(true)
      const response = await ServicesAPI.getAll({ limit: 1000 })
      if (response.success && response.data) {
        const servicesList = Array.isArray(response.data) 
          ? response.data 
          : (response.data && typeof response.data === 'object' && 'data' in response.data 
              ? (response.data as { data?: any[] }).data || []
              : [])
        setServices(servicesList)
      }
    } catch (error) {
      console.error('Error loading services:', error)
    } finally {
      setLoadingServices(false)
    }
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true)

      // Parse interested services text into array
      const servicesArray = interestedServicesText
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(serviceName => {
          // Check if it matches an existing service
          const existingService = services.find(s => 
            s.name.toLowerCase() === serviceName.toLowerCase()
          )
          return {
            serviceId: existingService ? (existingService._id || existingService.id) : null,
            serviceName: existingService ? existingService.name : serviceName
          }
        })

      const leadData = {
        ...values,
        assignedStaffId: values.assignedStaffId === "none" ? undefined : values.assignedStaffId,
        interestedServices: servicesArray,
        followUpDate: values.followUpDate || undefined,
      }

      let response
      if (isEditMode && lead?._id) {
        response = await LeadsAPI.update(lead._id, leadData)
      } else {
        response = await LeadsAPI.create(leadData)
      }

      if (response.success) {
        toast({
          title: isEditMode ? "Lead updated" : "Lead created",
          description: isEditMode 
            ? "Lead has been updated successfully." 
            : "New lead has been created successfully.",
        })
        if (onSuccess) {
          onSuccess()
        }
        if (!isEditMode) {
          form.reset()
          setInterestedServicesText("")
        }
      } else {
        throw new Error(response.error || "Failed to save lead")
      }
    } catch (error: any) {
      console.error('Error saving lead:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to save lead. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditMode ? "Edit Lead" : "New Lead"}</CardTitle>
        <CardDescription>
          {isEditMode ? "Update lead information" : "Add a new lead to track"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Name *
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Enter lead name" {...field} />
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
                    <FormLabel className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone *
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="10 digit phone number" {...field} maxLength={10} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="walk-in">Walk-in</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="website">Website</SelectItem>
                        <SelectItem value="social">Social Media</SelectItem>
                        <SelectItem value="referral">Referral</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="follow-up">Follow-up</SelectItem>
                        <SelectItem value="converted">Converted</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel>Gender</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value || ""}
                        className="flex flex-row gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="male" id="male" />
                          <Label htmlFor="male" className="cursor-pointer font-normal text-sm">Male</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="female" id="female" />
                          <Label htmlFor="female" className="cursor-pointer font-normal text-sm">Female</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="others" id="others" />
                          <Label htmlFor="others" className="cursor-pointer font-normal text-sm">Others</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="interestedServices"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Interested Services</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter service names separated by commas (e.g., Haircut, Facial, Massage)..."
                      value={interestedServicesText}
                      onChange={(e) => {
                        setInterestedServicesText(e.target.value)
                        field.onChange(e.target.value)
                      }}
                      rows={3}
                      className="resize-none"
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Enter service names separated by commas. If a service exists in your system, it will be automatically linked.
                  </p>
                </FormItem>
              )}
            />

            {form.watch("status") === "follow-up" && (
              <FormField
                control={form.control}
                name="followUpDate"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      Follow-up Date
                    </FormLabel>
                    <FormControl>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? (
                              format(new Date(field.value), "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ? new Date(field.value) : undefined}
                            onSelect={(date) => {
                              field.onChange(date ? date.toISOString().split('T')[0] : "")
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Notes
                  </FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Add any notes about this lead..."
                      className="min-h-[100px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : isEditMode ? "Update Lead" : "Create Lead"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

