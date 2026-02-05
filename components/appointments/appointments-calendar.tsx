"use client"

import { useState, useEffect, forwardRef, useImperativeHandle } from "react"
import { useRouter } from "next/navigation"
import { addDays, format, startOfWeek, addWeeks, subWeeks } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { AppointmentsAPI } from "@/lib/api"

interface Appointment {
  _id: string
  clientId: {
    _id: string
    name: string
    phone: string
    email?: string
  }
  serviceId: {
    _id: string
    name: string
    price: number
    duration: number
  }
  staffId: {
    _id: string
    name: string
    role?: string
  }
  date: string
  time: string
  duration: number
  status: "scheduled" | "confirmed" | "arrived" | "service_started" | "completed" | "cancelled"
  notes?: string
  price: number
  createdAt: string
}

interface AppointmentsCalendarProps {
  onShowCancelled?: () => void
  initialAppointmentId?: string
}

export const AppointmentsCalendar = forwardRef<
  { showCancelledModal: () => void; showUpcomingModal: () => void },
  AppointmentsCalendarProps
>(({ onShowCancelled, initialAppointmentId }, ref) => {
  const router = useRouter()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(initialAppointmentId ?? null)

  useEffect(() => {
    setPendingAppointmentId(initialAppointmentId ?? null)
  }, [initialAppointmentId])
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [cancelling, setCancelling] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showCancelledModal, setShowCancelledModal] = useState(false)
  const [showUpcomingModal, setShowUpcomingModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [appointmentToCancel, setAppointmentToCancel] = useState<string | null>(null)
  const [draggingAppointmentId, setDraggingAppointmentId] = useState<string | null>(null)
  const [dropTargetColumn, setDropTargetColumn] = useState<string | null>(null)
  const [updatingFromDrop, setUpdatingFromDrop] = useState(false)
  const [justDropped, setJustDropped] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const date = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${date}`
  })
  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 })

  useImperativeHandle(ref, () => ({
    showCancelledModal: () => setShowCancelledModal(true),
    showUpcomingModal: () => setShowUpcomingModal(true),
  }))

  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i))

  const goToPreviousWeek = () => setCurrentDate(subWeeks(currentDate, 1))
  const goToNextWeek = () => setCurrentDate(addWeeks(currentDate, 1))
  const goToToday = () => setCurrentDate(new Date())
  
  // Handle date selection
  const handleDateClick = (day: Date) => {
    // Use local date to avoid timezone issues
    const year = day.getFullYear()
    const month = String(day.getMonth() + 1).padStart(2, '0')
    const date = String(day.getDate()).padStart(2, '0')
    const dateString = `${year}-${month}-${date}`
    console.log('Selected date:', dateString, 'Day:', day.getDate())
    setSelectedDate(dateString)
  }
  
  // Check if a date is selected
  const isSelectedDate = (day: Date) => {
    // Use local date to avoid timezone issues
    const year = day.getFullYear()
    const month = String(day.getMonth() + 1).padStart(2, '0')
    const date = String(day.getDate()).padStart(2, '0')
    const dayString = `${year}-${month}-${date}`
    return dayString === selectedDate
  }

  // Fetch appointments from API
  const fetchAppointments = async () => {
    try {
      setLoading(true)
      const response = await AppointmentsAPI.getAll({
        limit: 100, // Get more appointments to cover the week
        status: undefined // Get all statuses
      })
      
      if (response.success) {
        setAppointments(response.data || [])
      } else {
        console.error('Failed to fetch appointments:', response.error)
      }
    } catch (error) {
      console.error('Error fetching appointments:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch appointments when component mounts or date changes
  useEffect(() => {
    fetchAppointments()
  }, [currentDate])

  const getAppointmentsForDate = (date: Date) => {
    const dateString = format(date, "yyyy-MM-dd")
    return appointments.filter((appointment) => {
      if (!appointment?.date) return false
      const normalized = appointment.date.length >= 10 ? appointment.date.slice(0, 10) : appointment.date
      return normalized === dateString
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-amber-500"
      case "arrived":
      case "confirmed":
        return "bg-blue-500"
      case "service_started":
        return "bg-purple-500"
      case "completed":
        return "bg-emerald-500"
      case "cancelled":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusCardFill = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-amber-100 border-amber-300 hover:bg-amber-200/80"
      case "arrived":
      case "confirmed":
        return "bg-blue-100 border-blue-300 hover:bg-blue-200/80"
      case "service_started":
        return "bg-purple-100 border-purple-300 hover:bg-purple-200/80"
      case "completed":
        return "bg-emerald-100 border-emerald-300 hover:bg-emerald-200/80"
      case "cancelled":
        return "bg-red-100 border-red-300 hover:bg-red-200/80"
      default:
        return "bg-slate-100 border-slate-300 hover:bg-slate-200/80"
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-amber-100 text-amber-700 border border-amber-200"
      case "arrived":
      case "confirmed":
        return "bg-blue-100 text-blue-700 border border-blue-200"
      case "service_started":
        return "bg-purple-100 text-purple-700 border border-purple-200"
      case "completed":
        return "bg-emerald-100 text-emerald-700 border border-emerald-200"
      case "cancelled":
        return "bg-red-100 text-red-700 border border-red-200"
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "scheduled":
        return "Scheduled"
      case "arrived":
      case "confirmed":
        return "Arrived"
      case "service_started":
        return "Service Started"
      case "completed":
        return "Completed"
      case "cancelled":
        return "Cancelled"
      default:
        return status
    }
  }

  const toggleDayExpansion = (day: Date) => {
    const dayKey = day.toISOString().split('T')[0]
    setExpandedDays(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dayKey)) {
        newSet.delete(dayKey)
      } else {
        newSet.add(dayKey)
      }
      return newSet
    })
  }

  const getSelectedDateAppointments = () => {
    return appointments
      .filter(apt => {
        // Convert appointment date to YYYY-MM-DD format for comparison
        const aptDate = new Date(apt.date)
        const year = aptDate.getFullYear()
        const month = String(aptDate.getMonth() + 1).padStart(2, '0')
        const date = String(aptDate.getDate()).padStart(2, '0')
        const aptDateString = `${year}-${month}-${date}`
        
        return aptDateString === selectedDate && apt.status !== 'cancelled'
      })
      .sort((a, b) => {
        // Sort by time for selected date appointments
        const timeA = a.time || '00:00'
        const timeB = b.time || '00:00'
        return timeA.localeCompare(timeB)
      })
  }

  useEffect(() => {
    if (!pendingAppointmentId || appointments.length === 0) return
    const match = appointments.find((apt) => apt._id === pendingAppointmentId)
    if (!match) return

    setSelectedAppointment(match)
    setShowDetails(true)

    if (match.date) {
      const matchDate = new Date(match.date)
      const year = matchDate.getFullYear()
      const month = String(matchDate.getMonth() + 1).padStart(2, '0')
      const day = String(matchDate.getDate()).padStart(2, '0')
      setSelectedDate(`${year}-${month}-${day}`)
      setCurrentDate(matchDate)
    }

    setPendingAppointmentId(null)
  }, [pendingAppointmentId, appointments])

  const isAppointmentOnSelectedDate = (apt: Appointment) => {
    const aptNorm = apt.date?.length >= 10 ? apt.date.slice(0, 10) : apt.date
    return aptNorm === selectedDate
  }

  // First column: only scheduled (no arrived, service_started, completed, cancelled)
  const getSelectedDateAppointmentsForColumns = () => {
    return appointments
      .filter(apt => isAppointmentOnSelectedDate(apt) && apt.status === 'scheduled')
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  const getArrivedAppointments = () => {
    return appointments
      .filter(apt => isAppointmentOnSelectedDate(apt) && (apt.status === 'arrived' || apt.status === 'confirmed'))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  const getServiceStartedAppointments = () => {
    return appointments
      .filter(apt => isAppointmentOnSelectedDate(apt) && apt.status === 'service_started')
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  const getCompletedAppointments = () => {
    return appointments
      .filter(apt => isAppointmentOnSelectedDate(apt) && apt.status === 'completed')
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  const getCancelledAppointmentsForDate = () => {
    return appointments
      .filter(apt => isAppointmentOnSelectedDate(apt) && apt.status === 'cancelled')
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }

  const getUpcomingAppointments = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return appointments
      .filter(apt => {
        const aptDate = new Date(apt.date)
        aptDate.setHours(0, 0, 0, 0)
        return aptDate >= today && apt.status !== 'cancelled'
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }

  const getCancelledAppointments = () => {
    return appointments
      .filter(apt => apt.status === 'cancelled')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }

  const selectedDateLabel = selectedDate ? format(new Date(selectedDate + 'T12:00:00'), 'EEE, MMM d, yyyy') : ''

  const isToday = (day: Date) => {
    const today = new Date()
    return day.toDateString() === today.toDateString()
  }

  const handleCancelClick = (appointmentId: string) => {
    setAppointmentToCancel(appointmentId)
    setShowCancelConfirm(true)
  }

  const confirmCancelAppointment = async () => {
    if (!appointmentToCancel) return

    setCancelling(true)
    try {
      const response = await AppointmentsAPI.update(appointmentToCancel, { status: 'cancelled' })
      if (response.success) {
        // Refresh appointments
        await fetchAppointments()
        setShowDetails(false)
        setShowCancelConfirm(false)
        setAppointmentToCancel(null)
        // Show success message
        alert('Appointment cancelled successfully')
      } else {
        alert('Failed to cancel appointment. Please try again.')
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error)
      alert('Failed to cancel appointment. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  const cancelCancelAppointment = () => {
    setShowCancelConfirm(false)
    setAppointmentToCancel(null)
  }

  const handleMarkStatus = async (newStatus: 'arrived' | 'service_started') => {
    if (!selectedAppointment) return
    setUpdatingStatus(true)
    try {
      const res = await AppointmentsAPI.update(selectedAppointment._id, { status: newStatus })
      if (res?.success) {
        const list = appointments.map((a) =>
          a._id === selectedAppointment._id ? { ...a, status: newStatus } : a
        )
        setAppointments(list)
        setSelectedAppointment({ ...selectedAppointment, status: newStatus })
      } else {
        alert('Failed to update status. Please try again.')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  type ColumnStatusKey = 'scheduled' | 'arrived' | 'service_started' | 'completed' | 'cancelled'

  const handleCardDragStart = (e: React.DragEvent, appointment: Appointment) => {
    if (appointment.status === 'completed') return
    setDraggingAppointmentId(appointment._id)
    e.dataTransfer.setData('application/json', JSON.stringify({ id: appointment._id, status: appointment.status }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleCardDragEnd = () => {
    setDraggingAppointmentId(null)
    setDropTargetColumn(null)
  }

  const handleColumnDragOver = (e: React.DragEvent, statusKey: ColumnStatusKey) => {
    if (statusKey === 'completed') return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetColumn(statusKey)
  }

  const handleColumnDragLeave = () => {
    setDropTargetColumn(null)
  }

  const handleColumnDrop = async (e: React.DragEvent, targetStatusKey: ColumnStatusKey) => {
    e.preventDefault()
    setDropTargetColumn(null)
    if (targetStatusKey === 'completed') return
    let data: { id: string; status: string }
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json'))
    } catch {
      return
    }
    if (!data?.id) return
    setUpdatingFromDrop(true)
    setJustDropped(true)
    setTimeout(() => setJustDropped(false), 200)
    try {
      const res = await AppointmentsAPI.update(data.id, { status: targetStatusKey })
      if (res?.success) await fetchAppointments()
      else alert('Failed to update status. Please try again.')
    } catch (err) {
      console.error(err)
      alert('Failed to update status. Please try again.')
    } finally {
      setUpdatingFromDrop(false)
      setDraggingAppointmentId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={goToPreviousWeek} className="rounded-xl border-slate-200 hover:border-indigo-500 hover:bg-indigo-50">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday} className="rounded-xl border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 font-medium">
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={goToNextWeek} className="rounded-xl border-slate-200 hover:border-indigo-500 hover:bg-indigo-50">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {format(startDate, "MMMM yyyy")}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-6">
        {weekDays.map((day) => {
          const isSelected = isSelectedDate(day)
          const isTodayDate = isToday(day)
          
          return (
            <Card 
              key={day.toISOString()} 
              className={`min-h-[120px] bg-gradient-to-br from-white to-slate-50/50 border-slate-200 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl cursor-pointer hover:border-indigo-300 ${
                isSelected ? 'ring-2 ring-emerald-500 border-emerald-300 shadow-emerald-200' : 
                isTodayDate ? 'ring-2 ring-indigo-500 border-indigo-300 shadow-indigo-200' : ''
              }`}
              onClick={() => handleDateClick(day)}
            >
              <CardHeader className={`p-6 rounded-t-2xl transition-all duration-200 ${
                isSelected 
                  ? 'bg-gradient-to-r from-emerald-100 to-teal-100 hover:from-emerald-200 hover:to-teal-200' 
                  : isTodayDate 
                  ? 'bg-gradient-to-r from-indigo-100 to-purple-100 hover:from-indigo-200 hover:to-purple-200' 
                  : 'bg-gradient-to-r from-slate-50 to-blue-50 hover:from-indigo-50 hover:to-purple-50'
              }`}>
                <CardTitle className="text-sm">
                  <div className="text-center">
                    <div className={`font-semibold uppercase tracking-wide ${
                      isSelected ? 'text-emerald-700' : 
                      isTodayDate ? 'text-indigo-700' : 'text-slate-600'
                    }`}>{format(day, "EEE")}</div>
                    <div className={`text-4xl font-bold mt-2 ${
                      isSelected ? 'text-emerald-800' : 
                      isTodayDate ? 'text-indigo-800' : 'text-slate-800'
                    }`}>{format(day, "d")}</div>
                    {isSelected && (
                      <div className="mt-2">
                        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs">
                          Selected
                        </Badge>
                      </div>
                    )}
                    {isTodayDate && !isSelected && (
                      <div className="mt-2">
                        <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs">
                          Today
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
            </Card>
          )
        })}
      </div>

      {/* Appointments for selected date - 5 columns by status */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-slate-700 mb-4">
          Appointments for {selectedDateLabel || 'selected date'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            statusKey: 'scheduled' as ColumnStatusKey,
            title: 'Appointments',
            subtitle: selectedDateLabel || 'Select a date',
            list: getSelectedDateAppointmentsForColumns(),
            headerClass: 'bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200',
            titleClass: 'text-amber-700',
            subtitleClass: 'text-amber-600',
            cardClass: 'bg-amber-50/50 border-amber-200 hover:bg-amber-100/50',
            timeBadgeClass: 'text-amber-700 border-amber-300 bg-amber-50',
            avatarClass: 'border-amber-200 bg-amber-100 text-amber-700',
            metaClass: 'text-amber-600',
            emptyIcon: '📅',
            emptyTitle: 'No appointments',
            emptySub: `No appointments for this date.`,
          },
          {
            statusKey: 'arrived' as ColumnStatusKey,
            title: 'Arrived',
            subtitle: selectedDateLabel || 'Select a date',
            list: getArrivedAppointments(),
            headerClass: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200',
            titleClass: 'text-blue-700',
            subtitleClass: 'text-blue-600',
            cardClass: 'bg-blue-50/50 border-blue-200 hover:bg-blue-100/50',
            timeBadgeClass: 'text-blue-700 border-blue-300 bg-blue-50',
            avatarClass: 'border-blue-200 bg-blue-100 text-blue-700',
            metaClass: 'text-blue-600',
            emptyIcon: '👋',
            emptyTitle: 'No arrived',
            emptySub: 'No clients marked as arrived.',
          },
          {
            statusKey: 'service_started' as ColumnStatusKey,
            title: 'Service Started',
            subtitle: selectedDateLabel || 'Select a date',
            list: getServiceStartedAppointments(),
            headerClass: 'bg-gradient-to-r from-purple-50 to-violet-50 border-b border-purple-200',
            titleClass: 'text-purple-700',
            subtitleClass: 'text-purple-600',
            cardClass: 'bg-purple-50/50 border-purple-200 hover:bg-purple-100/50',
            timeBadgeClass: 'text-purple-700 border-purple-300 bg-purple-50',
            avatarClass: 'border-purple-200 bg-purple-100 text-purple-700',
            metaClass: 'text-purple-600',
            emptyIcon: '✂️',
            emptyTitle: 'None in progress',
            emptySub: 'No services started yet.',
          },
          {
            statusKey: 'completed' as ColumnStatusKey,
            title: 'Completed',
            subtitle: selectedDateLabel || 'Select a date',
            list: getCompletedAppointments(),
            headerClass: 'bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200',
            titleClass: 'text-emerald-700',
            subtitleClass: 'text-emerald-600',
            cardClass: 'bg-emerald-50/50 border-emerald-200 hover:bg-emerald-100/50',
            timeBadgeClass: 'text-emerald-700 border-emerald-300 bg-emerald-50',
            avatarClass: 'border-emerald-200 bg-emerald-100 text-emerald-700',
            metaClass: 'text-emerald-600',
            emptyIcon: '✅',
            emptyTitle: 'No completed',
            emptySub: 'No completed appointments.',
          },
          {
            statusKey: 'cancelled' as ColumnStatusKey,
            title: 'Cancelled',
            subtitle: selectedDateLabel || 'Select a date',
            list: getCancelledAppointmentsForDate(),
            headerClass: 'bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200',
            titleClass: 'text-red-700',
            subtitleClass: 'text-red-600',
            cardClass: 'bg-red-50/50 border-red-200 hover:bg-red-100/50',
            timeBadgeClass: 'text-red-700 border-red-300 bg-red-50',
            avatarClass: 'border-red-200 bg-red-100 text-red-700',
            metaClass: 'text-red-600',
            emptyIcon: '❌',
            emptyTitle: 'No cancelled',
            emptySub: 'No cancelled appointments.',
          },
        ].map((col) => (
          <Card key={col.title} className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
            <CardHeader className={`${col.headerClass} p-3`}>
              <CardTitle className={`text-sm font-semibold ${col.titleClass}`}>{col.title}</CardTitle>
              <p className={`text-xs mt-0.5 ${col.subtitleClass}`}>{col.subtitle}</p>
            </CardHeader>
            <CardContent className="p-3">
              <div
                className={`space-y-2 max-h-[420px] overflow-y-auto min-h-[120px] rounded-lg transition-colors ${
                  dropTargetColumn === col.statusKey ? 'ring-2 ring-indigo-400 bg-indigo-50/50' : ''
                } ${updatingFromDrop ? 'pointer-events-none opacity-70' : ''}`}
                onDragOver={(e) => handleColumnDragOver(e, col.statusKey)}
                onDragLeave={handleColumnDragLeave}
                onDrop={(e) => handleColumnDrop(e, col.statusKey)}
              >
                {col.list.length > 0 ? (
                  col.list.map((appointment) => {
                    const anyAppt: any = appointment as any
                    const serviceName = anyAppt?.serviceId?.name || 'Service'
                    const clientName = anyAppt?.clientId?.name || 'Client'
                    const clientInitial = clientName?.charAt?.(0) || '?'
                    const staffName = anyAppt?.staffId?.name || 'Unassigned Staff'
                    const price = anyAppt?.price ?? 0
                    const duration = anyAppt?.duration ?? 0
                    const isDraggable = appointment.status !== 'completed'
                    const isDragging = draggingAppointmentId === appointment._id
                    return (
                      <Card
                        key={appointment._id}
                        draggable={isDraggable}
                        onDragStart={(e) => isDraggable && handleCardDragStart(e, appointment)}
                        onDragEnd={handleCardDragEnd}
                        className={`${getStatusCardFill(appointment.status)} border rounded-lg transition-colors duration-200 overflow-hidden flex flex-col ${
                          isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                        } ${isDragging ? 'opacity-50' : ''}`}
                        onClick={() => {
                          if (justDropped) return
                          setSelectedAppointment(appointment)
                          setShowDetails(true)
                        }}
                      >
                        <div className={`h-1.5 shrink-0 rounded-t-lg ${getStatusColor(appointment.status)}`} aria-hidden />
                        <CardContent className="p-2.5 flex-1">
                          <div className="flex items-center justify-between mb-1.5">
                            <Badge className={`text-[10px] font-semibold ${getStatusBadgeClass(appointment.status)} border-0`}>
                              {getStatusText(appointment.status)}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] ${col.timeBadgeClass}`}>
                              {appointment.time}
                            </Badge>
                          </div>
                          <div className="font-medium text-slate-800 text-sm truncate">{serviceName}</div>
                          <div className="flex items-center mt-1">
                            <Avatar className={`h-5 w-5 mr-1.5 border ${col.avatarClass}`}>
                              <AvatarFallback className="text-[10px]">{clientInitial}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-slate-800 truncate">{clientName}</div>
                              <div className={`text-[10px] ${col.metaClass}`}>{staffName}</div>
                            </div>
                          </div>
                          <div className="flex justify-between text-[10px] mt-1">
                            <span className={`font-medium ${col.metaClass}`}>₹{price} • {duration}m</span>
                            <span className="text-slate-500">{format(new Date(appointment.date), 'MMM d')}</span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                ) : (
                  <div className={`text-center py-6 rounded-lg border border-dashed ${col.cardClass} border-2`}>
                    <div className="text-2xl mb-2">{col.emptyIcon}</div>
                    <div className={`text-xs font-medium ${col.titleClass}`}>{col.emptyTitle}</div>
                    <div className={`text-[10px] mt-0.5 ${col.subtitleClass}`}>{col.emptySub}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        </div>
      </div>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl">
          <DialogHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-2xl p-6 -m-6 mb-6">
            <DialogTitle className="text-xl font-bold">Appointment Details</DialogTitle>
            <DialogDescription className="text-indigo-100 mt-2">
              {selectedAppointment ? `${getStatusText(selectedAppointment.status)} • ${selectedAppointment.time} • ${selectedAppointment.date}` : ''}
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-3 text-sm">
              {(() => {
                const a: any = selectedAppointment as any
                const serviceName = a?.serviceId?.name || 'Service'
                const clientName = a?.clientId?.name || 'Client'
                const staffName = a?.staffId?.name || 'Unassigned Staff'
                const staffRole = a?.staffId?.role
                const duration = a?.duration ?? 0
                const price = a?.price ?? 0
                return (
                  <>
                    <div className="font-medium">{serviceName}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-muted-foreground">Client</div>
                        <div>{clientName}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Staff</div>
                        <div>
                          {staffName}
                          {staffRole ? ` (${staffRole})` : ''}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Duration</div>
                        <div>{duration} min</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Price</div>
                        <div>₹{price}</div>
                      </div>
                    </div>
                    {a?.notes && (
                      <>
                        <Separator />
                        <div>
                          <div className="text-muted-foreground mb-1">Notes</div>
                          <div>{a.notes}</div>
                        </div>
                      </>
                    )}
                  </>
                )
              })()}
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!selectedAppointment) return
                    const anySel: any = selectedAppointment as any
                    handleCancelClick(anySel._id)
                  }}
                  disabled={cancelling || selectedAppointment?.status === 'cancelled'}
                  className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Appointment'}
                </Button>
                {/* Mark as Arrived / Service Started - show when status is scheduled, confirmed, or arrived */}
                {selectedAppointment &&
                  (selectedAppointment.status === 'scheduled' ||
                    selectedAppointment.status === 'confirmed' ||
                    selectedAppointment.status === 'arrived') ? (
                  selectedAppointment.status === 'scheduled' ||
                  selectedAppointment.status === 'confirmed' ? (
                    <Button
                      onClick={() => handleMarkStatus('arrived')}
                      disabled={updatingStatus}
                      className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                    >
                      {updatingStatus ? 'Updating...' : 'Mark as Arrived'}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleMarkStatus('service_started')}
                      disabled={updatingStatus}
                      className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                    >
                      {updatingStatus ? 'Updating...' : 'Service Started'}
                    </Button>
                  )
                ) : (
                  <span className="shrink-0" aria-hidden />
                )}
                <Button
                  onClick={() => {
                    if (!selectedAppointment) return
                    const anySel: any = selectedAppointment as any
                    
                    // Prepare appointment data to pass to quick sale
                    const appointmentData = {
                      appointmentId: anySel._id,
                      clientId: anySel.clientId?._id || anySel.clientId,
                      clientName: anySel.clientId?.name || '',
                      serviceId: anySel.serviceId?._id || anySel.serviceId,
                      serviceName: anySel.serviceId?.name || '',
                      servicePrice: anySel.price || 0,
                      serviceDuration: anySel.duration || 0,
                      staffId: anySel.staffId?._id || anySel.staffId,
                      staffName: anySel.staffId?.name || '',
                    }
                    
                    // Encode data as base64 to pass via URL
                    const encodedData = btoa(JSON.stringify(appointmentData))
                    
                    setShowDetails(false)
                    router.push(`/quick-sale?appointment=${encodedData}`)
                  }}
                  className="shrink-0"
                >
                  Raise Sale
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upcoming Appointments Modal */}
      <Dialog open={showUpcomingModal} onOpenChange={setShowUpcomingModal}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl max-w-6xl max-h-[80vh] overflow-hidden">
          <DialogHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-t-2xl p-6 -m-6 mb-6">
            <DialogTitle className="text-xl font-bold">Upcoming Appointments</DialogTitle>
            <DialogDescription className="text-indigo-100 mt-2">
              All future appointments (today onwards)
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {getUpcomingAppointments().length > 0 ? (
                getUpcomingAppointments().map((appointment) => {
                  const anyAppt: any = appointment as any
                  const serviceName = anyAppt?.serviceId?.name || 'Service'
                  const clientName = anyAppt?.clientId?.name || 'Client'
                  const clientInitial = clientName?.charAt?.(0) || '?'
                  const staffName = anyAppt?.staffId?.name || 'Unassigned Staff'
                  const price = anyAppt?.price ?? 0
                  const duration = anyAppt?.duration ?? 0
                  return (
                    <Card
                      key={appointment._id}
                      className="bg-indigo-50/50 border-indigo-200 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl cursor-pointer"
                      onClick={() => {
                        setSelectedAppointment(appointment)
                        setShowDetails(true)
                        setShowUpcomingModal(false)
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <Badge className={`text-xs font-semibold ${getStatusBadgeClass(appointment.status)} border-0`}>
                            {getStatusText(appointment.status)}
                          </Badge>
                          <Badge variant="outline" className="text-indigo-700 border-indigo-300 bg-indigo-50">
                            {appointment.time}
                          </Badge>
                        </div>
                        <div className="space-y-3">
                          <div className="font-semibold text-slate-800 text-lg">{serviceName}</div>
                          <div className="flex items-center">
                            <Avatar className="h-8 w-8 mr-3 border border-indigo-200">
                              <AvatarFallback className="text-sm font-medium bg-indigo-100 text-indigo-700">{clientInitial}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-slate-800">{clientName}</div>
                              <div className="text-sm text-indigo-600">{staffName}</div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-600 bg-indigo-100 rounded-lg px-3 py-1">
                              ₹{price} • {duration}min
                            </div>
                            <div className="text-sm text-slate-500">{format(new Date(appointment.date), 'MMM dd, yyyy')}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              ) : (
                <div className="col-span-full text-center py-12">
                  <div className="text-6xl mb-4">📅</div>
                  <div className="text-xl font-semibold text-slate-600 mb-2">No Upcoming Appointments</div>
                  <div className="text-slate-500">You don&apos;t have any future appointments scheduled.</div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Modal */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl max-w-md">
          <DialogHeader className="text-center pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">Cancel Appointment</DialogTitle>
            <DialogDescription className="text-slate-600 mt-2">
              Are you sure you want to cancel this appointment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={cancelCancelAppointment}
              disabled={cancelling}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancelAppointment}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelling ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Cancelling...
                </>
              ) : (
                'Yes, Cancel Appointment'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})

AppointmentsCalendar.displayName = 'AppointmentsCalendar'
