import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type TableSkeletonProps = {
  rows?: number
  columns?: number
  showHeader?: boolean
  showToolbar?: boolean
  className?: string
}

export function TableSkeleton({
  rows = 8,
  columns = 5,
  showHeader = true,
  showToolbar = true,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {showToolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-10 w-64 max-w-full rounded-md" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-md" />
            <Skeleton className="h-10 w-24 rounded-md" />
          </div>
        </div>
      ) : null}
      <div className="rounded-xl border border-slate-100 bg-white/80 overflow-hidden">
        {showHeader ? (
          <div className="flex gap-4 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
        ) : null}
        <div className="divide-y divide-slate-100">
          {Array.from({ length: rows }).map((_, row) => (
            <div key={row} className="flex gap-4 px-4 py-3.5">
              {Array.from({ length: columns }).map((_, col) => (
                <Skeleton
                  key={col}
                  className={cn("h-4 flex-1", col === 0 && "max-w-[140px]")}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
