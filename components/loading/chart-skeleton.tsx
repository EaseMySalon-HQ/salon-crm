import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type ChartSkeletonProps = {
  height?: number | string
  className?: string
}

export function ChartSkeleton({ height = 400, className }: ChartSkeletonProps) {
  return (
    <Skeleton
      className={cn("w-full rounded-xl", className)}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    />
  )
}
