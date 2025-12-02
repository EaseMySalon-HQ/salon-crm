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
  status: "scheduled" | "confirmed" | "completed" | "cancelled"
  notes?: string
  price: number
  createdAt: string
}

interface AppointmentsCalendarProps {
  onShowCancelled?: () => void
  initialAppointmentId?: string
}

export const AppointmentsCalendar = forwardRef<{ showCancelledModal: () => void }, AppointmentsCalendarProps>(({ onShowCancelled, initialAppointmentId }, ref) => {
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
  const [showCancelledModal, setShowCancelledModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [appointmentToCancel, setAppointmentToCancel] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const date = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${date}`
  })
  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 })

  useImperativeHandle(ref, () => ({
    showCancelledModal: () => setShowCancelledModal(true)
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
      case "confirmed":
        return "bg-green-500"
      case "scheduled":
        return "bg-blue-500"
      case "completed":
        return "bg-gray-500"
      case "cancelled":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-emerald-100 text-emerald-700 border border-emerald-200"
      case "confirmed":
        return "bg-blue-100 text-blue-700 border border-blue-200"
      case "scheduled":
        return "bg-amber-100 text-amber-700 border border-amber-200"
      case "cancelled":
        return "bg-red-100 text-red-700 border border-red-200"
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "confirmed":
        return "Confirmed"
      case "scheduled":
        return "Scheduled"
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
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Most recent first
      .slice(0, 5) // Show last 5 cancelled appointments
  }

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

      {/* Appointments Sections - Side by Side */}
      <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Selected Date Appointments Card */}
        <Card className="bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 rounded-xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg font-semibold text-emerald-700">
                  Selected Date Appointments
                </CardTitle>
                <p className="text-emerald-600 text-sm mt-1">Appointments for selected date</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  aria-label="Select date to view appointments"
                  className="text-sm px-3 py-1 border border-emerald-300 rounded-lg bg-white text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <div className="bg-emerald-100 rounded-lg p-2">
                  <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-4">
            <div className="space-y-3">
              {getSelectedDateAppointments().length > 0 ? (
                getSelectedDateAppointments().map((appointment) => {
                  const anyAppt: any = appointment as any
                  const serviceName = anyAppt?.serviceId?.name || 'Service'
                  const clientName = anyAppt?.clientId?.name || 'Client'
                  const clientInitial = clientName?.charAt?.(0) || '?'
                  const staffName = anyAppt?.staffId?.name || 'Unassigned Staff'
                  const staffRole = anyAppt?.staffId?.role
                  const price = anyAppt?.price ?? 0
                  const duration = anyAppt?.duration ?? 0
                  
                  return (
                    <Card key={appointment._id} className="bg-emerald-50/50 border border-emerald-200 hover:bg-emerald-100/50 transition-colors duration-200 rounded-lg cursor-pointer"
                      onClick={() => {
                        setSelectedAppointment(appointment)
                        setShowDetails(true)
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <Badge className={`text-xs font-semibold ${getStatusBadgeClass(appointment.status)} border-0`}>
                            {getStatusText(appointment.status)}
                          </Badge>
                          <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">
                            {appointment.time}
                          </Badge>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="font-medium text-slate-800">{serviceName}</div>
                          
                          <div className="flex items-center">
                            <Avatar className="h-6 w-6 mr-2 border border-emerald-200">
                              <AvatarImage src="/placeholder.svg" />
                              <AvatarFallback className="text-xs font-medium bg-emerald-100 text-emerald-700">{clientInitial}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-sm font-medium text-slate-800">{clientName}</div>
                              <div className="text-xs text-emerald-600">{staffName}</div>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-emerald-600 font-medium">₹{price} • {duration}min</span>
                            <span className="text-slate-500">{format(new Date(appointment.date), 'MMM dd, yyyy')}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              ) : (
                <div className="text-center py-8 bg-emerald-50 rounded-lg border border-dashed border-emerald-200">
                  <div className="text-4xl mb-3">📅</div>
                  <div className="text-sm font-medium text-emerald-700 mb-1">No Appointments on {format(new Date(selectedDate), 'MMM dd, yyyy')}</div>
                  <div className="text-xs text-emerald-600">You don't have any appointments scheduled for this date.</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Appointments Card */}
        <Card className="bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 rounded-xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-indigo-700">
                  Upcoming Appointments
                </CardTitle>
                <p className="text-indigo-600 text-sm mt-1">All your future appointments (today onwards)</p>
              </div>
              <div className="bg-indigo-100 rounded-lg p-2">
                <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-4">
            <div className="space-y-3">
              {getUpcomingAppointments().length > 0 ? (
                getUpcomingAppointments().map((appointment) => {
                  const anyAppt: any = appointment as any
                  const serviceName = anyAppt?.serviceId?.name || 'Service'
                  const clientName = anyAppt?.clientId?.name || 'Client'
                  const clientInitial = clientName?.charAt?.(0) || '?'
                  const staffName = anyAppt?.staffId?.name || 'Unassigned Staff'
                  const staffRole = anyAppt?.staffId?.role
                  const price = anyAppt?.price ?? 0
                  const duration = anyAppt?.duration ?? 0
                  
                  return (
                    <Card key={appointment._id} className="bg-indigo-50/50 border border-indigo-200 hover:bg-indigo-100/50 transition-colors duration-200 rounded-lg cursor-pointer"
                      onClick={() => {
                        setSelectedAppointment(appointment)
                        setShowDetails(true)
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <Badge className={`text-xs font-semibold ${getStatusBadgeClass(appointment.status)} border-0`}>
                            {getStatusText(appointment.status)}
                          </Badge>
                          <Badge variant="outline" className="text-indigo-700 border-indigo-300 bg-indigo-50">
                            {appointment.time}
                          </Badge>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="font-medium text-slate-800">{serviceName}</div>
                          
                          <div className="flex items-center">
                            <Avatar className="h-6 w-6 mr-2 border border-indigo-200">
                              <AvatarImage src="/placeholder.svg" />
                              <AvatarFallback className="text-xs font-medium bg-indigo-100 text-indigo-700">{clientInitial}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-sm font-medium text-slate-800">{clientName}</div>
                              <div className="text-xs text-indigo-600">{staffName}</div>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-indigo-600 font-medium">₹{price} • {duration}min</span>
                            <span className="text-slate-500">{format(new Date(appointment.date), 'MMM dd, yyyy')}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              ) : (
                <div className="text-center py-8 bg-indigo-50 rounded-lg border border-dashed border-indigo-200">
                  <div className="text-4xl mb-3">📅</div>
                  <div className="text-sm font-medium text-indigo-700 mb-1">No Upcoming Appointments</div>
                  <div className="text-xs text-indigo-600">You don't have any future appointments scheduled.</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
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
              <div className="flex justify-between">
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!selectedAppointment) return
                    const anySel: any = selectedAppointment as any
                    handleCancelClick(anySel._id)
                  }}
                  disabled={cancelling || selectedAppointment?.status === 'cancelled'}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Appointment'}
                </Button>
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
                >
                  Raise Sale
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancelled Appointments Modal */}
      <Dialog open={showCancelledModal} onOpenChange={setShowCancelledModal}>
        <DialogContent className="rounded-2xl border-0 shadow-2xl max-w-6xl max-h-[80vh] overflow-hidden">
          <DialogHeader className="bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-t-2xl p-6 -m-6 mb-6">
            <DialogTitle className="text-xl font-bold">Cancelled Appointments</DialogTitle>
            <DialogDescription className="text-red-100 mt-2">
              View all cancelled appointments
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {getCancelledAppointments().length > 0 ? (
                getCancelledAppointments().map((appointment) => {
                  const anyAppt: any = appointment as any
                  const serviceName = anyAppt?.serviceId?.name || 'Service'
                  const clientName = anyAppt?.clientId?.name || 'Client'
                  const clientInitial = clientName?.charAt?.(0) || '?'
                  const staffName = anyAppt?.staffId?.name || 'Unassigned Staff'
                  const staffRole = anyAppt?.staffId?.role
                  const price = anyAppt?.price ?? 0
                  const duration = anyAppt?.duration ?? 0
                  
                  return (
                    <Card key={appointment._id} className="bg-gradient-to-br from-red-50 to-orange-50 border-red-200 shadow-lg hover:shadow-xl transition-all duration-300 rounded-2xl cursor-pointer"
                      onClick={() => {
                        setSelectedAppointment(appointment)
                        setShowDetails(true)
                        setShowCancelledModal(false)
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <Badge className="bg-red-100 text-red-700 border-red-200 font-medium">
                            {appointment.time}
                          </Badge>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full bg-red-500 shadow-sm" />
                            <span className="text-xs font-medium text-red-600">Cancelled</span>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="font-semibold text-slate-800 text-lg line-through opacity-75">{serviceName}</div>
                          
                          <div className="flex items-center">
                            <Avatar className="h-8 w-8 mr-3 border border-red-200">
                              <AvatarImage src="/placeholder.svg" />
                              <AvatarFallback className="text-sm font-medium bg-red-100 text-red-700">{clientInitial}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-slate-800">{clientName}</div>
                              <div className="text-sm text-slate-500">{staffName} {staffRole ? `(${staffRole})` : ''}</div>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-600 bg-red-100 rounded-lg px-3 py-1">
                              ₹{price} • {duration}min
                            </div>
                            <div className="text-sm text-slate-500">
                              {format(new Date(appointment.date), 'MMM dd, yyyy')}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              ) : (
                <div className="col-span-full text-center py-12">
                  <div className="text-6xl mb-4">❌</div>
                  <div className="text-xl font-semibold text-slate-600 mb-2">No Cancelled Appointments</div>
                  <div className="text-slate-500">You don't have any cancelled appointments.</div>
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
