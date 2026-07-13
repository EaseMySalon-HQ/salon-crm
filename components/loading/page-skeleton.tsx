import { Skeleton } from "@/components/ui/skeleton"
import { CardSkeletonGrid } from "@/components/loading/card-skeleton"
import { ChartSkeleton } from "@/components/loading/chart-skeleton"
import { FormSkeleton } from "@/components/loading/form-skeleton"
import { TableSkeleton } from "@/components/loading/table-skeleton"
import { cn } from "@/lib/utils"

export type PageSkeletonVariant =
  | "dashboard"
  | "table"
  | "form"
  | "calendar"
  | "default"

type PageSkeletonProps = {
  variant?: PageSkeletonVariant
  className?: string
}

const shellClass = "min-h-[calc(100vh-8rem)] bg-background p-6"

function DashboardPageSkeleton() {
  return (
    <div className={cn(shellClass, "space-y-8")}>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <CardSkeletonGrid count={4} size="md" />
      <div className="grid gap-6 lg:grid-cols-7">
        <ChartSkeleton height={400} className="lg:col-span-4" />
        <ChartSkeleton height={400} className="lg:col-span-3" />
      </div>
      <CardSkeletonGrid count={3} size="sm" columns="md:grid-cols-3" />
      <CardSkeletonGrid count={3} size="md" columns="md:grid-cols-3" />
      <CardSkeletonGrid count={4} size="md" columns="md:grid-cols-2 lg:grid-cols-4" />
    </div>
  )
}

function TablePageSkeleton() {
  return (
    <div className={cn(shellClass, "space-y-6")}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <CardSkeletonGrid count={4} size="sm" columns="grid-cols-2 md:grid-cols-4" />
      <TableSkeleton rows={10} columns={6} />
    </div>
  )
}

function FormPageSkeleton() {
  return (
    <div className={cn(shellClass)}>
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <div className="rounded-xl border border-slate-100 bg-white/80 p-6 shadow-sm">
            <FormSkeleton fields={8} columns={2} />
          </div>
          <div className="rounded-xl border border-slate-100 bg-white/80 p-6 shadow-sm space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}

function CalendarPageSkeleton() {
  return (
    <div className={cn(shellClass, "space-y-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-48 rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-10 w-36 rounded-md" />
        </div>
      </div>
      <div className="rounded-xl border border-slate-100 bg-white/80 overflow-hidden">
        <div className="flex border-b border-slate-100">
          <Skeleton className="h-12 w-20 shrink-0 rounded-none" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 flex-1 rounded-none" />
          ))}
        </div>
        {Array.from({ length: 12 }).map((_, row) => (
          <div key={row} className="flex border-b border-slate-50 last:border-0">
            <Skeleton className="h-16 w-20 shrink-0 rounded-none" />
            {Array.from({ length: 5 }).map((_, col) => (
              <div key={col} className="flex-1 border-l border-slate-50 p-2">
                {row % 3 === col % 3 ? <Skeleton className="h-12 w-full rounded-md" /> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function DefaultPageSkeleton() {
  return (
    <div className={cn(shellClass, "space-y-6")}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <TableSkeleton rows={6} columns={4} showToolbar={false} />
    </div>
  )
}

export function PageSkeleton({ variant = "default", className }: PageSkeletonProps) {
  const content = (() => {
    switch (variant) {
      case "dashboard":
        return <DashboardPageSkeleton />
      case "table":
        return <TablePageSkeleton />
      case "form":
        return <FormPageSkeleton />
      case "calendar":
        return <CalendarPageSkeleton />
      default:
        return <DefaultPageSkeleton />
    }
  })()

  return <div className={className}>{content}</div>
}
