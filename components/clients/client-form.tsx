"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { User, Mail, Phone, Calendar, MapPin, FileText, Users, Loader2 } from "lucide-react"
import { clientStore, type Client } from "@/lib/client-store"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"

interface ClientFormProps {
  client?: Client
  isEditMode?: boolean
  onEditComplete?: () => void
}

export function ClientForm({ client, isEditMode = false, onEditComplete }: ClientFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Parse client name into first and last name
  const parseClientName = (name: string) => {
    const parts = name.split(' ')
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || ''
    }
  }

  // Define schema inside component to access client prop
  const formSchema = z.object({
    firstName: z.string().min(2, {
      message: "First name must be at least 2 characters.",
    }),
    lastName: z.string().optional(),
    email: z.string().email({
      message: "Please enter a valid email address.",
    }).optional().or(z.literal("")),
    phone: z.string()
      .regex(/^\d{10}$/, {
        message: "Phone number must be exactly 10 digits.",
      })
      .refine((phone) => {
        // Get all clients from the store
        const allClients = clientStore.getClients()
        // Check if phone number already exists (excluding current client when editing)
        const existingClient = allClients.find(c => 
          c.phone === phone && 
          c.id !== client?.id && 
          c._id !== client?._id
        )
        return !existingClient
      }, {
        message: "Phone number already exists. Please use a different number.",
      }),
    address: z.string().optional(),
    notes: z.string().optional(),
    gender: z.enum(["male", "female", "other"], {
      required_error: "Please select a gender.",
    }),
    birthdate: z.string().optional(),
  })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
      gender: "female" as const,
      birthdate: "",
    },
  })

  // Set form values when client data is available
  useEffect(() => {
    if (client) {
      const { firstName, lastName } = parseClientName(client.name)
      form.reset({
        firstName,
        lastName,
        email: client.email || "",
        phone: client.phone || "",
        address: client.address || "",
        notes: client.notes || "",
        gender: (client.gender as "male" | "female" | "other") || "female",
        birthdate: client.birthdate || "",
      })
    }
  }, [client, form])

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true)

    try {
      const clientData = {
        id: client?.id || '',
        name: `${values.firstName} ${values.lastName}`,
        email: values.email,
        phone: values.phone,
        address: values.address,
        notes: values.notes,
        gender: values.gender,
        birthdate: values.birthdate,
        status: "active" as const,
        totalVisits: client?.totalVisits || 0,
        totalSpent: client?.totalSpent || 0,
        createdAt: client?.createdAt || new Date().toISOString(),
      }

      let success = false

      if (client) {
        // Update existing client
        const clientId = client._id || client.id
        success = await clientStore.updateClient(clientId, clientData)
        if (success) {
          toast({
            title: "Client updated",
            description: "Client has been successfully updated.",
          })
          onEditComplete?.()
        }
      } else {
        // Create new client
        success = await clientStore.addClient(clientData)
        if (success) {
          toast({
            title: "Client created",
            description: "New client has been successfully created.",
          })
          router.push("/clients")
        }
      }

      if (!success) {
        toast({
          title: "Error",
          description: `Failed to ${client ? 'update' : 'create'} client. Please try again.`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error(`Error ${client ? 'updating' : 'creating'} client:`, error)
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isViewMode = client && !isEditMode

  return (
    <Card className="bg-white/70 backdrop-blur-sm shadow-xl border-0 rounded-2xl overflow-hidden">
      <CardContent className="p-8">
        <Form {...form}>
          <form id="client-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Personal Information Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <User className="h-5 w-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Personal Information</h3>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">First Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input 
                            placeholder="Enter first name" 
                            className="pl-10 h-12 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl"
                            {...field} 
                            disabled={isViewMode}
                          />
                        </div>
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
                      <FormLabel className="text-sm font-medium text-slate-700">Last Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input 
                            placeholder="Enter last name" 
                            className="pl-10 h-12 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl"
                            {...field} 
                            disabled={isViewMode}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Contact Information Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Phone className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Contact Information</h3>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">Email (Optional)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input 
                            placeholder="Enter email address" 
                            className="pl-10 h-12 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl"
                            {...field} 
                            disabled={isViewMode}
                          />
                        </div>
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
                      <FormLabel className="text-sm font-medium text-slate-700">Phone *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input 
                            placeholder="Enter 10-digit phone number" 
                            className={`pl-10 h-12 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl ${
                              form.formState.errors.phone || (field.value && field.value.length > 0 && field.value.length !== 10) 
                                ? "border-red-500 focus:border-red-500" 
                                : ""
                            }`}
                            {...field}
                            type="tel"
                            maxLength={10}
                            disabled={isViewMode}
                            onChange={(e) => {
                              // Only allow digits and limit to 10
                              const value = e.target.value.replace(/\D/g, '').slice(0, 10)
                              field.onChange(value)
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                      {field.value && field.value.length > 0 && field.value.length !== 10 && !form.formState.errors.phone && (
                        <p className="text-sm text-red-500 mt-1">Phone number must be exactly 10 digits. Current: {field.value.length} digits</p>
                      )}
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Additional Information Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Additional Information</h3>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="birthdate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">Birth Date</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input 
                            type="date" 
                            className="pl-10 h-12 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl"
                            {...field} 
                            disabled={isViewMode}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-sm font-medium text-slate-700">Gender</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-row space-x-6"
                          disabled={isViewMode}
                        >
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="female" className="border-slate-300 text-indigo-600" />
                            </FormControl>
                            <FormLabel className="font-normal text-slate-700">Female</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="male" className="border-slate-300 text-indigo-600" />
                            </FormControl>
                            <FormLabel className="font-normal text-slate-700">Male</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="other" className="border-slate-300 text-indigo-600" />
                            </FormControl>
                            <FormLabel className="font-normal text-slate-700">Other</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Location & Notes Section */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <MapPin className="h-5 w-5 text-orange-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Location & Notes</h3>
              </div>
              
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-slate-700">Address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input 
                          placeholder="Enter address" 
                          className="pl-10 h-12 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl"
                          {...field} 
                          disabled={isViewMode}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-slate-700">Notes</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <FileText className="absolute left-3 top-4 h-4 w-4 text-slate-400" />
                        <Textarea
                          placeholder="Enter any additional notes about the client"
                          className="pl-10 pt-3 resize-none border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 rounded-xl min-h-[100px]"
                          {...field}
                          disabled={isViewMode}
                        />
                      </div>
                    </FormControl>
                    <FormDescription className="text-slate-500 text-sm">
                      Include any relevant information about client preferences, allergies, etc.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Action buttons: only for "new client" — existing clients use Save/Cancel in ClientDetailsPage toolbar (form id="client-form") */}
            {!isViewMode && !client && (
              <div className="flex justify-end gap-4 pt-6 border-t border-slate-200">
                <Button 
                  variant="outline" 
                  type="button" 
                  onClick={() => router.push("/clients")}
                  className="px-8 py-3 h-12 rounded-xl border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="px-8 py-3 h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-xl text-white font-medium"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Users className="mr-2 h-4 w-4" />
                      {client ? "Update Client" : "Save Client"}
                    </>
                  )}
                </Button>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
