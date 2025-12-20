"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { 
  Phone, 
  Calendar as CalendarIcon,
  Plus,
  AlertCircle,
  Sparkles,
  Clock,
  User as UserIcon,
  FileText,
  CheckCircle,
  ArrowRight,
  UserPlus,
  Calendar as CalendarEvent
} from "lucide-react"
import { LeadsAPI } from "@/lib/api"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"

interface LeadHistoryDialogProps {
  lead: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onLeadUpdated?: (updatedLead: any) => void
}

const statusUpdateSchema = z.object({
  status: z.enum(["new", "follow-up", "converted", "lost"]),
  followUpDate: z.string().optional(),
  notes: z.string().optional(),
})

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    new: "New",
    "follow-up": "Follow-up",
    converted: "Converted",
    lost: "Lost",
  }
  return labels[status] || status
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    new: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "follow-up": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    converted: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    lost: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  }
  return colors[status] || "bg-gray-100 text-gray-800"
}

const getSourceLabel = (source: string) => {
  const labels: Record<string, string> = {
    "walk-in": "Walk-in",
    phone: "Phone",
    website: "Website",
    social: "Social Media",
    referral: "Referral",
    other: "Other",
  }
  return labels[source] || source
}

const getSourceColor = (source: string) => {
  const colors: Record<string, string> = {
    "walk-in": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    phone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    website: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    social: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    referral: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
    other: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  }
  return colors[source] || "bg-slate-100 text-slate-800"
}

interface Activity {
  _id: string
  activityType: string
  description: string
  performedByName: string
  createdAt: string
  previousValue?: any
  newValue?: any
  field?: string
}

