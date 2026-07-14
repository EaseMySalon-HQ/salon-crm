'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  Gift,
  Images,
  LayoutGrid,
  MapPinned,
  Package,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
  BadgePercent,
  Circle,
} from 'lucide-react'
import type { SiteProfile } from '@/lib/public-site-api'
import { ST } from '@/lib/mini-site-theme'
import { miniSiteBasePath } from '@/lib/mini-site-path'
import { cn } from '@/lib/utils'

const ICONS = {
  services: Sparkles,
  packages: Package,
  memberships: Gift,
  products: ShoppingBag,
  offers: BadgePercent,
  gallery: Images,
  team: Users,
  reviews: Star,
  contact: MapPinned,
} as const

type ExploreView = 'cards' | 'icons'

function defaultExploreView(): ExploreView {
  if (typeof window === 'undefined') return 'cards'
  return window.matchMedia('(max-width: 767px)').matches ? 'icons' : 'cards'
}

export function FeatureCardsGrid({
  slug,
  profile,
}: {
  slug: string
  profile: SiteProfile
}) {
  const [view, setView] = useState<ExploreView>('cards')
  const viewInitialized = useRef(false)

  useEffect(() => {
    if (viewInitialized.current) return
    viewInitialized.current = true
    setView(defaultExploreView())
  }, [])
  const base = miniSiteBasePath(slug)
  const v = profile.visibility
  const c = profile.counts || {}
  const cards = [
    { key: 'services', href: `${base}/services`, title: 'Services', desc: 'Explore treatments and book online', count: c.services, show: v.showServices !== false },
    { key: 'products', href: `${base}/products`, title: 'Products', desc: 'Retail and take-home care', count: c.products, show: v.showProducts },
    { key: 'gallery', href: `${base}/gallery`, title: 'Gallery', desc: 'Look at our space and work', count: c.gallery, show: v.showGallery },
    { key: 'packages', href: `${base}/packages`, title: 'Packages', desc: 'Value packs and sittings', count: c.packages, show: v.showPackages },
    { key: 'memberships', href: `${base}/memberships`, title: 'Memberships', desc: 'Plans with member benefits', count: c.memberships, show: v.showMemberships },
    { key: 'offers', href: `${base}/offers`, title: 'Offers', desc: 'Current promotions', count: c.offers, show: v.showOffers },
    { key: 'team', href: `${base}/team`, title: 'Our Team', desc: 'Meet the experts', count: c.staff, show: v.showStaff },
    { key: 'reviews', href: `${base}/reviews`, title: 'Reviews', desc: 'What guests say', count: profile.rating?.count, show: v.showReviews },
    { key: 'contact', href: `${base}/contact`, title: 'Contact & Location', desc: 'Call, WhatsApp, or visit', show: true },
  ].filter((x) => x.show)

  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Explore</h2>
        </div>
        <div
          className="flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--site-border)] bg-[color:var(--site-surface)] p-1"
          role="group"
          aria-label="Explore layout"
        >
          <button
            type="button"
            aria-label="Card view"
            aria-pressed={view === 'cards'}
            title="Card view"
            onClick={() => setView('cards')}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-full transition',
              view === 'cards'
                ? 'bg-[var(--site-accent)] text-white'
                : cn(ST.textMuted, ST.hoverAccentSoft)
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Icon view"
            aria-pressed={view === 'icons'}
            title="Icon view"
            onClick={() => setView('icons')}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-full transition',
              view === 'icons'
                ? 'bg-[var(--site-accent)] text-white'
                : cn(ST.textMuted, ST.hoverAccentSoft)
            )}
          >
            <Circle className="h-4 w-4" />
          </button>
        </div>
      </div>

      {view === 'cards' ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = ICONS[card.key as keyof typeof ICONS] || Sparkles
            return (
              <Link
                key={card.key}
                href={card.href}
                className={cn(
                  'group rounded-2xl p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
                  ST.cardExplore
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={cn('rounded-xl p-2.5', ST.iconSoft)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  {card.count != null ? (
                    <span className={cn('text-xs font-medium tabular-nums opacity-80', ST.textAccent)}>
                      {card.count}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-4 text-lg font-medium text-[color:var(--site-text-primary)]">{card.title}</h3>
                <p className={cn('mt-1 text-sm', ST.textMuted)}>{card.desc}</p>
                <span className={cn('mt-4 inline-block text-sm font-medium group-hover:underline', ST.textAccent)}>
                  View all
                </span>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {cards.map((card) => {
            const Icon = ICONS[card.key as keyof typeof ICONS] || Sparkles
            return (
              <Link
                key={card.key}
                href={card.href}
                className={cn(
                  'group flex flex-col items-center rounded-2xl border border-[color:var(--site-border)] bg-[color:var(--site-surface)] px-3 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
                  ST.hoverAccentSoft
                )}
              >
                <div className={cn('rounded-full p-3 transition group-hover:scale-105', ST.iconSoft)}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="mt-3 text-xs font-medium leading-tight text-[color:var(--site-text-primary)]">
                  {card.title}
                </span>
                {card.count != null ? (
                  <span className={cn('mt-1 text-[10px] tabular-nums opacity-80', ST.textAccent)}>
                    {card.count}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
