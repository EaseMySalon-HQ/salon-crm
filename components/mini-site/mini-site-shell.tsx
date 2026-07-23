'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SiteProfile,
  bookAppointmentHref,
  mapsHref,
  formatAddress,
  telHref,
  trackSiteEvent,
  whatsappHref,
} from '@/lib/public-site-api'
import { CalendarDays, ChevronLeft, MapPin, MessageCircle, Phone } from 'lucide-react'
import { resolveMiniSitePageTheme, ST } from '@/lib/mini-site-theme'
import { miniSiteBasePath } from '@/lib/mini-site-path'
import { cn } from '@/lib/utils'
import { ProductCartProvider } from '@/components/mini-site/product-cart-context'
import { ProductCartSheet, ProductCartTrigger } from '@/components/mini-site/product-cart-sheet'

function sessionId() {
  if (typeof window === 'undefined') return ''
  const key = 'ems-site-sid'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    sessionStorage.setItem(key, id)
  }
  return id
}

export function useSiteTrack(slug: string) {
  return useMemo(
    () => ({
      track: (event: string, refId?: string) => {
        void trackSiteEvent(slug, {
          event,
          path: typeof window !== 'undefined' ? window.location.pathname : '',
          refId,
          sessionId: sessionId(),
        })
      },
    }),
    [slug]
  )
}

