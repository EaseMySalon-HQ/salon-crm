'use client'

import Link from 'next/link'
import {
  SiteService,
  bookAppointmentHref,
  formatInr,
} from '@/lib/public-site-api'
import { useSiteTrack } from '@/components/mini-site/mini-site-shell'
import { ST } from '@/lib/mini-site-theme'
import { miniSiteBasePath } from '@/lib/mini-site-path'
import { cn } from '@/lib/utils'

export function ServiceCard({
  slug,
  service,
  onlineBookingEnabled,
  showPrices,
}: {
  slug: string
  service: SiteService
  onlineBookingEnabled: boolean
  showPrices: boolean
}) {
  const { track } = useSiteTrack(slug)
  const detailHref = miniSiteBasePath(slug, `services/${service.slug}`)
  const bookHref = bookAppointmentHref(slug, { serviceId: service.id })
  const price = showPrices ? formatInr(service.price) : null

  return (
    <article className={cn('flex flex-col overflow-hidden transition hover:shadow-md', ST.card)}>
      <div className="flex flex-1 flex-col p-4">
        <p className={cn('text-xs uppercase tracking-wide', ST.textMuted)}>{service.category}</p>
        <h3 className={cn('mt-1 text-lg font-medium', ST.textPrimary)}>
          <Link href={detailHref} className={ST.hoverLinkTitle}>
            {service.name}
          </Link>
        </h3>
        <p className={cn('mt-2 line-clamp-2 flex-1 text-sm', ST.textMuted)}>
          {service.shortDescription || service.description || `${service.duration} min`}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className={cn('text-sm', ST.textPrimary)}>
            {price ? <span className="font-semibold">{price}</span> : null}
            <span className={cn(price ? 'ml-2' : '', ST.textMuted)}>{service.duration} min</span>
          </div>
          {onlineBookingEnabled && service.bookableOnline ? (
            <Link
              href={bookHref}
              onClick={() => track('service_book_now_click', service.id)}
              className={ST.btnPrimarySm}
            >
              Book Now
            </Link>
          ) : (
            <Link
              href={miniSiteBasePath(slug, 'contact')}
              className={ST.btnSecondary}
            >
              Enquire
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
