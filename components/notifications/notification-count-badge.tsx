import { Badge } from "@/components/ui/badge"
import { formatNotificationBadgeCount } from "@/lib/notification-center"
import { cn } from "@/lib/utils"

export function notificationCountBadgeClasses(
  label: string,
  size: "sm" | "md" = "sm"
) {
  const dim =
    size === "sm"
      ? label.length > 1
        ? "size-5 text-[8px]"
        : "size-4 text-[9px]"
      : label.length > 1
        ? "size-6 text-[9px]"
        : "size-5 text-[10px]"
  return cn("flex items-center justify-center p-0 font-bold leading-none", dim)
}

type NotificationCountBadgeProps = {
  count: number
  className?: string
  size?: "sm" | "md"
}

export function NotificationCountBadge({
  count,
  className,
  size = "sm",
}: NotificationCountBadgeProps) {
  const label = formatNotificationBadgeCount(count)
  if (!label) return null
  return (
    <Badge
      variant="destructive"
      className={cn(notificationCountBadgeClasses(label, size), className)}
    >
      {label}
    </Badge>
  )
}

type NotificationCountBadgeLabelProps = {
  label: string
  className?: string
  size?: "sm" | "md"
}

export function NotificationCountBadgeLabel({
  label,
  className,
  size = "sm",
}: NotificationCountBadgeLabelProps) {
  if (!label) return null
  return (
    <Badge
      variant="destructive"
      className={cn(notificationCountBadgeClasses(label, size), className)}
    >
      {label}
    </Badge>
  )
}
