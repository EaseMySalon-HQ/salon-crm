'use client'

import Link from 'next/link'
import {
  SiteService,
  bookAppointmentHref,
  formatInr,
} from '@/lib/public-site-api'
import { useSiteTrack } from '@/components/mini-site/mini-site-shell'
import { ST } from '@/lib/mini-site-theme'

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
  const detailHref = `/salon/${slug}/services/${service.slug}`
  const bookHref = bookAppointmentHref(slug, { serviceId: service.id })
  const price = showPrices ? formatInr(service.price) : null

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs uppercase tracking-wide text-stone-500">{service.category}</p>
        <h3 className="mt-1 text-lg font-medium">
          <Link href={detailHref} className={ST.hoverLinkTitle}>
            {service.name}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 flex-1 text-sm text-stone-600">
          {service.shortDescription || service.description || `${service.duration} min`}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-sm">
            {price ? <span className="font-semibold">{price}</span> : null}
            <span className="ml-2 text-stone-500">{service.duration} min</span>
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
              href={`/salon/${slug}/contact`}
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
