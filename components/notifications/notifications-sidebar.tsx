"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { format, isValid, parse, parseISO } from "date-fns"
import {
  AlertTriangle,
  Bell,
  Calendar,
  CreditCard,
  Globe,
  Loader2,
  MessageCircle,
  Receipt,
  RefreshCw,
  Star,
} from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { NotificationCountBadge, NotificationCountBadgeLabel } from "@/components/notifications/notification-count-badge"
import { FeedbackAPI, NotificationsAPI, WhatsAppInboxAPI, AppointmentsAPI, type NotificationFeedItem, type WebsiteEnquiryNotificationItem } from "@/lib/api"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { useNotificationAppointments } from "@/lib/queries/notification-appointments"
import { useNotificationsFeed } from "@/lib/queries/notifications"
import {
  DISMISSED_ALERTS_STORAGE_PREFIX,
  DISMISSED_APPOINTMENTS_STORAGE_PREFIX,
  DISMISSED_REVIEWS_STORAGE_PREFIX,
  DISMISSED_WEB_ENQUIRIES_STORAGE_PREFIX,
  NOTIFICATION_CENTER_TABS,
  NOTIFICATION_TAB_THEMES,
  formatNotificationBadgeCount,
  notificationDismissStorageKey,
  type NotificationCenterTabId,
} from "@/lib/notification-center"
import { cn } from "@/lib/utils"

type NotificationsSidebarProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  canViewAppointments: boolean
  canViewReviews: boolean
  canViewMessages: boolean
  alerts: {
    notificationItems: NotificationFeedItem[]
    visibleNotificationItems: NotificationFeedItem[]
    notificationsPending: boolean
    notificationsError: boolean
    markAlertRead: (item: NotificationFeedItem) => void
    markAllAlertsRead: () => void
  }
  reviews: {
    reviewItems: ReviewNotificationItem[]
    visibleReviewItems: ReviewNotificationItem[]
    reviewsPending: boolean
    reviewsError: boolean
    markReviewRead: (review: ReviewNotificationItem) => void
    markAllReviewsRead: () => void
  }
  webEnquiries: {
    enquiryItems: WebsiteEnquiryNotificationItem[]
    visibleEnquiryItems: WebsiteEnquiryNotificationItem[]
    enquiriesPending: boolean
    enquiriesError: boolean
    markEnquiryRead: (item: WebsiteEnquiryNotificationItem) => void
    markAllEnquiriesRead: () => void
  }
  appointments: {
    appointmentItems: AppointmentNotificationItem[]
    visibleAppointmentItems: AppointmentNotificationItem[]
    appointmentsPending: boolean
    appointmentsError: boolean
    markAppointmentRead: (appointment: AppointmentNotificationItem) => void
    markAllAppointmentsRead: () => void
  }
}

function NotificationRowIcon({ type }: { type: NotificationFeedItem["type"] }) {
  switch (type) {
    case "low_stock":
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/40">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" aria-hidden />
        </div>
      )
    case "membership_expiry":
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-950/40">
          <CreditCard className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden />
        </div>
      )
    case "package_expiry":
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/40">
          <Receipt className="h-4 w-4 text-violet-700 dark:text-violet-400" aria-hidden />
        </div>
      )
    default:
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-muted">
          <Bell className="h-4 w-4 text-slate-600 dark:text-muted-foreground" aria-hidden />
        </div>
      )
  }
}

function AlertNotificationRow({
  item,
  onMarkRead,
  onNavigate,
}: {
  item: NotificationFeedItem
  onMarkRead: (item: NotificationFeedItem) => void
  onNavigate: (href: string) => void
}) {
  return (
    <div className="group/alert relative flex gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/50">
      <button
        type="button"
        className="flex min-w-0 flex-1 gap-3 text-left"
        onClick={() => onNavigate(item.href)}
      >
        <NotificationRowIcon type={item.type} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold text-foreground leading-tight">{item.title}</p>
          <p className="text-xs text-muted-foreground leading-snug">{item.body}</p>
        </div>
      </button>
      <button
        type="button"
        aria-label={`Mark "${item.title}" as read`}
        className="shrink-0 self-center whitespace-nowrap rounded px-1.5 py-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:underline group-hover/alert:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => onMarkRead(item)}
      >
        Mark read
      </button>
    </div>
  )
}

