'use client'

import Link from 'next/link'
import { SitePackage, bookAppointmentHref, formatInr } from '@/lib/public-site-api'
import { useSiteTrack } from '@/components/mini-site/mini-site-shell'
import { ST } from '@/lib/mini-site-theme'

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
  const detailHref = `/salon/${slug}/packages`
  const canBook = onlineBookingEnabled && pkg.bookableOnline
  const bookHref = bookAppointmentHref(slug, { packageId: pkg.id })
  const price = showPrices ? formatInr(pkg.price) : null

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-stone-500">{pkg.type}</p>
      <h3 className="mt-1 text-lg font-medium">{pkg.name}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-stone-600">
        {pkg.shortDescription || pkg.description || 'Package'}
      </p>
      <div className="mt-4 flex items-center justify-between gap-2">
        {price ? <span className="font-semibold">{price}</span> : <span />}
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
            href={`/salon/${slug}/enquiry/package?id=${encodeURIComponent(pkg.id)}`}
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
