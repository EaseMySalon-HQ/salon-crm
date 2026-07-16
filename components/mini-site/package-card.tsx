'use client'

import Link from 'next/link'
import { SitePackage, bookAppointmentHref, formatInr } from '@/lib/public-site-api'
import { useSiteTrack } from '@/components/mini-site/mini-site-shell'
import { ST } from '@/lib/mini-site-theme'
import { miniSiteBasePath } from '@/lib/mini-site-path'
import { cn } from '@/lib/utils'

export function PackageCard({
  slug,
  pkg,
  onlineBookingEnabled,
  showPrices,
}: {
  slug: string
  pkg: SitePackage
  onlineBookingEnabled: boolean
  showPrices: boolean
}) {
  const { track } = useSiteTrack(slug)
  const detailHref = miniSiteBasePath(slug, 'packages')
  const canBook = onlineBookingEnabled && pkg.bookableOnline
  const bookHref = bookAppointmentHref(slug, { packageId: pkg.id })
  const price = showPrices ? formatInr(pkg.price) : null

  return (
    <article className={cn('p-5 transition hover:shadow-md', ST.card)}>
      <p className={cn('text-xs uppercase tracking-wide', ST.textMuted)}>{pkg.type}</p>
      <h3 className={cn('mt-1 text-lg font-medium', ST.textPrimary)}>{pkg.name}</h3>
      <p className={cn('mt-2 line-clamp-3 text-sm', ST.textMuted)}>
        {pkg.shortDescription || pkg.description || 'Package'}
      </p>
      <div className="mt-4 flex items-center justify-between gap-2">
        {price ? <span className={cn('font-semibold', ST.textPrimary)}>{price}</span> : <span />}
        {canBook ? (
          <Link
            href={bookHref}
            onClick={() => track('service_book_now_click', pkg.id)}
            className={ST.btnPrimarySm}
          >
            Book Now
          </Link>
        ) : (
          <Link
            href={miniSiteBasePath(slug, `enquiry/package?id=${encodeURIComponent(pkg.id)}`)}
            onClick={() => track('package_enquiry', pkg.id)}
            className={ST.btnSecondary}
          >
            Enquire
          </Link>
        )}
      </div>
      <Link href={detailHref} className={`mt-3 inline-block text-xs ${ST.link}`}>
        View packages
      </Link>
    </article>
  )
}