type ReviewNotificationItem = {
  _id: string
  customerName: string
  rating: number
  reviewText: string
  submittedAt: string
  invoiceNumber: string
}

function ReviewNotificationRow({
  review,
  onMarkRead,
  onNavigate,
}: {
  review: ReviewNotificationItem
  onMarkRead: (review: ReviewNotificationItem) => void
  onNavigate: () => void
}) {
  return (
    <div className="group/review relative flex gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/50">
      <button type="button" className="flex min-w-0 flex-1 gap-3 text-left" onClick={onNavigate}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/40">
          <Star className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 pr-1">
            <p className="text-sm font-semibold text-foreground truncate">{review.customerName}</p>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {review.rating}★
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {review.reviewText?.trim() || "No written review"}
          </p>
          {review.invoiceNumber ? (
            <p className="text-[11px] text-muted-foreground mt-1">Bill {review.invoiceNumber}</p>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        aria-label={`Mark review from ${review.customerName} as read`}
        className="shrink-0 self-center whitespace-nowrap rounded px-1.5 py-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:underline group-hover/review:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => onMarkRead(review)}
      >
        Mark read
      </button>
    </div>
  )
}

function parseAppointmentWallDateTime(dateRaw: unknown, timeRaw: unknown, startAtRaw?: unknown): Date | null {
  if (dateRaw) {
    const dateStr = String(dateRaw).trim()
    const datePart = dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && timeRaw != null && String(timeRaw).trim() !== "") {
      const timeStr = String(timeRaw).trim()
      const ref = new Date()
      const attempts = [
        parse(`${datePart} ${timeStr}`, "yyyy-MM-dd HH:mm", ref),
        parse(`${datePart} ${timeStr}`, "yyyy-MM-dd H:mm", ref),
        parse(`${datePart} ${timeStr}`, "yyyy-MM-dd h:mm a", ref),
      ]
      for (const d of attempts) {
        if (isValid(d)) return d
      }
    }
  }
  if (startAtRaw != null && startAtRaw !== "") {
    const fromStart = typeof startAtRaw === "string" ? parseISO(startAtRaw) : new Date(startAtRaw as Date)
    if (isValid(fromStart)) return fromStart
  }
  if (!dateRaw) return null
  const dateStr = String(dateRaw).trim()
  const datePart = dateStr.length >= 10 ? dateStr.slice(0, 10) : dateStr
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const iso = parseISO(dateStr)
    return isValid(iso) ? iso : null
  }
  if (timeRaw == null || String(timeRaw).trim() === "") {
    const midnight = parseISO(`${datePart}T00:00:00`)
    return isValid(midnight) ? midnight : null
  }
  const timeStr = String(timeRaw).trim()
  const ref = new Date()
  const attempts = [
    parse(`${datePart} ${timeStr}`, "yyyy-MM-dd HH:mm", ref),
    parse(`${datePart} ${timeStr}`, "yyyy-MM-dd H:mm", ref),
    parse(`${datePart} ${timeStr}`, "yyyy-MM-dd h:mm a", ref),
  ]
  for (const d of attempts) {
    if (isValid(d)) return d
  }
  return null
}

type AppointmentNotificationItem = {
  id: string
  clientName: string
  serviceName: string
  staffName: string
  status: string
  timeLabel: string
}

