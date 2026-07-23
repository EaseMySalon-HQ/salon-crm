import type { LucideIcon } from "lucide-react"
import { Bell, Calendar, Globe, MessageCircle, Star } from "lucide-react"

import type { NotificationFeedItem } from "@/lib/api"

export type NotificationCenterTabId = "alerts" | "webEnquiries" | "appointments" | "reviews" | "messages"

export type NotificationCenterTab = {
  id: NotificationCenterTabId
  label: string
  icon: LucideIcon
}

export const NOTIFICATION_CENTER_TABS: NotificationCenterTab[] = [
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "webEnquiries", label: "Web Enquiries", icon: Globe },
  { id: "appointments", label: "Appointments", icon: Calendar },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "messages", label: "Messages", icon: MessageCircle },
]

/** Soft per-tab tints for the notifications sidebar rail. */
export const NOTIFICATION_TAB_THEMES: Record<
  NotificationCenterTabId,
  {
    iconWrap: string
    icon: string
    active: string
    hover: string
  }
> = {
  alerts: {
    iconWrap: "bg-amber-100 dark:bg-amber-950/40",
    icon: "text-amber-700 dark:text-amber-400",
    active:
      "bg-amber-50/90 dark:bg-amber-950/25 text-amber-950 dark:text-amber-50 shadow-sm ring-1 ring-amber-200/70 dark:ring-amber-500/30",
    hover: "hover:bg-amber-50/55 dark:hover:bg-amber-950/15",
  },
  webEnquiries: {
    iconWrap: "bg-teal-100 dark:bg-teal-950/40",
    icon: "text-teal-700 dark:text-teal-400",
    active:
      "bg-teal-50/90 dark:bg-teal-950/25 text-teal-950 dark:text-teal-50 shadow-sm ring-1 ring-teal-200/70 dark:ring-teal-500/30",
    hover: "hover:bg-teal-50/55 dark:hover:bg-teal-950/15",
  },
  appointments: {
    iconWrap: "bg-blue-100 dark:bg-blue-950/40",
    icon: "text-blue-700 dark:text-blue-400",
    active:
      "bg-blue-50/90 dark:bg-blue-950/25 text-blue-950 dark:text-blue-50 shadow-sm ring-1 ring-blue-200/70 dark:ring-blue-500/30",
    hover: "hover:bg-blue-50/55 dark:hover:bg-blue-950/15",
  },
  reviews: {
    iconWrap: "bg-violet-100 dark:bg-violet-950/40",
    icon: "text-violet-700 dark:text-violet-400",
    active:
      "bg-violet-50/90 dark:bg-violet-950/25 text-violet-950 dark:text-violet-50 shadow-sm ring-1 ring-violet-200/70 dark:ring-violet-500/30",
    hover: "hover:bg-violet-50/55 dark:hover:bg-violet-950/15",
  },
  messages: {
    iconWrap: "bg-emerald-100 dark:bg-emerald-950/40",
    icon: "text-emerald-700 dark:text-emerald-400",
    active:
      "bg-emerald-50/90 dark:bg-emerald-950/25 text-emerald-950 dark:text-emerald-50 shadow-sm ring-1 ring-emerald-200/70 dark:ring-emerald-500/30",
    hover: "hover:bg-emerald-50/55 dark:hover:bg-emerald-950/15",
  },
}

/** v2 entries are `alertId::fingerprint` so the same logical alert can reappear when server counts update. */
export const DISMISSED_ALERTS_STORAGE_PREFIX = "salon-ems-alerts-dismissed-v2:"

export const DISMISSED_REVIEWS_STORAGE_PREFIX = "salon-ems-reviews-dismissed:"

export const DISMISSED_WEB_ENQUIRIES_STORAGE_PREFIX = "salon-ems-web-enquiries-dismissed:"

export function notificationDismissStorageKey(item: NotificationFeedItem): string {
  return `${item.id}::${item.fingerprint}`
}

export function formatNotificationBadgeCount(count: number): string {
  if (count <= 0) return ""
  return count > 9 ? "9+" : String(count)
}
