import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type CardSkeletonProps = {
  count?: number
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "h-20",
  md: "h-28",
  lg: "h-36",
}

export function CardSkeleton({ count = 4, size = "md", className }: CardSkeletonProps) {
  return (
    <div className={cn("grid gap-4 sm:gap-6", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-lg", sizeClasses[size])} />
      ))}
    </div>
  )
}

export function CardSkeletonGrid({
  count = 4,
  size = "md",
  columns = "md:grid-cols-2 lg:grid-cols-4",
  className,
}: CardSkeletonProps & { columns?: string }) {
  return (
    <div className={cn("grid gap-4 sm:gap-6", columns, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-lg", sizeClasses[size])} />
      ))}
    </div>
  )
}