function AppointmentNotificationRow({
  appointment,
  sending,
  onSendReminder,
  onMarkRead,
  onNavigate,
  canSendReminder = true,
}: {
  appointment: AppointmentNotificationItem
  sending: boolean
  onSendReminder: (appointment: AppointmentNotificationItem) => void
  onMarkRead: (appointment: AppointmentNotificationItem) => void
  onNavigate: (appointment: AppointmentNotificationItem) => void
  canSendReminder?: boolean
}) {
  return (
    <div className="group/appointment relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      <button
        type="button"
        className="flex min-w-0 flex-1 gap-3 text-left"
        onClick={() => onNavigate(appointment)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/40">
          <Calendar className="h-4 w-4 text-blue-700 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{appointment.clientName}</p>
          <p className="text-xs text-muted-foreground truncate">
            {appointment.serviceName}
            {appointment.staffName ? ` · ${appointment.staffName}` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{appointment.timeLabel}</p>
        </div>
        <Badge variant="secondary" className="shrink-0 self-start capitalize text-[10px]">
          {appointment.status.replace(/_/g, " ")}
        </Badge>
      </button>
      <div className="flex shrink-0 flex-col items-end justify-center gap-1 self-center opacity-0 transition-opacity group-hover/appointment:opacity-100 focus-within:opacity-100">
        {canSendReminder ? (
          <button
            type="button"
            disabled={sending}
            className="whitespace-nowrap rounded px-1.5 py-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            onClick={() => onSendReminder(appointment)}
          >
            {sending ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Sending…
              </span>
            ) : (
              "Send reminder"
            )}
          </button>
        ) : null}
        <button
          type="button"
          className="whitespace-nowrap rounded px-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => onMarkRead(appointment)}
        >
          Mark read
        </button>
      </div>
    </div>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-[240px]">{description}</p>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

/** Session-scoped dismiss state for operational alerts (shared by sidebar + nav badge). */
export function useDismissedNotificationAlerts(enabled = true) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const dismissedAlertsStorageKey = `${DISMISSED_ALERTS_STORAGE_PREFIX}${branchKey}`
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (typeof window === "undefined" || branchKey === "none") return
    try {
      const raw = sessionStorage.getItem(dismissedAlertsStorageKey)
      if (!raw) {
        setDismissedAlertKeys(new Set())
        return
      }
      const ids = JSON.parse(raw) as unknown
      if (Array.isArray(ids) && ids.every((x) => typeof x === "string")) {
        const v2 = ids.filter((k) => k.includes("::"))
        setDismissedAlertKeys(new Set(v2))
      }
    } catch {
      setDismissedAlertKeys(new Set())
    }
  }, [dismissedAlertsStorageKey, branchKey])

  const persistDismissedAlertKeys = (next: Set<string>) => {
    try {
      if (next.size === 0) {
        sessionStorage.removeItem(dismissedAlertsStorageKey)
      } else {
        sessionStorage.setItem(dismissedAlertsStorageKey, JSON.stringify([...next]))
      }
    } catch {
      /* ignore */
    }
  }

  const {
    data: notificationItems = [],
    isPending: notificationsPending,
    isError: notificationsError,
  } = useNotificationsFeed(enabled)

  const visibleNotificationItems = useMemo(
    () =>
      notificationItems.filter((item) => !dismissedAlertKeys.has(notificationDismissStorageKey(item))),
    [notificationItems, dismissedAlertKeys]
  )

  const markAlertRead = (alert: NotificationFeedItem) => {
    const key = notificationDismissStorageKey(alert)
    setDismissedAlertKeys((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      persistDismissedAlertKeys(next)
      return next
    })
  }

  const markAllAlertsRead = () => {
    setDismissedAlertKeys((prev) => {
      const next = new Set(prev)
      for (const item of notificationItems) {
        next.add(notificationDismissStorageKey(item))
      }
      persistDismissedAlertKeys(next)
      return next
    })
  }

  return {
    notificationItems,
    visibleNotificationItems,
    visibleCount: visibleNotificationItems.length,
    notificationsPending,
    notificationsError,
    markAlertRead,
    markAllAlertsRead,
  }
}

/** Session-scoped dismiss state for review notifications (notification center only). */
export function useDismissedNotificationReviews(enabled = true) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const dismissedReviewsStorageKey = `${DISMISSED_REVIEWS_STORAGE_PREFIX}${branchKey}`
  const [dismissedReviewIds, setDismissedReviewIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (typeof window === "undefined" || branchKey === "none") return
    try {
      const raw = sessionStorage.getItem(dismissedReviewsStorageKey)
      if (!raw) {
        setDismissedReviewIds(new Set())
        return
      }
      const ids = JSON.parse(raw) as unknown
      if (Array.isArray(ids) && ids.every((x) => typeof x === "string")) {
        setDismissedReviewIds(new Set(ids))
      }
    } catch {
      setDismissedReviewIds(new Set())
    }
  }, [dismissedReviewsStorageKey, branchKey])

  const persistDismissedReviewIds = (next: Set<string>) => {
    try {
      if (next.size === 0) {
        sessionStorage.removeItem(dismissedReviewsStorageKey)
      } else {
        sessionStorage.setItem(dismissedReviewsStorageKey, JSON.stringify([...next]))
      }
    } catch {
      /* ignore */
    }
  }

  const { data: reviewItems = [], isPending: reviewsPending, isError: reviewsError } = useQuery({
    queryKey: ["notifications", "reviews-new-items", branchKey],
    queryFn: async () => {
      const res = await FeedbackAPI.list({ status: "new", page: 1, limit: 15 })
      if (!res?.success) throw new Error("Failed to load reviews")
      return (res.data?.items ?? []) as ReviewNotificationItem[]
    },
    enabled: Boolean(user && enabled),
    staleTime: 60_000,
  })

  const visibleReviewItems = useMemo(
    () => reviewItems.filter((item) => !dismissedReviewIds.has(item._id)),
    [reviewItems, dismissedReviewIds]
  )

  const markReviewRead = (review: ReviewNotificationItem) => {
    setDismissedReviewIds((prev) => {
      if (prev.has(review._id)) return prev
      const next = new Set(prev)
      next.add(review._id)
      persistDismissedReviewIds(next)
      return next
    })
  }

  const markAllReviewsRead = () => {
    setDismissedReviewIds((prev) => {
      const next = new Set(prev)
      for (const item of reviewItems) {
        next.add(item._id)
      }
      persistDismissedReviewIds(next)
      return next
    })
  }

  return {
    reviewItems,
    visibleReviewItems,
    visibleCount: visibleReviewItems.length,
    reviewsPending,
    reviewsError,
    markReviewRead,
    markAllReviewsRead,
  }
}

