"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * Thin indeterminate bar shown at the top of main content during route changes.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)

  useEffect(() => {
    setActive(true)
    const timer = window.setTimeout(() => setActive(false), 450)
    return () => window.clearTimeout(timer)
  }, [pathname])

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-0 right-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0"
      )}
    >
      <div className="h-full w-1/3 animate-[navigation-progress_0.9s_ease-in-out_infinite] bg-indigo-500" />
    </div>
  )
}