export function LeadHistoryDialog({ lead, open, onOpenChange, onLeadUpdated }: LeadHistoryDialogProps) {
  const { user } = useAuth()
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false)
  const [currentLead, setCurrentLead] = useState<any>(lead)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoadingActivities, setIsLoadingActivities] = useState(false)

  const form = useForm<z.infer<typeof statusUpdateSchema>>({
    resolver: zodResolver(statusUpdateSchema),
    defaultValues: {
      status: "new",
      followUpDate: "",
      notes: "",
    },
  })

  const fetchActivities = async (leadId: string, leadData?: any) => {
    try {
      setIsLoadingActivities(true)
      const response = await LeadsAPI.getActivities(leadId)
      const leadForFallback = leadData || currentLead || lead
      
      console.log('Activities API response:', JSON.stringify(response, null, 2))
      
      if (response.success && response.data) {
        // If activities exist, use them
        if (response.data.length > 0) {
          console.log('Found activities:', response.data.length)
          // Reverse to get oldest first (for proper grouping)
          const reversedActivities = [...response.data].reverse()
          console.log('Activities for grouping:', JSON.stringify(reversedActivities.map(a => ({
            id: a._id,
            type: a.activityType,
            time: a.createdAt,
            status: a.activityType === 'status_changed' ? a.newValue : null,
            hasNotes: a.activityType === 'notes_updated',
            notesValue: a.activityType === 'notes_updated' ? a.newValue : null,
            newValue: a.newValue,
            previousValue: a.previousValue
          })), null, 2))
          
          // Check if "created" activity exists
          const hasCreatedActivity = reversedActivities.some(a => a.activityType === 'created')
          console.log('Has created activity:', hasCreatedActivity, 'Lead createdAt:', leadForFallback?.createdAt)
          
          // If no "created" activity exists but lead has createdAt, add synthetic one
          // IMPORTANT: Always use "new" status for the created activity, regardless of current lead status
          if (!hasCreatedActivity && leadForFallback?.createdAt) {
            const syntheticActivity: Activity = {
              _id: 'synthetic-created',
              activityType: 'created',
              description: `Lead created from ${getSourceLabel(leadForFallback.source || 'unknown')}`,
              performedByName: 'System',
              createdAt: leadForFallback.createdAt,
              newValue: {
                name: leadForFallback.name,
                phone: leadForFallback.phone,
                source: leadForFallback.source,
                status: 'new', // Always "new" for initial creation, regardless of current status
                notes: leadForFallback.notes || null
              }
            }
            // Insert synthetic activity at the beginning (oldest)
            reversedActivities.unshift(syntheticActivity)
            console.log('Added synthetic created activity with status: new')
          }
          
          setActivities(reversedActivities)
        } else {
          console.log('No activities found, creating synthetic activity')
          // No activities in database, create synthetic "created" activity if lead has createdAt
          if (leadForFallback?.createdAt) {
            const syntheticActivity: Activity = {
              _id: 'synthetic-created',
              activityType: 'created',
              description: `Lead created from ${getSourceLabel(leadForFallback.source || 'unknown')}`,
              performedByName: 'System',
              createdAt: leadForFallback.createdAt,
              newValue: {
                name: leadForFallback.name,
                phone: leadForFallback.phone,
                source: leadForFallback.source,
                status: leadForFallback.status,
                notes: leadForFallback.notes || null
              }
            }
            setActivities([syntheticActivity])
          } else {
            setActivities([])
          }
        }
      } else {
        console.error('Failed to fetch activities:', response.error || 'Unknown error')
        // Fallback: show synthetic activity if lead has createdAt
        if (leadForFallback?.createdAt) {
          const syntheticActivity: Activity = {
            _id: 'synthetic-created',
            activityType: 'created',
            description: `Lead created from ${getSourceLabel(leadForFallback.source || 'unknown')}`,
            performedByName: 'System',
            createdAt: leadForFallback.createdAt,
            newValue: {
              name: leadForFallback.name,
              phone: leadForFallback.phone,
              source: leadForFallback.source,
              status: leadForFallback.status,
              notes: leadForFallback.notes || null
            }
          }
          setActivities([syntheticActivity])
        } else {
          setActivities([])
        }
      }
    } catch (error) {
      console.error('Error fetching activities:', error)
      // Fallback: show synthetic activity if lead has createdAt
      const leadForFallback = leadData || currentLead || lead
      if (leadForFallback?.createdAt) {
        const syntheticActivity: Activity = {
          _id: 'synthetic-created',
          activityType: 'created',
          description: `Lead created from ${getSourceLabel(leadForFallback.source || 'unknown')}`,
          performedByName: 'System',
          createdAt: leadForFallback.createdAt,
          newValue: {
            name: leadForFallback.name,
            phone: leadForFallback.phone,
            source: leadForFallback.source,
            status: leadForFallback.status,
            notes: leadForFallback.notes || null
          }
        }
        setActivities([syntheticActivity])
      } else {
        setActivities([])
      }
    } finally {
      setIsLoadingActivities(false)
    }
  }

  useEffect(() => {
    if (open && lead) {
      const leadId = lead._id || lead.id
      
      // Fetch full lead data to ensure we have notes
      const fetchFullLeadData = async () => {
        if (leadId) {
          try {
            const response = await LeadsAPI.getById(leadId)
            if (response.success && response.data) {
              setCurrentLead(response.data)
              form.reset({
                status: response.data.status || "new",
                followUpDate: response.data.followUpDate ? (response.data.followUpDate.includes('T') ? response.data.followUpDate.split('T')[0] : response.data.followUpDate) : "",
                notes: response.data.notes || "",
              })
              // Fetch activities with full lead data
              await fetchActivities(leadId, response.data)
              return
            }
          } catch (error) {
            console.error('Error fetching lead data:', error)
          }
        }
        
        // Fallback to using provided lead data
      setCurrentLead(lead)
      form.reset({
        status: lead.status || "new",
        followUpDate: lead.followUpDate ? (lead.followUpDate.includes('T') ? lead.followUpDate.split('T')[0] : lead.followUpDate) : "",
        notes: lead.notes || "",
      })
        
        // Fetch activities when dialog opens
        if (leadId) {
          fetchActivities(leadId, lead)
        }
      }
      
      fetchFullLeadData()
    } else if (!open) {
      // Reset activities when dialog closes
      setActivities([])
    }
  }, [open, lead])

  const handleStatusUpdate = async (values: z.infer<typeof statusUpdateSchema>) => {
    if (!currentLead) return

    try {
      setIsSubmitting(true)
      const leadId = currentLead._id || currentLead.id
      
      const updateData = {
        status: values.status,
        followUpDate: values.followUpDate || undefined,
        notes: values.notes || "",
      }

      const response = await LeadsAPI.update(leadId, updateData)
      
      if (response.success) {
        // Fetch updated lead
        const updatedResponse = await LeadsAPI.getById(leadId)
        if (updatedResponse.success && updatedResponse.data) {
          setCurrentLead(updatedResponse.data)
          if (onLeadUpdated) {
            onLeadUpdated(updatedResponse.data)
          }
        }
        
        // Longer delay to ensure activities are saved in database
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        // Refresh activities after status update
        console.log('Refreshing activities after adding new status...')
        await fetchActivities(leadId, updatedResponse.data)
        console.log('Activities refreshed, new card should appear')
        
        toast({
          title: "Status Added",
          description: "New status and details have been added successfully.",
        })
        setIsStatusDialogOpen(false)
        // Reset form to empty values for next "Add Status" action
        form.reset({
          status: "new",
          followUpDate: "",
          notes: "",
        })
      } else {
        throw new Error(response.error || "Failed to update lead")
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update lead. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const leadToDisplay = currentLead || lead
  if (!leadToDisplay) return null

  const isConverted = leadToDisplay.status === "converted"
  const isAdmin = user?.role === "admin"

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Lead History
                </DialogTitle>
            <DialogDescription className="text-base font-semibold text-foreground pt-1">
              {leadToDisplay.name}
                </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Status and Source Badges - Always Visible */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge 
                className={cn(
                  "px-3 py-1.5 text-sm font-semibold",
                  getStatusColor(leadToDisplay.status || 'new')
                )}
              >
                {getStatusLabel(leadToDisplay.status || 'new')}
              </Badge>
              <Badge 
                className={cn(
                  "px-3 py-1.5 text-sm font-medium",
                  getSourceColor(leadToDisplay.source || 'other')
                )}
                variant="outline"
              >
                {getSourceLabel(leadToDisplay.source || 'other')}
              </Badge>
            </div>

            {/* Lead Summary Section - Read-Only */}
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold">Lead Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Phone Number - Clearly Visible */}
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <span className="text-sm text-muted-foreground">Phone</span>
                    <p className="text-lg font-semibold">{leadToDisplay.phone}</p>
                  </div>
                </div>

                {/* Interested Services */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">Interested Services</span>
                  </div>
                  {leadToDisplay.interestedServices && leadToDisplay.interestedServices.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {leadToDisplay.interestedServices.map((service: any, idx: number) => {
                        const serviceName = service.serviceName || service.serviceId?.name || "Service"
                        return (
                          <Badge 
                            key={idx} 
                            variant="secondary" 
                            className="text-sm px-3 py-1.5 font-normal"
                          >
                            {serviceName}
                          </Badge>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No services selected</p>
                  )}
              </div>
              </CardContent>
            </Card>

            {/* Add Status Button and Activity Timeline - Same Row */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Activity Timeline
              </h3>
              <Button
                onClick={() => {
                  // Reset form to empty/default values for "Add Status"
                  form.reset({
                    status: "new",
                    followUpDate: "",
                    notes: "",
                  })
                  setIsStatusDialogOpen(true)
                }}
                size="lg"
                className="gap-2"
                disabled={isConverted && !isAdmin}
              >
                <Plus className="h-4 w-4" />
                Add Status
              </Button>
            </div>

            {/* Activity Timeline Section */}
            <div>
              <Card className="border-2">
                <CardContent className="p-6">
                {isLoadingActivities ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">Loading activities...</div>
                  </div>
                ) : activities.length > 0 ? (
                  <div className="space-y-6">
                    {(() => {
                      const formatDate = (dateString: string) => {
                        try {
                          const date = new Date(dateString)
                          return format(date, "MMM d, yyyy 'at' h:mm a")
                        } catch {
                          return dateString
                        }
                      }

                      // Group activities from the same "Add Status" submission (within 5 seconds)
                      // Each group becomes one separate card
                      const cards: Array<{
                        id: string // Unique ID for React key (from primary activity)
                        timestamp: string
                        status: string
                        followUpDate: string | null
                        notes: string | null
                      }> = []
                      
                      const processedIndices = new Set<number>()
                      let hasCreatedCard = false
                      
                      console.log('Processing activities:', activities.length, 'total activities')
                      console.log('Activity types:', JSON.stringify(activities.map(a => ({ 
                        type: a.activityType, 
                        id: a._id, 
                        time: a.createdAt, 
                        status: a.newValue?.status || a.newValue,
                        newValue: a.newValue,
                        previousValue: a.previousValue
                      })), null, 2))
                      
                      activities.forEach((activity, index) => {
                        // Skip if already processed as part of a group
                        if (processedIndices.has(index)) {
                          console.log(`Skipping activity ${index} (${activity.activityType}) - already processed`)
                          return
                        }
                        
                        // Process 'created' activity as the first card
                        // IMPORTANT: "created" activity should be standalone and NOT group with later activities
                        if (activity.activityType === 'created') {
                          console.log(`Processing created activity ${index} with ID: ${activity._id}`)
                          hasCreatedCard = true
                          processedIndices.add(index)
                          
                          // Always use "new" status for created activity, regardless of what's stored
                          // This ensures we always show the initial "New" status card
                          let status = 'new'
                          let followUpDate: string | null = null
                          let notes: string | null = null
                          
                          // Don't use status from newValue - always show "new" for creation
                          // The status in newValue might be wrong if lead was created with a different status
                          
                          // Get notes from the created activity's newValue.notes (this is the notes added during creation)
                          // The backend stores notes in newValue.notes when a lead is created
                          if (activity.newValue && activity.newValue.notes) {
                            const notesValue = String(activity.newValue.notes).trim()
                            if (notesValue) {
                              notes = notesValue
                              console.log(`  ✓ Found notes in created activity's newValue.notes: "${notesValue.substring(0, 50)}"`)
                            }
                          }
                          
                          // If no notes in newValue, also check for a notes_updated activity very close to creation (within 2 seconds)
                          // This handles cases where backend creates both a created activity and a separate notes_updated activity
                          // BUT: Only use it if there's no status_changed activity between creation and notes_updated
                          // This ensures notes from "Add Status" submissions don't get grouped with creation
                          if (!notes) {
                            const createdTime = new Date(activity.createdAt).getTime()
                            let notesUpdatedIndex: number | null = null
                            
                            for (let j = index + 1; j < activities.length; j++) {
                              const checkActivity = activities[j]
                              
                              // Stop if we hit a status_changed - that's a separate "Add Status" submission
                              // Notes after a status_changed belong to that status_changed, not creation
                              if (checkActivity.activityType === 'status_changed') {
                                break
                              }
                              
                              // Check for notes_updated within 2 seconds of creation
                              if (checkActivity.activityType === 'notes_updated') {
                                const checkTime = new Date(checkActivity.createdAt).getTime()
                                const timeDiff = Math.abs(checkTime - createdTime)
                                if (timeDiff < 2000) {
                                  // Found notes_updated close to creation
                                  notesUpdatedIndex = j
                                  break
                                } else {
                                  // Notes update is too far from creation
                                  break
                                }
                              }
                            }
                            
                            // Use the notes_updated activity if found and no status_changed is between them
                            if (notesUpdatedIndex !== null) {
                              // Check if there's a status_changed between creation and this notes_updated
                              // If yes, don't use the notes here - let status_changed claim them
                              let hasStatusChangedBefore = false
                              for (let j = index + 1; j < notesUpdatedIndex; j++) {
                                if (activities[j].activityType === 'status_changed') {
                                  hasStatusChangedBefore = true
                                  break
                                }
                              }
                              
                              if (!hasStatusChangedBefore) {
                                // No status_changed between creation and notes - use these notes for creation
                                const notesValue = String(activities[notesUpdatedIndex].newValue).trim()
                                if (notesValue) {
                                  notes = notesValue
                                  processedIndices.add(notesUpdatedIndex)
                                  console.log(`  ✓ Found notes from notes_updated activity at index ${notesUpdatedIndex}: "${notesValue.substring(0, 50)}"`)
                                }
                              }
                              // If there IS a status_changed before notes, don't use notes here
                              // The status_changed will claim them
                            }
                          }
                          
                          // Only look ahead for follow-up date activities created DURING lead creation (within 2 seconds)
                          // DO NOT look for notes_updated - those belong to "Add Status" submissions, not creation
                          // Notes from creation are already in activity.newValue.notes above
                          const activityTime = new Date(activity.createdAt).getTime()
                          for (let i = index + 1; i < activities.length; i++) {
                            if (processedIndices.has(i)) continue
                            
                            const nextActivity = activities[i]
                            const nextActivityTime = new Date(nextActivity.createdAt).getTime()
                            const timeDiff = Math.abs(nextActivityTime - activityTime)
                            
                            // Stop immediately if we hit a status_changed - that's a separate "Add Status" submission
                            // Notes from "Add Status" should NOT be grouped with the "created" activity
                            if (nextActivity.activityType === 'status_changed' || nextActivity.activityType === 'notes_updated') {
                              // Hit a status change or notes update - stop looking, these belong to separate submissions
                              break
                            }
                            
                            // Only group follow-up date if within 2 seconds (very tight window for creation-time activities)
                            if (timeDiff < 2000 && (
                              nextActivity.activityType === 'follow_up_scheduled' ||
                              nextActivity.activityType === 'follow_up_updated'
                            )) {
                              processedIndices.add(i)
                              
                              // Extract follow-up date
                              if (nextActivity.newValue) {
                                try {
                                  const date = new Date(nextActivity.newValue)
                                  followUpDate = format(date, "MMM d, yyyy")
                                } catch (e) {
                                  // Invalid date, skip
                                }
                              }
                            } else if (timeDiff >= 2000) {
                              // Activities are too far apart, stop looking
                              break
                            }
                          }
                          
                          const cardId = activity._id || `created-${activity.createdAt}`
                          console.log(`  Creating created card with ID: ${cardId}, status: ${status}, hasNotes: ${!!notes}, hasFollowUp: ${!!followUpDate}`)
                          cards.push({
                            id: cardId,
                            timestamp: activity.createdAt,
                            status,
                            followUpDate,
                            notes
                          })
                        }
                        // Process 'status_changed' activities as new cards (each "Add Status" action)
                        else if (activity.activityType === 'status_changed') {
                          console.log(`Processing status_changed activity ${index} with ID: ${activity._id}`)
                          processedIndices.add(index)
                          const activityTime = new Date(activity.createdAt).getTime()
                          
                          let status = leadToDisplay.status || 'new'
                          let followUpDate: string | null = null
                          let notes: string | null = null
                          
                          // Get status from this activity
                          if (activity.newValue) {
                            status = String(activity.newValue)
                          }
                          
                          // Find all related activities (notes_updated, follow_up) within 5 seconds
                          // Check both forward and backward to handle any ordering issues
                          console.log(`  Looking for related activities around status_changed ${index} (time: ${new Date(activity.createdAt).toISOString()})`)
                          
                          // Collect all nearby activities first, then process them
                          const nearbyActivities: Array<{index: number, activity: any, timeDiff: number}> = []
                          
                          // Check forward
                          for (let i = index + 1; i < activities.length; i++) {
                            if (processedIndices.has(i)) continue
                            const nextActivity = activities[i]
                            const nextActivityTime = new Date(nextActivity.createdAt).getTime()
                            const timeDiff = Math.abs(nextActivityTime - activityTime)
                            
                            if (nextActivity.activityType === 'status_changed') {
                              break // Stop at next status change
                            }
                            
                            if (timeDiff < 5000 && (
                              nextActivity.activityType === 'notes_updated' ||
                              nextActivity.activityType === 'follow_up_scheduled' ||
                              nextActivity.activityType === 'follow_up_updated'
                            )) {
                              nearbyActivities.push({ index: i, activity: nextActivity, timeDiff })
                            } else if (timeDiff >= 5000) {
                              break
                            }
                          }
                          
                          // Check backward
                          for (let i = index - 1; i >= 0; i--) {
                            if (processedIndices.has(i)) continue
                            const prevActivity = activities[i]
                            const prevActivityTime = new Date(prevActivity.createdAt).getTime()
                            const timeDiff = Math.abs(activityTime - prevActivityTime)
                            
                            // Stop at previous status change, but continue through "created" to find notes
                            // This handles cases where someone adds "New" status with notes after lead creation
                            if (prevActivity.activityType === 'status_changed') {
                              break // Stop at previous status change
                            }
                            
                            // For "created" activity, check if notes_updated is closer to this status_changed
                            // than to the created activity
                            if (prevActivity.activityType === 'created') {
                              // Check if there's a notes_updated between created and this status_changed
                              // that's closer to this status_changed
                              continue // Continue to check activities before created
                            }
                            
                            if (timeDiff < 5000 && (
                              prevActivity.activityType === 'notes_updated' ||
                              prevActivity.activityType === 'follow_up_scheduled' ||
                              prevActivity.activityType === 'follow_up_updated'
                            )) {
                              nearbyActivities.push({ index: i, activity: prevActivity, timeDiff })
                            } else if (timeDiff >= 5000) {
                              break
                            }
                          }
                          
                          // Process nearby activities
                          console.log(`  Found ${nearbyActivities.length} nearby activities:`, nearbyActivities.map(a => ({
                            index: a.index,
                            type: a.activity.activityType,
                            timeDiff: a.timeDiff
                          })))
                          
                          for (const { index: i, activity: nearbyActivity } of nearbyActivities) {
                            if (processedIndices.has(i)) continue
                            
                            processedIndices.add(i)
                            
                            // Extract follow-up date
                            if ((nearbyActivity.activityType === 'follow_up_scheduled' || nearbyActivity.activityType === 'follow_up_updated') && nearbyActivity.newValue) {
                              try {
                                const date = new Date(nearbyActivity.newValue)
                                followUpDate = format(date, "MMM d, yyyy")
                                console.log(`    ✓ Extracted follow-up date from index ${i}: ${followUpDate}`)
                              } catch (e) {
                                console.log(`    ✗ Error parsing follow-up date from index ${i}:`, e)
                              }
                            }
                            
                            // Extract notes (take the first valid one found)
                            if (!notes && nearbyActivity.activityType === 'notes_updated') {
                              console.log(`    Checking notes_updated at index ${i}, newValue:`, nearbyActivity.newValue)
                              if (nearbyActivity.newValue !== undefined && nearbyActivity.newValue !== null) {
                                const notesValue = String(nearbyActivity.newValue).trim()
                                if (notesValue) {
                                  notes = notesValue
                                  console.log(`    ✓ Found notes_updated at index ${i}, value: "${notesValue.substring(0, 50)}"`)
                                } else {
                                  console.log(`    Notes value is empty or whitespace at index ${i}`)
                                }
                              } else {
                                console.log(`    Notes newValue is undefined or null at index ${i}`)
                              }
                            }
                          }
                          
                          const cardId = activity._id || `status-${activity.createdAt}-${index}`
                          console.log(`  Creating card with ID: ${cardId}, status: ${status}, hasNotes: ${!!notes}, hasFollowUp: ${!!followUpDate}`)
                          cards.push({
                            id: cardId,
                            timestamp: activity.createdAt,
                            status,
                            followUpDate,
                            notes
                          })
                        }
                      })

                      // Sort cards by timestamp (oldest first)
                      cards.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                      
                      // Ensure we have a "created" card - if not, add synthetic one at the beginning
                      // IMPORTANT: Don't use current lead notes - only show notes if they were truly from creation
                      if (!hasCreatedCard && leadToDisplay?.createdAt) {
                        console.log('No created card found after processing, adding synthetic one at the beginning')
                        // Don't include notes in synthetic card - we can't know if they were from creation or later updates
                        cards.unshift({
                          id: 'synthetic-created-fallback',
                          timestamp: leadToDisplay.createdAt,
                          status: 'new',
                          followUpDate: null,
                          notes: null // Don't show notes in synthetic card - we don't know when they were added
                        })
                      }
                      
                      console.log(`Created ${cards.length} cards:`, JSON.stringify(cards.map(c => ({ 
                        id: c.id, 
                        status: c.status, 
                        timestamp: c.timestamp,
                        hasNotes: !!c.notes,
                        notes: c.notes ? c.notes.substring(0, 50) : null,
                        hasFollowUp: !!c.followUpDate
                      })), null, 2))
                      
                      return cards.map((card) => {
                        // Debug: Log each card's notes
                        if (card.notes) {
                          console.log(`Card ${card.id} has notes:`, card.notes.substring(0, 100))
                        }
                        return (
                          <div key={card.id} className="border-l-2 border-border pl-4 py-3 space-y-2">
                            {/* Status Badge and Timestamp */}
                            <div className="flex items-center justify-between gap-4">
                              <Badge className={cn("text-xs px-2 py-0.5", getStatusColor(card.status))}>
                                {getStatusLabel(card.status)}
                  </Badge>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(card.timestamp)}
                    </span>
                  </div>

                            {/* Follow-up Date if available */}
                            {card.followUpDate && (
                              <div className={cn(
                                "flex items-center gap-1.5 text-xs",
                                card.status === "converted" 
                                  ? "text-muted-foreground" 
                                  : "text-orange-600 dark:text-orange-500"
                              )}>
                                <CalendarEvent className="h-3.5 w-3.5" />
                                <span>{card.followUpDate}</span>
                              </div>
                            )}

                            {/* Notes if available */}
                            {card.notes && card.notes.trim().length > 0 && (
                              <p className="text-sm text-foreground/70 leading-relaxed">
                                {card.notes}
                              </p>
                )}
              </div>
                        )
                      })
                    })()}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Clock className="h-12 w-12 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground font-medium">No activity history</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Activities will appear here when you update the lead status or add notes.
                    </p>
                </div>
              )}
            </CardContent>
          </Card>
            </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Add Status Dialog */}
    <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
            <DialogTitle>Add Lead Status</DialogTitle>
          <DialogDescription>
              Add a new status and details for {leadToDisplay.name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleStatusUpdate)} className="space-y-4">
              {/* Warning for converted leads */}
              {isConverted && form.watch("status") === "follow-up" && (
                <Alert variant="default" className="border-orange-200 bg-orange-50 dark:bg-orange-950">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-800 dark:text-orange-200">
                    This lead is already converted. Adding a follow-up status may not be necessary.
                    {isAdmin && " As an admin, you can override this."}
                  </AlertDescription>
                </Alert>
              )}

              {/* Status Selection */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-base font-semibold">Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11">
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

              {/* Follow-up Date - Only shown when status is "follow-up" */}
              {form.watch("status") === "follow-up" && (
                <FormField
                  control={form.control}
                  name="followUpDate"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-base font-semibold flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Follow-up Date
                      </FormLabel>
                      <FormControl>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal h-11",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? (
                                format(new Date(field.value + 'T00:00:00'), "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value ? new Date(field.value + 'T00:00:00') : undefined}
                              onSelect={(date) => {
                                if (date) {
                                  const year = date.getFullYear()
                                  const month = String(date.getMonth() + 1).padStart(2, '0')
                                  const day = String(date.getDate()).padStart(2, '0')
                                  field.onChange(`${year}-${month}-${day}`)
                                } else {
                                  field.onChange("")
                                }
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

              {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="space-y-2">
                    <FormLabel className="text-base font-semibold">Details / Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add details, notes, or follow-up information..."
                      rows={5}
                        className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                  onClick={() => {
                    setIsStatusDialogOpen(false)
                    form.reset()
                  }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Status"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    </>
  )
}