/** Session-scoped dismiss state for website enquiry notifications. */
export function useDismissedWebEnquiries(enabled = true) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const dismissedStorageKey = `${DISMISSED_WEB_ENQUIRIES_STORAGE_PREFIX}${branchKey}`
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (typeof window === "undefined" || branchKey === "none") return
    try {
      const raw = sessionStorage.getItem(dismissedStorageKey)
      if (!raw) {
        setDismissedIds(new Set())
        return
      }
      const ids = JSON.parse(raw) as unknown
      if (Array.isArray(ids) && ids.every((x) => typeof x === "string")) {
        setDismissedIds(new Set(ids))
      }
    } catch {
      setDismissedIds(new Set())
    }
  }, [dismissedStorageKey, branchKey])

  const persistDismissedIds = (next: Set<string>) => {
    try {
      if (next.size === 0) {
        sessionStorage.removeItem(dismissedStorageKey)
      } else {
        sessionStorage.setItem(dismissedStorageKey, JSON.stringify([...next]))
      }
    } catch {
      /* ignore */
    }
  }

  const { data: enquiryItems = [], isPending: enquiriesPending, isError: enquiriesError } = useQuery({
    queryKey: ["notifications", "website-enquiries", branchKey],
    queryFn: async () => {
      const res = await NotificationsAPI.getWebsiteEnquiries()
      if (!res?.success) throw new Error("Failed to load website enquiries")
      return (res.data?.items ?? []) as WebsiteEnquiryNotificationItem[]
    },
    enabled: Boolean(user && enabled),
    staleTime: 60_000,
  })

  const visibleEnquiryItems = useMemo(
    () => enquiryItems.filter((item) => !dismissedIds.has(item.id)),
    [enquiryItems, dismissedIds]
  )

  const markEnquiryRead = (item: WebsiteEnquiryNotificationItem) => {
    setDismissedIds((prev) => {
      if (prev.has(item.id)) return prev
      const next = new Set(prev)
      next.add(item.id)
      persistDismissedIds(next)
      return next
    })
  }

  const markAllEnquiriesRead = () => {
    setDismissedIds((prev) => {
      const next = new Set(prev)
      for (const item of enquiryItems) {
        next.add(item.id)
      }
      persistDismissedIds(next)
      return next
    })
  }

  return {
    enquiryItems,
    visibleEnquiryItems,
    visibleCount: visibleEnquiryItems.length,
    enquiriesPending,
    enquiriesError,
    markEnquiryRead,
    markAllEnquiriesRead,
  }
}

