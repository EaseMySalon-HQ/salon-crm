"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Building2, FileText, Mail, Phone, User } from "lucide-react"
import { AdminLeadsAPI, type PlatformLeadRow } from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FollowUpDateField } from "@/components/admin/leads/follow-up-date-field"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import type { AdminLeadAssignee } from "@/lib/admin-api"
import {
  getPlatformLeadDemoNotes,
  getPlatformLeadFirstName,
  getPlatformLeadInterestedInDisplay,
  getPlatformLeadLastName,
} from "@/lib/admin-lead-permissions"

const formSchema = z.object({
  firstName: z.string().min(2, { message: "First name must be at least 2 characters." }),
  lastName: z.string().optional(),
  salonName: z.string().optional(),
  phone: z.string().regex(/^\d{10}$/, { message: "Phone number must be exactly 10 digits." }),
  email: z.string().email({ message: "Please enter a valid email." }).optional().or(z.literal("")),
  source: z.enum(["walk-in", "phone", "website", "social", "referral", "other"]),
  status: z.enum(["new", "follow-up", "trial", "converted", "lost"]),
  interestedIn: z.string().optional(),
  assignedAdminId: z.string().optional(),
  followUpDate: z.string().optional(),
  notes: z.string().optional(),
})

type AdminLeadFormProps = {
  lead?: PlatformLeadRow | null
  isEditMode?: boolean
  assignees: AdminLeadAssignee[]
  onSuccess?: () => void
  onCancel?: () => void
}

export function AdminLeadForm({
  lead,
  isEditMode = false,
  assignees,
  onSuccess,
  onCancel,
}: AdminLeadFormProps) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      salonName: "",
      phone: "",
      email: "",
      source: "walk-in",
      status: "new",
      interestedIn: "",
      assignedAdminId: "none",
      followUpDate: "",
      notes: "",
    },
  })

  const status = form.watch("status")

  useEffect(() => {
    if (lead) {
      const assignedId =
        typeof lead.assignedAdminId === "object" && lead.assignedAdminId
          ? lead.assignedAdminId._id
          : (lead.assignedAdminId as string | undefined)
      form.reset({
        firstName: getPlatformLeadFirstName(lead),
        lastName: getPlatformLeadLastName(lead),
        salonName: lead.salonName || "",
        phone: lead.phone || "",
        email: lead.email || "",
        source: lead.source || "walk-in",
        status: lead.status || "new",
        interestedIn: getPlatformLeadInterestedInDisplay(lead),
        assignedAdminId: assignedId || "none",
        followUpDate: lead.followUpDate
          ? new Date(lead.followUpDate).toISOString().split("T")[0]
          : "",
        notes: getPlatformLeadDemoNotes(lead),
      })
    }
  }, [lead, form])

  useEffect(() => {
    if (status !== "follow-up" && form.getValues("followUpDate")) {
      form.setValue("followUpDate", "")
    }
  }, [status, form])

  useEffect(() => {
    if (!isEditMode && status === "new") {
      form.setValue("notes", "")
    }
  }, [status, isEditMode, form])

  const leadDemoNotes = lead ? getPlatformLeadDemoNotes(lead) : ""
  const showNotesField = status !== "new" || Boolean(leadDemoNotes)

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsSubmitting(true)
      let notesPayload = ""
      if (values.status !== "new") {
        notesPayload = values.notes || ""
      } else if (isEditMode) {
        notesPayload = values.notes ?? leadDemoNotes
      }

      const payload = {
        ...values,
        notes: notesPayload,
        assignedAdminId: values.assignedAdminId === "none" ? undefined : values.assignedAdminId,
        followUpDate: values.followUpDate || undefined,
        email: values.email || undefined,
      }

      if (isEditMode && lead?._id) {
        await AdminLeadsAPI.update(lead._id, payload)
        toast({ title: "Lead updated", description: "Lead has been updated successfully." })
      } else {
        await AdminLeadsAPI.create(payload)
        toast({ title: "Lead created", description: "New lead has been created successfully." })
        form.reset()
      }
      onSuccess?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save lead."
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader>
        <CardTitle>{isEditMode ? "Edit Lead" : "New Lead"}</CardTitle>
        <CardDescription>
          {isEditMode
            ? "Update prospect contact and follow-up details."
            : "Add a platform sales lead (prospective salon)."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      First name *
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="First name" autoComplete="given-name" {...field} />
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
                    <FormLabel className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Last name
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Last name" autoComplete="family-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="salonName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Salon / business name
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Salon name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <Input placeholder="10 digit phone" maxLength={10} {...field} />
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isEditMode && lead?.status === "converted"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(!isEditMode || field.value === "new") && (
                          <SelectItem value="new" disabled={isEditMode}>
                            New
                          </SelectItem>
                        )}
                        {lead?.status === "trial" ? (
                          <>
                            <SelectItem value="converted">Converted</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
                          </>
                        ) : lead?.status === "converted" ? (
                          <SelectItem value="converted">Converted</SelectItem>
                        ) : (
                          <>
                            <SelectItem value="follow-up">Follow-up</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="interestedIn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interested in</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Plan tier, modules, locations, etc."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assignedAdminId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assigned to</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {assignees.map((a) => (
                        <SelectItem key={a._id} value={a._id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {status === "follow-up" && (
              <FormField
                control={form.control}
                name="followUpDate"
                render={({ field }) => (
                  <FollowUpDateField
                    value={field.value || ""}
                    onChange={field.onChange}
                  />
                )}
              />
            )}

            {showNotesField && (
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Notes
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={
                          status === "new"
                            ? "Message from demo booking form"
                            : "Notes about this lead…"
                        }
                        className="min-h-[100px]"
                        readOnly={status === "new" && Boolean(leadDemoNotes)}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end gap-2">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : isEditMode ? "Update Lead" : "Create Lead"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
