"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react"

import { FEATURE_PAGE_SECTIONS } from "@/lib/features-page-sections"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function ProductCapabilitiesExplorer() {
  const [active, setActive] = useState(0)
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([])
  const total = FEATURE_PAGE_SECTIONS.length
  const section = FEATURE_PAGE_SECTIONS[active]
  const Icon = section.icon

  const go = useCallback(
    (dir: -1 | 1) => {
      setActive((i) => (i + dir + total) % total)
    },
    [total]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1)
      if (e.key === "ArrowLeft") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go])

  useEffect(() => {
    chipRefs.current[active]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
  }, [active])

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="text-center lg:text-left">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Product capabilities</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-600 lg:mx-0">
          Pick a pillar to explore — one focused view at a time. Use arrows, keyboard, or the rail. Full tier detail
          lives on{" "}
          <Link href="/pricing" className="font-medium text-[#7C3AED] underline-offset-2 hover:underline">
            pricing
          </Link>
          .
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-8 lg:mt-12 lg:grid lg:grid-cols-12 lg:gap-10">
        {/* Desktop: vertical rail */}
        <nav
          className="hidden lg:col-span-4 lg:flex lg:flex-col lg:gap-1"
          aria-label="Capability areas"
        >
          {FEATURE_PAGE_SECTIONS.map((s, i) => {
            const NavIcon = s.icon
            const isActive = i === active
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-all",
                  isActive
                    ? "border-[#7C3AED] bg-purple-50 shadow-md ring-1 ring-[#7C3AED]/20"
                    : "border-transparent bg-slate-50/80 hover:border-slate-200 hover:bg-slate-100/80"
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    isActive ? "bg-[#7C3AED] text-white" : "bg-white text-[#7C3AED] shadow-sm"
                  )}
                >
                  <NavIcon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-semibold", isActive ? "text-[#4C1D95]" : "text-slate-800")}>
                    {s.shortLabel}
                  </span>
                  <span className="mt-0.5 line-clamp-1 text-xs text-slate-500">{s.title}</span>
                </span>
              </button>
            )
          })}
        </nav>

        {/* Mobile: horizontal chips */}
        <div className="lg:hidden">
          <div
            className="-mx-1 flex gap-2 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Capability areas"
          >
            {FEATURE_PAGE_SECTIONS.map((s, i) => {
              const isActive = i === active
              return (
                <button
                  key={s.id}
                  ref={(el) => {
                    chipRefs.current[i] = el
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(i)}
                  className={cn(
                    "shrink-0 snap-center rounded-full border-2 px-4 py-2 text-sm font-semibold transition-all",
                    isActive
                      ? "border-[#7C3AED] bg-[#7C3AED] text-white shadow-md"
                      : "border-slate-200 bg-white text-slate-700 hover:border-[#7C3AED]/40"
                  )}
                >
                  {s.shortLabel}
                </button>
              )
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-8">
          <Card className="overflow-hidden border-2 border-slate-100 shadow-lg">
            <CardContent className="p-0">
              <div className="border-b border-slate-100 bg-gradient-to-br from-purple-50/80 to-white px-6 py-6 sm:px-8 sm:py-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#7C3AED] text-white shadow-lg">
                      <Icon className="h-7 w-7" aria-hidden />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#6D28D9]">
                        {active + 1} / {total}
                      </p>
                      <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                        {section.title}
                      </h3>
                    </div>
                  </div>
                  <Button asChild size="sm" className="shrink-0 bg-[#7C3AED] hover:bg-[#6D28D9]">
                    <Link href="/contact#get-in-touch">
                      Book demo
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
                <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600">{section.description}</p>
              </div>
              <ul className="grid gap-3 p-6 sm:grid-cols-2 sm:gap-4 sm:p-8">
                {section.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 text-sm leading-snug text-slate-800 sm:p-4"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-8">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-slate-700"
                  onClick={() => go(-1)}
                  aria-label="Previous capability"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <div className="flex gap-1.5" aria-hidden>
                  {FEATURE_PAGE_SECTIONS.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActive(i)}
                      className={cn(
                        "h-2 rounded-full transition-all",
                        i === active ? "w-6 bg-[#7C3AED]" : "w-2 bg-slate-300 hover:bg-slate-400"
                      )}
                      aria-label={`Go to ${s.shortLabel}`}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-slate-700"
                  onClick={() => go(1)}
                  aria-label="Next capability"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
          <p className="mt-3 text-center text-xs text-slate-500 lg:text-left">
            Tip: use ← → on your keyboard to move between pillars.
          </p>
        </div>
      </div>
    </div>
  )
}