/** Session-scoped dismiss state for upcoming appointment notifications. */
export function useDismissedNotificationAppointments(enabled = true) {
  const { user } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const dismissedStorageKey = `${DISMISSED_APPOINTMENTS_STORAGE_PREFIX}${branchKey}`
  const [dismissedAppointmentIds, setDismissedAppointmentIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (typeof window === "undefined" || branchKey === "none") return
    try {
      const raw = sessionStorage.getItem(dismissedStorageKey)
      if (!raw) {
        setDismissedAppointmentIds(new Set())
        return
      }
      const ids = JSON.parse(raw) as unknown
      if (Array.isArray(ids) && ids.every((x) => typeof x === "string")) {
        setDismissedAppointmentIds(new Set(ids))
      }
    } catch {
      setDismissedAppointmentIds(new Set())
    }
  }, [dismissedStorageKey, branchKey])

  const persistDismissedIds = (next: Set<string>) => {
    try {
      if (next.size === 0) {
        sessionStorage.removeItem(dismissedStorageKey)
      } else {
        sessionStorage.setItem(dismissedStorageKey, JSON.stringify([...next]))
      }
    } catch {
      /* ignore */
    }
  }

  const {
    data: upcomingAppointments = [],
    isPending: appointmentsPending,
    isError: appointmentsError,
  } = useNotificationAppointments(enabled)

  const appointmentItems = useMemo(() => {
    const raw = upcomingAppointments
    return (Array.isArray(raw) ? raw : []).map((a: any) => {
      const appointmentDateTime = parseAppointmentWallDateTime(a?.date, a?.time, a?.startAt)
      const timeLabel =
        appointmentDateTime && isValid(appointmentDateTime)
          ? format(appointmentDateTime, "EEE, MMM d · h:mm a")
          : [a?.date, a?.time].filter(Boolean).join(" ") || "—"
      return {
        id: String(a._id),
        clientName: a?.clientId?.name || "Client",
        serviceName: a?.serviceId?.name || "Service",
        staffName: String(a?.staffName || "").trim(),
        status: a?.status || "scheduled",
        timeLabel,
      }
    })
  }, [upcomingAppointments])

  const visibleAppointmentItems = useMemo(
    () => appointmentItems.filter((item) => !dismissedAppointmentIds.has(item.id)),
    [appointmentItems, dismissedAppointmentIds]
  )

  const markAppointmentRead = (appointment: AppointmentNotificationItem) => {
    setDismissedAppointmentIds((prev) => {
      if (prev.has(appointment.id)) return prev
      const next = new Set(prev)
      next.add(appointment.id)
      persistDismissedIds(next)
      return next
    })
  }

  const markAllAppointmentsRead = () => {
    setDismissedAppointmentIds((prev) => {
      const next = new Set(prev)
      for (const item of appointmentItems) {
        next.add(item.id)
      }
      persistDismissedIds(next)
      return next
    })
  }

  return {
    appointmentItems,
    visibleAppointmentItems,
    visibleCount: visibleAppointmentItems.length,
    appointmentsPending,
    appointmentsError,
    markAppointmentRead,
    markAllAppointmentsRead,
  }
}

