import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type LoadingSpinnerProps = {
  size?: "sm" | "md" | "lg"
  label?: string
  className?: string
  variant?: "ring" | "icon"
}

const sizeMap = {
  sm: { ring: "h-5 w-5", icon: "h-4 w-4" },
  md: { ring: "h-8 w-8", icon: "h-6 w-6" },
  lg: { ring: "h-12 w-12", icon: "h-10 w-10" },
}

export function LoadingSpinner({
  size = "md",
  label = "Loading",
  className,
  variant = "icon",
}: LoadingSpinnerProps) {
  if (variant === "ring") {
    return (
      <div
        role="status"
        aria-label={label}
        className={cn("inline-flex items-center justify-center", className)}
      >
        <div
          className={cn(
            "animate-spin rounded-full border-2 border-indigo-600 border-t-transparent",
            sizeMap[size].ring
          )}
        />
        <span className="sr-only">{label}</span>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center justify-center", className)}
    >
      <Loader2 className={cn("animate-spin text-indigo-600", sizeMap[size].icon)} />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function LoadingSpinnerPage({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <LoadingSpinner size="lg" label={label} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
