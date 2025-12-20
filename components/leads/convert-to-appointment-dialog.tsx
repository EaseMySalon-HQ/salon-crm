"use client"

import { useState, useEffect } from "react"
import { Calendar, Clock, Users, FileText } from "lucide-react"
import { LeadsAPI } from "@/lib/api"
import { StaffAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface ConvertToAppointmentDialogProps {
  lead: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ConvertToAppointmentDialog({
  lead,
  open,
  onOpenChange,
  onSuccess,
}: ConvertToAppointmentDialogProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [staff, setStaff] = useState<any[]>([])
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [formData, setFormData] = useState({
    date: "",
    time: "",
    staffId: "none",
    notes: "",
  })

  useEffect(() => {
    if (open && lead) {
      // Set default date to today
      const today = new Date()
      const dateStr = today.toISOString().split('T')[0]
      
      // Set default time to next hour
      const nextHour = new Date()
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0)
      const timeStr = `${String(nextHour.getHours()).padStart(2, '0')}:${String(nextHour.getMinutes()).padStart(2, '0')}`

      setFormData({
        date: dateStr,
        time: timeStr,
        staffId: lead.assignedStaffId?._id || lead.assignedStaffId || "none",
        notes: lead.notes || "",
      })
    }
    if (open) {
      loadStaff()
    }
  }, [open, lead])

  const loadStaff = async () => {
    try {
      setLoadingStaff(true)
      const response = await StaffAPI.getAll({ limit: 1000 })
      if (response.success && response.data) {
        const staffList = Array.isArray(response.data) ? response.data : (response.data?.data || [])
        setStaff(staffList)
      }
    } catch (error) {
      console.error('Error loading staff:', error)
    } finally {
      setLoadingStaff(false)
    }
  }

  const handleSubmit = async () => {
    if (!formData.date || !formData.time) {
      toast({
        title: "Missing Information",
        description: "Please select a date and time for the appointment.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      const leadId = lead._id || lead.id
      if (!leadId) {
        throw new Error("Lead ID not found")
      }

      const response = await LeadsAPI.convertToAppointment(leadId, {
        date: formData.date,
        time: formData.time,
        staffId: formData.staffId === "none" ? undefined : formData.staffId,
        notes: formData.notes,
      })

      if (response.success) {
        toast({
          title: "Lead Converted",
          description: "Lead has been successfully converted to appointment(s).",
        })
        onOpenChange(false)
        onSuccess()
        // Optionally navigate to appointments page
        // router.push('/appointments')
      } else {
        throw new Error(response.error || "Failed to convert lead")
      }
    } catch (error: any) {
      console.error('Error converting lead:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to convert lead to appointment. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const interestedServices = lead?.interestedServices || []
  const servicesList = interestedServices
    .map((s: any) => {
      const name = s.serviceName || s.serviceId?.name || "Service"
      const isCustom = !s.serviceId || (!s.serviceId?._id && !s.serviceId)
      return isCustom ? `${name} (custom)` : name
    })
    .join(", ")
  
  const hasCustomServices = interestedServices.some((s: any) => 
    !s.serviceId || (!s.serviceId?._id && !s.serviceId)
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Convert Lead to Appointment</DialogTitle>
          <DialogDescription>
            Create appointment(s) for {lead?.name}. This will convert the lead and create appointment(s) for the interested services.
            {hasCustomServices && (
              <span className="block mt-2 text-amber-600 text-sm">
                Note: Custom services (without service ID) will be skipped. You can add them manually after conversion.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Lead Information</Label>
            <div className="text-sm text-gray-600 space-y-1">
              <div><strong>Name:</strong> {lead?.name}</div>
              <div><strong>Phone:</strong> {lead?.phone}</div>
              {lead?.email && <div><strong>Email:</strong> {lead?.email}</div>}
              {interestedServices.length > 0 && (
                <div>
                  <strong>Interested Services:</strong> {servicesList}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date *
              </Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time *
              </Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="staffId" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Assign Staff
            </Label>
            <Select
              value={formData.staffId || "none"}
              onValueChange={(value) => setFormData({ ...formData, staffId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select staff member (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s._id || s.id} value={s._id || s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes
            </Label>
            <Textarea
              id="notes"
              placeholder="Add any additional notes for the appointment..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Converting..." : "Convert to Appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

