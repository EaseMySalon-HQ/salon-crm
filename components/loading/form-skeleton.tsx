import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type FormSkeletonProps = {
  fields?: number
  columns?: 1 | 2
  showHeader?: boolean
  className?: string
}

export function FormSkeleton({
  fields = 6,
  columns = 2,
  showHeader = true,
  className,
}: FormSkeletonProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {showHeader ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      ) : null}
      <div
        className={cn(
          "grid gap-5",
          columns === 2 ? "md:grid-cols-2" : "grid-cols-1"
        )}
      >
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
      </div>
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-10 w-28 rounded-md" />
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>
    </div>
  )
}