export function MiniSiteShell({
  slug,
  profile,
  children,
}: {
  slug: string
  profile: SiteProfile
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { track } = useSiteTrack(slug)
  const lastPageViewRef = useRef<string | null>(null)
  const base = miniSiteBasePath(slug)
  const isHomePage = pathname === base
  const isBookPage = pathname === `${base}/book`
  const bookHref = bookAppointmentHref(slug)
  const address = formatAddress(profile.address)
  const maps = mapsHref(profile.social.googleMapsUrl || address)
  const siteTheme = resolveMiniSitePageTheme(profile.themeColor)
  const showProductCart = profile.visibility.showProducts !== false
  const [cartOpen, setCartOpen] = useState(false)

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(base)
  }

  useEffect(() => {
    // One page_view per pathname (avoids Strict Mode / remount duplicates).
    if (lastPageViewRef.current === pathname) return
    lastPageViewRef.current = pathname
    track('page_view')
  }, [pathname, track])

  useEffect(() => {
    const ga = profile.externalAnalytics?.gaMeasurementId
    if (!ga || typeof document === 'undefined') return
    if (document.getElementById('ems-ga')) return
    const s = document.createElement('script')
    s.id = 'ems-ga'
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`
    document.head.appendChild(s)
    const inline = document.createElement('script')
    inline.id = 'ems-ga-inline'
    inline.text = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`
    document.head.appendChild(inline)
  }, [profile.externalAnalytics?.gaMeasurementId])

  useEffect(() => {
    const pixel = profile.externalAnalytics?.metaPixelId
    if (!pixel || typeof document === 'undefined') return
    if (document.getElementById('ems-meta-pixel')) return
    const s = document.createElement('script')
    s.id = 'ems-meta-pixel'
    s.text = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`
    document.head.appendChild(s)
  }, [profile.externalAnalytics?.metaPixelId])

  useEffect(() => {
    const domain = profile.externalAnalytics?.plausibleDomain
    if (!domain || typeof document === 'undefined') return
    if (document.getElementById('ems-plausible')) return
    const s = document.createElement('script')
    s.id = 'ems-plausible'
    s.defer = true
    s.dataset.domain = domain
    s.src = 'https://plausible.io/js/script.js'
    document.head.appendChild(s)
  }, [profile.externalAnalytics?.plausibleDomain])

  useEffect(() => {
    const root = document.documentElement
    const vars = siteTheme.vars
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value)
    }
    return () => {
      for (const key of Object.keys(vars)) {
        root.style.removeProperty(key)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vars derived from themeColor
  }, [profile.themeColor])

  const shellBody = (
    <div
      className="min-h-screen bg-[color:var(--site-surface-muted)] text-[color:var(--site-text-primary)]"
      style={siteTheme.vars as React.CSSProperties}
    >
      {!isHomePage ? (
        <header className="sticky top-0 z-40 border-b border-[color:var(--site-border)] bg-[color-mix(in_srgb,var(--site-surface)_92%,transparent)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={handleBack}
              className={cn(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--site-text-muted)]',
                ST.hoverAccentSoft
              )}
              aria-label="Go back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <Link href={base} className={`flex min-w-0 flex-1 items-center gap-3 ${ST.hoverAccentText}`}>
              {profile.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logoUrl} alt={profile.name} className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white',
                    ST.logoFallback
                  )}
                >
                  {profile.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate font-semibold tracking-tight">{profile.name}</span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              {showProductCart ? (
                <ProductCartTrigger onClick={() => setCartOpen(true)} />
              ) : null}
              {profile.onlineBookingEnabled && !isBookPage ? (
                <Link
                  href={bookHref}
                  onClick={() => track('book_appointment_click')}
                  className="hidden rounded-full bg-[var(--site-accent)] px-4 py-2 text-sm font-medium text-white sm:inline-flex"
                >
                  Book Appointment
                </Link>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      <main className={isBookPage ? 'pb-0' : 'pb-24 md:pb-10'}>{children}</main>

      <footer className="border-t border-[color:var(--site-border)] bg-[color:var(--site-surface)]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-3">
          <div>
            <p className="font-semibold">{profile.name}</p>
            <p className={cn('mt-2 text-sm', ST.textMuted)}>{profile.tagline || profile.businessCategory}</p>
          </div>
          <div className={cn('text-sm', ST.textMuted)}>
            {address ? <p>{address}</p> : null}
            {profile.contact.phone ? <p className="mt-1">{profile.contact.phone}</p> : null}
          </div>
          <div className={cn('text-sm', ST.textMuted)}>
            <p>Powered by EaseMySalon</p>
          </div>
        </div>
      </footer>

      {!isBookPage ? (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[color:var(--site-border)] bg-[color-mix(in_srgb,var(--site-surface)_95%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-2 py-2">
          <a
            href={whatsappHref(profile.contact.whatsappNumber, `Hi ${profile.name}`)}
            onClick={() => track('whatsapp_click')}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] text-[color:var(--site-text-muted)]',
              ST.hoverAccentSoft
            )}
          >
            <MessageCircle className="h-5 w-5" />
            WhatsApp
          </a>
          <a
            href={telHref(profile.contact.phone)}
            onClick={() => track('call_click')}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] text-[color:var(--site-text-muted)]',
              ST.hoverAccentSoft
            )}
          >
            <Phone className="h-5 w-5" />
            Call
          </a>
          <a
            href={maps}
            onClick={() => track('directions_click')}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] text-[color:var(--site-text-muted)]',
              ST.hoverAccentSoft
            )}
          >
            <MapPin className="h-5 w-5" />
            Directions
          </a>
          <Link
            href={profile.onlineBookingEnabled ? bookHref : `${base}/contact`}
            onClick={() => track('book_appointment_click')}
            className="flex flex-col items-center gap-1 rounded-lg bg-[var(--site-accent)] py-2 text-[11px] font-medium text-white"
          >
            <CalendarDays className="h-5 w-5" />
            Book Now
          </Link>
        </div>
      </div>
      ) : null}
    </div>
  )

  if (!showProductCart) {
    return shellBody
  }

  return (
    <ProductCartProvider slug={slug}>
      {shellBody}
      <ProductCartSheet
        slug={slug}
        open={cartOpen}
        onOpenChange={setCartOpen}
        customFields={profile.enquiryForm?.customFields || []}
        operatingHours={profile.operatingHours}
      />
    </ProductCartProvider>
  )
}
