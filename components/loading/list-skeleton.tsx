import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type ListSkeletonProps = {
  rows?: number
  showAvatar?: boolean
  className?: string
}

export function ListSkeleton({ rows = 6, showAvatar = true, className }: ListSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white/80 px-4 py-3"
        >
          {showAvatar ? <Skeleton className="h-10 w-10 shrink-0 rounded-full" /> : null}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  )
}
