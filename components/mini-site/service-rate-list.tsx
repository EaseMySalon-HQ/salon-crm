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
    <div className={ST.listPanel}>
      <div
        className={cn(
          'hidden px-4 py-2.5 text-xs font-medium uppercase tracking-wide sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_6rem_5.5rem] sm:gap-4',
          ST.listHeader,
          ST.textMuted
        )}
      >
        <span>Service</span>
        <span className="text-right">Duration</span>
        <span className="text-right">{showPrices ? 'Price' : ''}</span>
        <span className="sr-only">Action</span>
      </div>
      <ul className={cn('divide-y', ST.listDivider)}>
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
                  className={cn('font-medium', ST.textPrimary, ST.hoverLinkTitle)}
                >
                  {service.name}
                </Link>
                {service.shortDescription ? (
                  <p className={cn('mt-0.5 line-clamp-1 text-xs', ST.textMuted)}>{service.shortDescription}</p>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-3 sm:hidden">
                  <span className={cn('text-sm', ST.textMuted)}>{service.duration} min</span>
                  {price ? <span className={cn('text-sm font-semibold', ST.textPrimary)}>{price}</span> : null}
                </div>
              </div>

              <span className={cn('hidden text-right text-sm sm:block', ST.textMuted)}>
                {service.duration} min
              </span>

              <span className={cn('hidden text-right text-sm font-semibold sm:block', ST.textPrimary)}>
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
