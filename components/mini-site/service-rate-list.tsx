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

export function ServiceRateList({
  slug,
  services,
  onlineBookingEnabled,
  showPrices,
}: {
  slug: string
  services: SiteService[]
  onlineBookingEnabled: boolean
  showPrices: boolean
}) {
  const { track } = useSiteTrack(slug)

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="hidden border-b border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-stone-500 sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_6rem_5.5rem] sm:gap-4">
        <span>Service</span>
        <span className="text-right">Duration</span>
        <span className="text-right">{showPrices ? 'Price' : ''}</span>
        <span className="sr-only">Action</span>
      </div>
      <ul className="divide-y divide-stone-100">
        {services.map((service) => {
          const price = showPrices ? formatInr(service.price) : null
          const detailHref = miniSiteBasePath(slug, `services/${service.slug}`)
          const bookHref = bookAppointmentHref(slug, { serviceId: service.id })
          const canBook = onlineBookingEnabled && service.bookableOnline

          return (
            <li
              key={service.id}
              className="px-4 py-3.5 sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_6rem_5.5rem] sm:items-center sm:gap-4"
            >
              <div className="min-w-0">
                <Link
                  href={detailHref}
                  className={`font-medium text-stone-900 ${ST.hoverLinkTitle}`}
                >
                  {service.name}
                </Link>
                {service.shortDescription ? (
                  <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{service.shortDescription}</p>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-3 sm:hidden">
                  <span className="text-sm text-stone-500">{service.duration} min</span>
                  {price ? <span className="text-sm font-semibold text-stone-900">{price}</span> : null}
                </div>
              </div>

              <span className="hidden text-right text-sm text-stone-600 sm:block">
                {service.duration} min
              </span>

              <span className="hidden text-right text-sm font-semibold text-stone-900 sm:block">
                {price || '—'}
              </span>

              <div className="mt-3 sm:mt-0 sm:flex sm:justify-end">
                {canBook ? (
                  <Link
                    href={bookHref}
                    onClick={() => track('service_book_now_click', service.id)}
                    className={`inline-flex ${ST.btnPrimarySm}`}
                  >
                    Book
                  </Link>
                ) : (
                  <Link
                    href={miniSiteBasePath(slug, 'contact')}
                    className={`inline-flex ${ST.btnSecondary}`}
                  >
                    Enquire
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