function WebEnquiryNotificationRow({
  item,
  onMarkRead,
  onNavigate,
}: {
  item: WebsiteEnquiryNotificationItem
  onMarkRead: (item: WebsiteEnquiryNotificationItem) => void
  onNavigate: (href: string) => void
}) {
  return (
    <div className="group/enquiry relative flex gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/50">
      <button
        type="button"
        className="flex min-w-0 flex-1 gap-3 text-left"
        onClick={() => onNavigate(item.href)}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-950/40">
          <Globe className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 pr-1">
            <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {item.typeLabel}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
            {item.summary || item.phone}
          </p>
          {item.phone && item.summary ? (
            <p className="text-[11px] text-muted-foreground">{item.phone}</p>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        aria-label={`Mark enquiry from ${item.name} as read`}
        className="shrink-0 self-center whitespace-nowrap rounded px-1.5 py-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:underline group-hover/enquiry:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => onMarkRead(item)}
      >
        Mark read
      </button>
    </div>
  )
}

export function NotificationsSidebar({
  open,
  onOpenChange,
  canViewAppointments,
  canViewReviews,
  canViewMessages,
  alerts,
  reviews,
  webEnquiries,
  appointments,
}: NotificationsSidebarProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { user, hasPermission } = useAuth()
  const branchKey = user?.branchId ?? user?._id ?? "none"
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)

  const visibleTabs = useMemo(
    () =>
      NOTIFICATION_CENTER_TABS.filter((tab) => {
        if (tab.id === "alerts") return true
        if (tab.id === "webEnquiries") return true
        if (tab.id === "appointments") return canViewAppointments
        if (tab.id === "reviews") return canViewReviews
        if (tab.id === "messages") return canViewMessages
        return false
      }),
    [canViewAppointments, canViewReviews, canViewMessages]
  )

  const [activeTab, setActiveTab] = useState<NotificationCenterTabId>("alerts")
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (!visibleTabs.some((tab) => tab.id === activeTab)) {
        setActiveTab(visibleTabs[0]?.id ?? "alerts")
      }
    }
    prevOpenRef.current = open
  }, [open, activeTab, visibleTabs])

  const {
    notificationItems,
    visibleNotificationItems,
    notificationsPending,
    notificationsError,
    markAlertRead,
    markAllAlertsRead,
  } = alerts

  const {
    reviewItems,
    visibleReviewItems,
    reviewsPending,
    reviewsError,
    markReviewRead,
    markAllReviewsRead,
  } = reviews

  const {
    enquiryItems,
    visibleEnquiryItems,
    enquiriesPending,
    enquiriesError,
    markEnquiryRead,
    markAllEnquiriesRead,
  } = webEnquiries

  const {
    appointmentItems,
    visibleAppointmentItems,
    appointmentsPending,
    appointmentsError,
    markAppointmentRead,
    markAllAppointmentsRead,
  } = appointments

  const { data: inboxThreads = [], isPending: messagesPending, isError: messagesError } = useQuery({
    queryKey: ["notifications", "messages-unread", branchKey],
    queryFn: async () => {
      const res = await WhatsAppInboxAPI.list({ filter: "unread", limit: 20 })
      if (!res?.success || !Array.isArray(res.data)) return []
      return res.data as Array<{
        _id: string
        unreadCount?: number
        lastInboundPreview?: string | null
        lastInboundAt?: string | null
        client?: { name?: string; phone?: string } | null
        recipientPhone?: string
      }>
    },
    enabled: Boolean(user && canViewMessages && open && activeTab === "messages"),
    staleTime: 30_000,
  })

  const tabCounts: Record<NotificationCenterTabId, number> = {
    alerts: visibleNotificationItems.length,
    webEnquiries: visibleEnquiryItems.length,
    appointments: visibleAppointmentItems.length,
    reviews: visibleReviewItems.length,
    messages: inboxThreads.reduce((sum, row) => sum + Number(row?.unreadCount || 0), 0),
  }

  const handleSendAppointmentReminder = async (appointment: AppointmentNotificationItem) => {
    setSendingReminderId(appointment.id)
    try {
      const res = await AppointmentsAPI.sendReminder(appointment.id)
      if (res?.success) {
        toast({
          title: "Reminder sent",
          description: `WhatsApp reminder sent to ${appointment.clientName}.`,
        })
        markAppointmentRead(appointment)
      } else {
        throw new Error(typeof res?.error === "string" ? res.error : "Failed to send reminder")
      }
    } catch (err: unknown) {
      toast({
        title: "Could not send reminder",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setSendingReminderId(null)
    }
  }

  const handleAppointmentNavigate = (appointment: AppointmentNotificationItem) => {
    handleNavigate(
      `/appointments?appointment=${encodeURIComponent(appointment.id)}&panel=details`
    )
  }

  const activeTabMeta = visibleTabs.find((tab) => tab.id === activeTab) ?? visibleTabs[0]
  const canSendAppointmentReminder = hasPermission("appointments", "edit")

  const handleNavigate = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  const refreshActiveTab = () => {
    if (activeTab === "alerts") {
      queryClient.invalidateQueries({ queryKey: ["notifications", "feed"] })
      return
    }
    if (activeTab === "webEnquiries") {
      queryClient.invalidateQueries({ queryKey: ["notifications", "website-enquiries"] })
      return
    }
    if (activeTab === "appointments") {
      queryClient.invalidateQueries({ queryKey: ["notifications", "appointments-upcoming"] })
      return
    }
    if (activeTab === "reviews") {
      queryClient.invalidateQueries({ queryKey: ["notifications", "reviews-new"] })
      queryClient.invalidateQueries({ queryKey: ["notifications", "reviews-new-items"] })
      return
    }
    if (activeTab === "messages") {
      queryClient.invalidateQueries({ queryKey: ["notifications", "messages-unread"] })
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "inbox", "unread-total"] })
    }
  }

  const renderTabContent = () => {
    if (activeTab === "alerts") {
      if (notificationsPending) return <LoadingState label="Loading alerts…" />
      if (notificationsError) {
        return <EmptyState title="Could not load alerts" description="Try again in a moment." />
      }
      if (visibleNotificationItems.length === 0) {
        return (
          <EmptyState
            title={notificationItems.length > 0 ? "All alerts marked read" : "You're all caught up"}
            description={
              notificationItems.length > 0
                ? "Alerts return automatically when underlying counts change."
                : "No operational alerts right now."
            }
          />
        )
      }
      return (
        <div className="space-y-1 p-2">
          {visibleNotificationItems.map((item) => (
            <AlertNotificationRow
              key={item.id}
              item={item}
              onMarkRead={markAlertRead}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      )
    }

    if (activeTab === "webEnquiries") {
      if (enquiriesPending) return <LoadingState label="Loading web enquiries…" />
      if (enquiriesError) {
        return <EmptyState title="Could not load web enquiries" description="Try again in a moment." />
      }
      if (visibleEnquiryItems.length === 0) {
        return (
          <EmptyState
            title={enquiryItems.length > 0 ? "All web enquiries marked read" : "No new web enquiries"}
            description={
              enquiryItems.length > 0
                ? "Marked items stay in Settings until you update their status there."
                : "Contact forms and product requests from your mini-website appear here."
            }
          />
        )
      }
      return (
        <div className="space-y-1 p-2">
          {visibleEnquiryItems.map((item) => (
            <WebEnquiryNotificationRow
              key={item.id}
              item={item}
              onMarkRead={markEnquiryRead}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      )
    }

    if (activeTab === "appointments") {
      if (appointmentsPending) return <LoadingState label="Loading appointments…" />
      if (appointmentsError) {
        return <EmptyState title="Could not load appointments" description="Try again in a moment." />
      }
      if (visibleAppointmentItems.length === 0) {
        return (
          <EmptyState
            title={appointmentItems.length > 0 ? "All appointments marked read" : "No upcoming appointments"}
            description={
              appointmentItems.length > 0
                ? "Dismissed appointments reappear when the list refreshes with new visits."
                : "Scheduled visits for the next 7 days will appear here."
            }
          />
        )
      }
      return (
        <div className="divide-y divide-border">
          {visibleAppointmentItems.map((apt) => (
            <AppointmentNotificationRow
              key={apt.id}
              appointment={apt}
              sending={sendingReminderId === apt.id}
              canSendReminder={canSendAppointmentReminder}
              onSendReminder={handleSendAppointmentReminder}
              onMarkRead={markAppointmentRead}
              onNavigate={handleAppointmentNavigate}
            />
          ))}
        </div>
      )
    }

    if (activeTab === "reviews") {
      if (reviewsPending) return <LoadingState label="Loading reviews…" />
      if (reviewsError) {
        return <EmptyState title="Could not load reviews" description="Try again in a moment." />
      }
      if (visibleReviewItems.length === 0) {
        return (
          <EmptyState
            title={reviewItems.length > 0 ? "All reviews marked read" : "No new reviews"}
            description={
              reviewItems.length > 0
                ? "Marked reviews stay in Feedback until you change their status there."
                : "Customer feedback with status “new” will show up here."
            }
          />
        )
      }
      return (
        <div className="space-y-1 p-2">
          {visibleReviewItems.map((review) => (
            <ReviewNotificationRow
              key={review._id}
              review={review}
              onMarkRead={markReviewRead}
              onNavigate={() => handleNavigate("/settings?section=feedback")}
            />
          ))}
        </div>
      )
    }

    if (activeTab === "messages") {
      if (messagesPending) return <LoadingState label="Loading messages…" />
      if (messagesError) {
        return <EmptyState title="Could not load messages" description="Try again in a moment." />
      }
      if (inboxThreads.length === 0) {
        return (
          <EmptyState
            title="No unread messages"
            description="WhatsApp conversations with unread replies appear here."
          />
        )
      }
      return (
        <div className="divide-y divide-border">
          {inboxThreads.map((thread) => {
            const name = thread.client?.name || thread.recipientPhone || "Unknown"
            return (
              <button
                key={thread._id}
                type="button"
                className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                onClick={() => handleNavigate("/whatsapp/inbox")}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40">
                  <MessageCircle className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                    {(thread.unreadCount ?? 0) > 0 ? (
                      <NotificationCountBadge count={thread.unreadCount ?? 0} />
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {thread.lastInboundPreview || "No preview"}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )
    }

    return null
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4 text-left space-y-1">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>Alerts, web enquiries, appointments, reviews, and messages in one place.</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1">
          <nav
            className="flex w-[7.5rem] shrink-0 flex-col gap-1 border-r border-border bg-muted/30 p-2 sm:w-36"
            aria-label="Notification categories"
          >
            {visibleTabs.map((tab) => {
              const Icon = tab.icon
              const theme = NOTIFICATION_TAB_THEMES[tab.id]
              const count = tabCounts[tab.id]
              const badge = formatNotificationBadgeCount(count)
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "group relative flex flex-col items-center gap-1.5 rounded-lg px-2 py-2.5 text-center text-xs font-medium transition-all duration-200",
                    isActive
                      ? theme.active
                      : cn("text-muted-foreground", theme.hover, "hover:text-foreground")
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-300 ease-out group-hover:scale-105",
                      theme.iconWrap
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-translate-y-px",
                        theme.icon
                      )}
                      aria-hidden
                      strokeWidth={isActive ? 2.25 : 2}
                    />
                  </span>
                  <span className="leading-tight">{tab.label}</span>
                  {badge ? (
                    <NotificationCountBadgeLabel
                      label={badge}
                      className="absolute -right-0.5 -top-0.5"
                    />
                  ) : null}
                </button>
              )
            })}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{activeTabMeta?.label}</p>
                <p className="text-xs text-muted-foreground">
                  {activeTab === "alerts"
                    ? "Operational reminders from your salon data."
                    : activeTab === "webEnquiries"
                      ? "New submissions from your public mini-website."
                      : activeTab === "appointments"
                        ? "Upcoming visits for the next 7 days."
                        : activeTab === "reviews"
                          ? "New customer feedback awaiting review."
                          : "Unread WhatsApp conversations."}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {activeTab === "alerts" && visibleNotificationItems.length > 0 ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={markAllAlertsRead}>
                    Mark all read
                  </Button>
                ) : null}
                {activeTab === "reviews" && visibleReviewItems.length > 0 ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={markAllReviewsRead}>
                    Mark all read
                  </Button>
                ) : null}
                {activeTab === "webEnquiries" && visibleEnquiryItems.length > 0 ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={markAllEnquiriesRead}>
                    Mark all read
                  </Button>
                ) : null}
                {activeTab === "appointments" && visibleAppointmentItems.length > 0 ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={markAllAppointmentsRead}>
                    Mark all read
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Refresh"
                  onClick={refreshActiveTab}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              {renderTabContent()}
            </ScrollArea>

            <div className="border-t border-border px-4 py-3">
              {activeTab === "appointments" ? (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/appointments" onClick={() => onOpenChange(false)}>
                    Open calendar
                  </Link>
                </Button>
              ) : null}
              {activeTab === "reviews" ? (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/settings?section=feedback" onClick={() => onOpenChange(false)}>
                    Open feedback inbox
                  </Link>
                </Button>
              ) : null}
              {activeTab === "webEnquiries" ? (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/settings?section=website&tab=enquiries" onClick={() => onOpenChange(false)}>
                    Open website enquiries
                  </Link>
                </Button>
              ) : null}
              {activeTab === "messages" ? (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/whatsapp/inbox" onClick={() => onOpenChange(false)}>
                    Open WhatsApp inbox
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Aggregate badge count for the top-nav bell (alerts + appointments + reviews + messages). */
export function useNotificationCenterBadgeCount(options: {
  canViewAppointments: boolean
  canViewReviews: boolean
  canViewMessages: boolean
  alertCount: number
  webEnquiryCount: number
  reviewCount: number
  appointmentCount: number
}) {
  const { user } = useAuth()

  const { data: inboxUnreadTotal = 0 } = useQuery({
    queryKey: ["whatsapp", "inbox", "unread-total"],
    queryFn: async () => {
      try {
        const res = await WhatsAppInboxAPI.list({ filter: "unread", limit: 100 })
        if (!res.success || !Array.isArray(res.data)) return 0
        return res.data.reduce((sum, row) => sum + Number(row?.unreadCount || 0), 0)
      } catch {
        return 0
      }
    },
    enabled: Boolean(user && options.canViewMessages),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  })

  const total =
    options.alertCount +
    options.webEnquiryCount +
    (options.canViewAppointments ? options.appointmentCount : 0) +
    (options.canViewReviews ? options.reviewCount : 0) +
    (options.canViewMessages ? inboxUnreadTotal : 0)

  return formatNotificationBadgeCount(total)
}
