"use client"

import { createContext, useContext, useEffect, useMemo } from "react"
import { cn } from "@/lib/utils"
import { resolveBookingPageTheme, type BookingPageTheme } from "@/lib/booking-page-theme"

const BookingThemeContext = createContext<BookingPageTheme | null>(null)

export function BookingThemeProvider({
  themeId,
  children,
  className,
}: {
  themeId?: string | null
  children: React.ReactNode
  className?: string
}) {
  const theme = useMemo(() => resolveBookingPageTheme(themeId), [themeId])

  useEffect(() => {
    const root = document.documentElement
    for (const [key, value] of Object.entries(theme.vars)) {
      root.style.setProperty(key, value)
    }
    return () => {
      for (const key of Object.keys(theme.vars)) {
        root.style.removeProperty(key)
      }
    }
  }, [theme])

  return (
    <BookingThemeContext.Provider value={theme}>
      <div className={cn("min-h-0 flex flex-1 flex-col", className)} style={theme.vars}>
        {children}
      </div>
    </BookingThemeContext.Provider>
  )
}

export function useBookingTheme(): BookingPageTheme {
  const theme = useContext(BookingThemeContext)
  if (!theme) {
    throw new Error("useBookingTheme must be used within BookingThemeProvider")
  }
  return theme
}
