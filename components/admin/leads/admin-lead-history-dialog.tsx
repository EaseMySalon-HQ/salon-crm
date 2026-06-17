"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { ChevronDown, ChevronUp, Clock, FileText, Phone, Sparkles, User } from "lucide-react"
import {
  AdminLeadsAPI,
  type PlatformLeadActivityRow,
  type PlatformLeadRow,
} from "@/lib/admin-api"
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_COLORS,
  adminAssigneeName,
  formatLeadStatus,
  getPlatformLeadInterestedServices,
  hasAdminLeadPermission,
} from "@/lib/admin-lead-permissions"
import { useAdminAuth } from "@/lib/admin-auth-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FollowUpDateField } from "@/components/admin/leads/follow-up-date-field"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

const statusUpdateSchema = z.object({
  status: z.enum(["new", "follow-up", "converted", "lost"]),
  followUpDate: z.string().optional(),
  notes: z.string().optional(),
})

type AdminLeadHistoryDialogProps = {
  lead: PlatformLeadRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onLeadUpdated?: (lead: PlatformLeadRow) => void
}

export function AdminLeadHistoryDialog({
  lead,
  open,
  onOpenChange,
  onLeadUpdated,
}: AdminLeadHistoryDialogProps) {
  const { admin } = useAdminAuth()
  const { toast } = useToast()
  const [activities, setActivities] = useState<PlatformLeadActivityRow[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [activityTimelineOpen, setActivityTimelineOpen] = useState(false)
  const canEdit = hasAdminLeadPermission(admin, "update")
  const interestedServices = getPlatformLeadInterestedServices(lead)

  const form = useForm<z.infer<typeof statusUpdateSchema>>({
    resolver: zodResolver(statusUpdateSchema),
    defaultValues: {
      status: lead.status,
      followUpDate: lead.followUpDate
        ? new Date(lead.followUpDate).toISOString().split("T")[0]
        : "",
      notes: "",
    },
  })

  const status = form.watch("status")

  useEffect(() => {
    if (!open || !lead._id) return
    form.reset({
      status: lead.status,
      followUpDate: lead.followUpDate
        ? new Date(lead.followUpDate).toISOString().split("T")[0]
        : "",
      notes: "",
    })
    setLoadingActivities(true)
    AdminLeadsAPI.getActivities(lead._id)
      .then(setActivities)
      .catch(() => {
        toast({
          title: "Error",
          description: "Could not load activity history.",
          variant: "destructive",
        })
      })
      .finally(() => setLoadingActivities(false))
  }, [open, lead._id, lead.status, lead.followUpDate, form, toast])

  const onAddStatus = async (values: z.infer<typeof statusUpdateSchema>) => {
    if (!canEdit) return
    try {
      setSubmitting(true)
      const updated = await AdminLeadsAPI.update(lead._id, {
        status: values.status,
        followUpDate: values.status === "follow-up" ? values.followUpDate : undefined,
        notes: values.notes || "",
      })
      toast({ title: "Updated", description: "Lead status recorded." })
      onLeadUpdated?.(updated)
      const acts = await AdminLeadsAPI.getActivities(lead._id)
      setActivities(acts)
      form.setValue("notes", "")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Update failed."
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {lead.name}
            <Badge className={LEAD_STATUS_COLORS[lead.status] || ""}>
              {formatLeadStatus(lead.status)}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {lead.salonName ? `${lead.salonName} · ` : ""}
            {LEAD_SOURCE_LABELS[lead.source] || lead.source}
            {lead.assignedAdminId ? ` · ${adminAssigneeName(lead.assignedAdminId)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <Phone className="h-4 w-4" />
            {lead.phone}
          </div>
          {lead.email && (
            <div className="flex items-center gap-2 text-slate-600 truncate">{lead.email}</div>
          )}
          {lead.city && <div className="text-slate-600">City: {lead.city}</div>}
          {lead.branchCount && <div className="text-slate-600">Branches: {lead.branchCount}</div>}
          {lead.preferredDemoTime && (
            <div className="text-slate-600">Preferred: {lead.preferredDemoTime}</div>
          )}
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Interested Services</span>
            </div>
            {interestedServices.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {interestedServices.map((service) => (
                  <Badge key={service} variant="secondary" className="text-sm px-3 py-1.5 font-normal">
                    {service}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No services selected</p>
            )}
          </div>
          {lead.interestedIn && (
            <div className="sm:col-span-2 flex gap-2 text-slate-600">
              <FileText className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{lead.interestedIn}</span>
            </div>
          )}
        </div>

        {canEdit && lead.status !== "converted" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Add status update</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onAddStatus)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="follow-up">Follow-up</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
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
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea rows={3} placeholder="Call notes, next steps…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={submitting} size="sm">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save update"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <Separator />

        <Collapsible open={activityTimelineOpen} onOpenChange={setActivityTimelineOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg py-2 text-left hover:bg-slate-50 transition-colors"
              aria-expanded={activityTimelineOpen}
            >
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Activity timeline
                {!loadingActivities && activities.length > 0 ? (
                  <span className="text-xs font-normal text-slate-500">({activities.length})</span>
                ) : null}
              </h3>
              {activityTimelineOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1 data-[state=closed]:hidden">
          {loadingActivities ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : activities.length === 0 ? (
            <p className="text-sm text-slate-500">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {activities.map((act) => (
                <li
                  key={act._id}
                  className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-slate-800">{act.description}</span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {format(new Date(act.createdAt), "dd MMM yyyy, HH:mm")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {act.performedByName}
                  </p>
                  {act.details &&
                    typeof act.details === "object" &&
                    "statusNoteSnapshot" in act.details &&
                    act.details.statusNoteSnapshot ? (
                    <p className="mt-2 text-slate-600 text-xs border-l-2 border-slate-200 pl-2">
                      {String(act.details.statusNoteSnapshot)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          </CollapsibleContent>
        </Collapsible>
      </DialogContent>
    </Dialog>
  )
}
