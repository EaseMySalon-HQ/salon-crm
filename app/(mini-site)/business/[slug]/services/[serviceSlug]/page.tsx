import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/mini-site/json-ld'
import {
  bookAppointmentHref,
  fetchSiteService,
  formatInr,
} from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'
import { ST } from '@/lib/mini-site-theme'
import { miniSiteBasePath } from '@/lib/mini-site-path'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; serviceSlug: string }>
}): Promise<Metadata> {
  const { slug, serviceSlug } = await params
  const profile = await loadSiteProfile(slug)
  try {
    const service = await fetchSiteService(profile.slug, serviceSlug)
    return {
      ...siteMetadata(profile, `/services/${service.slug}`),
      title: service.seoTitle || `${service.name} · ${profile.name}`,
      description: service.seoDescription || service.shortDescription || service.description,
    }
  } catch {
    return siteMetadata(profile, '/services')
  }
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string; serviceSlug: string }>
}) {
  const { slug: raw, serviceSlug } = await params
  const profile = await loadSiteProfile(raw)
  let service
  try {
    service = await fetchSiteService(profile.slug, serviceSlug)
  } catch {
    notFound()
  }
  const bookHref = bookAppointmentHref(profile.slug, { serviceId: service.id })
  const price = profile.visibility.showPrices ? formatInr(service.price) : null

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: service.name,
          description: service.description || service.shortDescription,
          provider: { '@type': 'LocalBusiness', name: profile.name },
          offers:
            service.price != null
              ? { '@type': 'Offer', price: service.price, priceCurrency: 'INR' }
              : undefined,
        }}
      />
      <p className="text-sm text-stone-500">
        <Link href={miniSiteBasePath(profile.slug, 'services')} className={ST.link}>
          Services
        </Link>{' '}
        / {service.category}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{service.name}</h1>
      {service.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={service.imageUrl}
          alt={service.imageAlt || service.name}
          className="mt-6 aspect-[16/9] w-full rounded-2xl object-cover"
        />
      ) : null}
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-stone-600">
        <span>{service.duration} min</span>
        {price ? <span className="font-semibold text-stone-900">{price}</span> : null}
      </div>
      <p className="mt-6 whitespace-pre-wrap text-stone-700">
        {service.description || service.shortDescription || 'Ask us for details.'}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {profile.onlineBookingEnabled && service.bookableOnline ? (
          <Link
            href={bookHref}
            className={ST.btnPrimaryMd}
          >
            Book Now
          </Link>
        ) : (
          <Link
            href={miniSiteBasePath(profile.slug, 'contact')}
            className={ST.btnSecondaryMd}
          >
            Enquire
          </Link>
        )}
      </div>
    </div>
  )
}
