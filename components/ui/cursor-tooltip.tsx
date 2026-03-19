"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

const POINTER_OFFSET = 14
const OPEN_DELAY_MS = 200

type CursorTooltipProps = {
  children: React.ReactNode
  content: React.ReactNode
  /** Extra classes on the floating tooltip panel */
  className?: string
  /** Classes on the hover/focus wrapper (e.g. h-full for grid cells) */
  wrapperClassName?: string
  /** Use -1 when a child (e.g. card) is focusable instead of the wrapper */
  wrapperTabIndex?: number
}

export function CursorTooltip({
  children,
  content,
  className,
  wrapperClassName,
  wrapperTabIndex = 0,
}: CursorTooltipProps) {
  const [open, setOpen] = React.useState(false)
  const [coords, setCoords] = React.useState({ x: 0, y: 0 })
  const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  const clearOpenTimer = React.useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])

  const setPointerPosition = React.useCallback((clientX: number, clientY: number) => {
    setCoords({ x: clientX, y: clientY })
  }, [])

  const handleMouseEnter = (e: React.MouseEvent) => {
    clearOpenTimer()
    setPointerPosition(e.clientX, e.clientY)
    openTimerRef.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    setPointerPosition(e.clientX, e.clientY)
  }

  const handleMouseLeave = () => {
    clearOpenTimer()
    setOpen(false)
  }

  const handleFocus = () => {
    const el = wrapperRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPointerPosition(r.left + r.width / 2, r.bottom)
    clearOpenTimer()
    setOpen(true)
  }

  const handleBlur = () => {
    clearOpenTimer()
    setOpen(false)
  }

  React.useEffect(() => () => clearOpenTimer(), [clearOpenTimer])

  const position = React.useMemo(() => {
    let left = coords.x + POINTER_OFFSET
    let top = coords.y + POINTER_OFFSET
    if (typeof window !== "undefined") {
      const pad = 8
      const estW = 280
      const estH = 80
      left = Math.min(left, window.innerWidth - estW - pad)
      top = Math.min(top, window.innerHeight - estH - pad)
      left = Math.max(pad, left)
      top = Math.max(pad, top)
    }
    return { left, top }
  }, [coords])

  return (
    <>
      <div
        ref={wrapperRef}
        className={cn(
          "rounded-lg cursor-default",
          wrapperTabIndex >= 0 &&
            "outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2",
          wrapperClassName
        )}
        tabIndex={wrapperTabIndex}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onFocus={wrapperTabIndex >= 0 ? handleFocus : undefined}
        onBlur={wrapperTabIndex >= 0 ? handleBlur : undefined}
      >
        {children}
      </div>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-[100] max-w-xs rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md",
              className
            )}
            style={{ left: position.left, top: position.top }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  )
}
