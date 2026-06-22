"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search, Plus, Minus, Clock, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"
import { BT } from "@/lib/booking-page-theme"
import {
  BOOKING_COLUMN_HEADER_CLASS,
  BOOKING_STICKY_COLUMN_CLASS,
} from "@/lib/booking-hero-layout"
import type { PublicBookingService } from "@/lib/public-booking-api"
import { formatBookingPrice, formatDurationMinutes } from "@/lib/public-booking-api"

type ServicePickerProps = {
  services: PublicBookingService[]
  search: string
  onSearchChange: (value: string) => void
  loading: boolean
  onAdd: (service: PublicBookingService) => void
  onRemoveOne: (serviceId: string) => void
  getQuantity: (serviceId: string) => number
}

function uncategorizedLabel(category: string | undefined) {
  const trimmed = category?.trim()
  return trimmed || "General"
}

function ServiceRow({
  service,
  qty,
  onAdd,
  onRemoveOne,
}: {
  service: PublicBookingService
  qty: number
  onAdd: (service: PublicBookingService) => void
  onRemoveOne: (serviceId: string) => void
}) {
  return (
    <div className="flex flex-col gap-3 py-4 lg:gap-2 xl:flex-row xl:items-center xl:gap-4">
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium leading-snug", BT.textPrimary)}>{service.name}</p>
        <p className={cn("mt-1 flex items-center gap-1 text-xs", BT.textMuted)}>
          <Clock className="h-3 w-3 shrink-0" />
          {formatDurationMinutes(service.duration)}
        </p>
        {service.description && (
          <p className={cn("mt-1 line-clamp-1 text-xs", BT.textSubtle)}>{service.description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 xl:justify-end">
        <span className={cn("text-sm font-semibold tabular-nums", BT.textPrimary)}>
          {formatBookingPrice(service.price)}
        </span>
        {qty > 0 ? (
          <div className={cn("flex items-center rounded-full border p-0.5", BT.borderAccent, BT.bgAccentSoft)}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 rounded-full", BT.textAccent, BT.hoverAccentSoft)}
              onClick={() => onRemoveOne(service.id)}
              aria-label={`Remove one ${service.name}`}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className={cn("min-w-[1.25rem] text-center text-sm font-semibold", BT.textAccent)}>
              {qty}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 rounded-full", BT.textAccent, BT.hoverAccentSoft)}
              onClick={() => onAdd(service)}
              aria-label={`Add another ${service.name}`}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              "h-9 rounded-full px-4",
              BT.borderAccent,
              BT.textAccent,
              BT.hoverAccentSoft,
              "hover:text-[color:var(--booking-accent)]"
            )}
            onClick={() => onAdd(service)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </div>
    </div>
  )
}

function CategoryNavButton({
  label,
  count,
  active,
  onClick,
  className,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
        active
          ? cn(BT.bgSurface, "font-medium shadow-sm ring-1", BT.textAccent, BT.ringAccent)
          : cn(BT.textSecondary, BT.hoverAccentSoft, BT.hoverTextPrimary),
        className
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[var(--booking-accent)]"
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1 pr-2 text-[13px] leading-snug xl:text-sm">{label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums",
          active ? cn(BT.bgAccentSoftStrong, BT.textAccent) : cn(BT.bgSurfaceMuted, BT.textMuted)
        )}
      >
        {count}
      </span>
    </button>
  )
}

export function ServicePicker({
  services,
  search,
  onSearchChange,
  loading,
  onAdd,
  onRemoveOne,
  getQuantity,
}: ServicePickerProps) {
  const isSearching = search.trim().length > 0
  const searchTerm = search.trim().toLowerCase()

  const servicesByCategory = useMemo(() => {
    let list = services
    if (isSearching) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(searchTerm) ||
          uncategorizedLabel(s.category).toLowerCase().includes(searchTerm)
      )
    }
    const groups = new Map<string, PublicBookingService[]>()
    for (const service of list) {
      const label = uncategorizedLabel(service.category)
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)!.push(service)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [services, isSearching, searchTerm])

  const categories = useMemo(
    () => servicesByCategory.map(([cat, items]) => [cat, items.length] as const),
    [servicesByCategory]
  )

  const totalVisible = useMemo(
    () => servicesByCategory.reduce((sum, [, items]) => sum + items.length, 0),
    [servicesByCategory]
  )

  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [mobileOpenCategories, setMobileOpenCategories] = useState<string[]>([])
  const servicesTopRef = useRef<HTMLDivElement>(null)
  const categorySectionRefs = useRef(new Map<string, HTMLElement>())
  const scrollFromClickRef = useRef(false)

  const registerSectionRef = useCallback((category: string) => {
    return (node: HTMLElement | null) => {
      if (node) categorySectionRefs.current.set(category, node)
      else categorySectionRefs.current.delete(category)
    }
  }, [])

  useEffect(() => {
    if (loading || categories.length === 0) return
    setActiveCategory((prev) => {
      if (prev && categories.some(([cat]) => cat === prev)) return prev
      return categories[0][0]
    })
  }, [categories, loading])

  useEffect(() => {
    if (loading || categories.length === 0) return
    if (isSearching) {
      setMobileOpenCategories(servicesByCategory.map(([cat]) => cat))
      return
    }
    setMobileOpenCategories((prev) => {
      if (prev.length === 1 && categories.some(([cat]) => cat === prev[0])) return prev
      return [categories[0][0]]
    })
  }, [categories, loading, isSearching, servicesByCategory])

  useEffect(() => {
    if (loading || isSearching || servicesByCategory.length === 0) return
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollFromClickRef.current) return

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        const topEntry = visible[0]
        if (!topEntry) return

        const category = topEntry.target.getAttribute("data-category")
        if (category) setActiveCategory(category)
      },
      {
        root: null,
        rootMargin: "-140px 0px -50% 0px",
        threshold: [0, 0.05, 0.1],
      }
    )

    for (const el of categorySectionRefs.current.values()) {
      observer.observe(el)
    }

    return () => observer.disconnect()
  }, [servicesByCategory, loading, isSearching])

  const scrollToCategory = useCallback((category: string | null) => {
    scrollFromClickRef.current = true
    setActiveCategory(category)

    if (category === null) {
      servicesTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    } else {
      categorySectionRefs.current.get(category)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }

    window.setTimeout(() => {
      scrollFromClickRef.current = false
    }, 900)
  }, [])

  return (
    <div className={cn("flex h-full w-full min-h-[50vh] flex-col lg:min-h-[calc(100vh-4.5rem)]", BT.bgSurface)}>
      <div className="grid w-full flex-1 grid-cols-1 lg:grid-cols-booking-categories-compact xl:grid-cols-booking-categories 2xl:grid-cols-booking-categories-xl lg:items-start">
        <aside
          className={cn(
            "hidden border-r lg:block lg:w-full",
            BT.borderSubtle,
            BT.bgSurfaceMuted,
            BOOKING_STICKY_COLUMN_CLASS
          )}
        >
          <div
            className={cn(
              BOOKING_COLUMN_HEADER_CLASS,
              BT.bgSurfaceMuted,
              "px-4 lg:px-5"
            )}
          >
            <p className={cn("text-xs font-semibold uppercase tracking-wider", BT.textSubtle)}>Categories</p>
          </div>
          <nav
            className="overflow-y-auto px-3 py-3 lg:max-h-[calc(100vh-3.5rem)] xl:px-5"
            aria-label="Service categories"
          >
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-200/60" />
                  ))}
                </div>
              ) : categories.length === 0 ? (
                <p className={cn("text-sm", BT.textMuted)}>No categories</p>
              ) : (
                <div className="space-y-0.5">
                  {categories.map(([cat, count]) => (
                    <CategoryNavButton
                      key={cat}
                      label={cat}
                      count={count}
                      active={activeCategory === cat}
                      onClick={() => scrollToCategory(cat)}
                    />
                  ))}
                </div>
              )}
            </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:min-w-0">
          <div
            ref={servicesTopRef}
            className={cn(
              BOOKING_COLUMN_HEADER_CLASS,
              "scroll-mt-20 px-4 sm:px-6 lg:px-8"
            )}
          >
            <div className="relative w-full min-w-0 sm:max-w-sm lg:max-w-none xl:ml-auto xl:w-[clamp(9.5rem,12vw,14rem)] 2xl:w-[clamp(10rem,10vw,15rem)]">
              <Search className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", BT.textSubtle)} />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search services"
                className={cn("h-9 pl-9 text-sm", BT.borderDefault, BT.bgSurfaceMuted)}
                aria-label="Search services"
              />
            </div>
          </div>

          <div className="flex-1 px-4 py-2 sm:px-6 sm:py-4 lg:px-4 xl:px-8">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-[72px] animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : totalVisible === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                <p className={cn("text-sm font-medium", BT.textSecondary)}>No services found</p>
                <p className={cn("mt-1 text-xs", BT.textMuted)}>Try a different search term.</p>
              </div>
            ) : (
              <>
                {/* Mobile: category accordions */}
                <Accordion
                  type={isSearching ? "multiple" : "single"}
                  {...(isSearching ? {} : { collapsible: true })}
                  value={
                    isSearching
                      ? mobileOpenCategories
                      : mobileOpenCategories[0] ?? undefined
                  }
                  onValueChange={(value) => {
                    if (isSearching) {
                      setMobileOpenCategories(Array.isArray(value) ? value : value ? [value] : [])
                    } else {
                      setMobileOpenCategories(typeof value === "string" ? [value] : [])
                    }
                  }}
                  className="lg:hidden"
                >
                  {servicesByCategory.map(([category, categoryServices]) => (
                    <AccordionItem
                      key={category}
                      value={category}
                      className={cn("px-1", BT.borderSubtle)}
                    >
                      <AccordionTrigger
                        className={cn(
                          "py-3.5 text-sm font-semibold hover:no-underline",
                          BT.textSecondary,
                          "[&[data-state=open]]:text-[color:var(--booking-accent)]"
                        )}
                      >
                        <span className="min-w-0 flex-1 pr-3 text-left leading-snug">{category}</span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-2 pt-0">
                        <ul className={cn("divide-y", BT.divideSubtle)}>
                          {categoryServices.map((service) => (
                            <li key={service.id}>
                              <ServiceRow
                                service={service}
                                qty={getQuantity(service.id)}
                                onAdd={onAdd}
                                onRemoveOne={onRemoveOne}
                              />
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                {/* Desktop: continuous scroll sections */}
                <div className="hidden space-y-8 lg:block">
                  {servicesByCategory.map(([category, categoryServices]) => (
                    <section
                      key={category}
                      ref={registerSectionRef(category)}
                      data-category={category}
                      className={cn(
                        "scroll-mt-32 rounded-xl transition-colors",
                        activeCategory === category && !isSearching && cn(BT.bgAccentSoft, "ring-1", BT.ringAccent)
                      )}
                    >
                      <div
                        className={cn(
                          "sticky top-[3.25rem] z-[5] -mx-1 border-b px-1 py-3 backdrop-blur-sm lg:top-[3rem]",
                          BT.borderSubtle,
                          "bg-[color-mix(in_srgb,var(--booking-surface)_90%,transparent)]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3
                            className={cn(
                              "text-sm font-semibold",
                              activeCategory === category ? BT.textAccent : BT.textSecondary
                            )}
                          >
                            {category}
                          </h3>
                          <span className={cn("shrink-0 text-xs", BT.textSubtle)}>
                            {categoryServices.length} service{categoryServices.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <ul className={cn("divide-y px-1", BT.divideSubtle)}>
                        {categoryServices.map((service) => (
                          <li key={service.id}>
                            <ServiceRow
                              service={service}
                              qty={getQuantity(service.id)}
                              onAdd={onAdd}
                              onRemoveOne={onRemoveOne}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ServicePickerLoadingShell() {
  return (
    <div className={cn("flex min-h-[420px] items-center justify-center rounded-2xl border", BT.borderDefault, BT.bgSurface)}>
      <Loader2 className={cn("h-7 w-7 animate-spin", BT.textAccent)} />
    </div>
  )
}
