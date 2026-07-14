import Link from 'next/link'
import type { Metadata } from 'next'
import { MiniSiteHero } from '@/components/mini-site/mini-site-hero'
import { FeatureCardsGrid } from '@/components/mini-site/feature-cards-grid'
import { ServiceCard } from '@/components/mini-site/service-card'
import { PackageCard } from '@/components/mini-site/package-card'
import { StaffCard } from '@/components/mini-site/staff-card'
import { OfferCarousel } from '@/components/mini-site/offer-carousel'
import { ReviewsMarquee } from '@/components/mini-site/reviews-marquee'
import { GalleryMarquee } from '@/components/mini-site/gallery-marquee'
import {
  fetchSiteGallery,
  fetchSiteMemberships,
  fetchSiteOffers,
  fetchSitePackages,
  fetchSitePrepaidWallets,
  fetchSiteProducts,
  fetchSiteReviews,
  fetchSiteServices,
  fetchSiteTeam,
  formatAddress,
  formatInr,
  mapsHref,
} from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'
import { JsonLd } from '@/components/mini-site/json-ld'
import { ST } from '@/lib/mini-site-theme'
import { miniSiteBasePath } from '@/lib/mini-site-path'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  return siteMetadata(profile)
}

export default async function SalonHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const profile = await loadSiteProfile(rawSlug)
  const slug = profile.slug
  const showPrices = profile.visibility.showPrices
  const showProductPrices = profile.visibility.showProductPrices !== false
  const showProductImages = profile.visibility.showProductImages !== false

  const [featuredServices, featuredPackages, featuredProducts, featuredMemberships, featuredPrepaidWallets, team, gallery, offers, reviews] =
    await Promise.all([
      fetchSiteServices(slug, { featured: true }).catch(() => []),
      profile.visibility.showPackages
        ? fetchSitePackages(slug, { featured: true }).catch(() => [])
        : Promise.resolve([]),
      profile.visibility.showProducts
        ? fetchSiteProducts(slug, { featured: true }).catch(() => [])
        : Promise.resolve([]),
      profile.visibility.showMemberships
        ? fetchSiteMemberships(slug, { featured: true }).catch(() => [])
        : Promise.resolve([]),
      profile.visibility.showPrepaidWallets
        ? fetchSitePrepaidWallets(slug, { featured: true }).catch(() => [])
        : Promise.resolve([]),
      profile.visibility.showStaff ? fetchSiteTeam(slug).catch(() => []) : Promise.resolve([]),
      profile.visibility.showGallery ? fetchSiteGallery(slug).catch(() => []) : Promise.resolve([]),
      profile.visibility.showOffers ? fetchSiteOffers(slug).catch(() => []) : Promise.resolve([]),
      profile.visibility.showReviews ? fetchSiteReviews(slug).catch(() => []) : Promise.resolve([]),
    ])

  const popularServices = featuredServices.slice(0, 6)
  const packagePreview = featuredPackages.slice(0, 4)
  const productPreview = featuredProducts.slice(0, 4)
  const membershipPreview = featuredMemberships.slice(0, 3)
  const prepaidWalletPreview = featuredPrepaidWallets.slice(0, 3)
  const address = formatAddress(profile.address)
  const maps = mapsHref(profile.social.googleMapsUrl || address)

  const localBusiness = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: profile.name,
    description: profile.description || profile.tagline,
    image: profile.coverImage || profile.logoUrl || undefined,
    telephone: profile.contact.phone || undefined,
    url: undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: profile.address.street,
      addressLocality: profile.address.city,
      addressRegion: profile.address.state,
      postalCode: profile.address.zipCode,
      addressCountry: profile.address.country || 'IN',
    },
    aggregateRating: profile.rating
      ? {
          '@type': 'AggregateRating',
          ratingValue: profile.rating.average,
          reviewCount: profile.rating.count,
        }
      : undefined,
  }

  return (
    <>
      <JsonLd data={localBusiness} />
      <MiniSiteHero slug={slug} profile={profile} />
      <FeatureCardsGrid slug={slug} profile={profile} />

      {popularServices.length ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Popular services</h2>
              <p className="mt-1 text-stone-600">Book your next visit in a few taps.</p>
            </div>
            <Link href={miniSiteBasePath(slug, 'services')} className={ST.linkNav}>
              View all
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popularServices.map((service) => (
              <ServiceCard
                key={service.id}
                slug={slug}
                service={service}
                onlineBookingEnabled={profile.onlineBookingEnabled}
                showPrices={showPrices}
              />
            ))}
          </div>
        </section>
      ) : null}

      {packagePreview.length ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Featured packages</h2>
              <p className="mt-1 text-stone-600">Save more with curated packages.</p>
            </div>
            <Link href={miniSiteBasePath(slug, 'packages')} className={ST.linkNav}>
              View all
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {packagePreview.map((pkg) => (
              <PackageCard
                key={pkg.id}
                slug={slug}
                pkg={pkg}
                onlineBookingEnabled={profile.onlineBookingEnabled}
                showPrices={showPrices}
              />
            ))}
          </div>
        </section>
      ) : null}

      {membershipPreview.length ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-semibold">Memberships</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {membershipPreview.map((m) => (
              <article key={m.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-medium">{m.name}</h3>
                <p className="mt-2 text-sm text-stone-600">{m.shortDescription || m.description}</p>
                {showPrices && m.price != null ? (
                  <p className="mt-3 font-semibold">{formatInr(m.price)}</p>
                ) : null}
                <Link
                  href={miniSiteBasePath(slug, 'contact')}
                  className={`mt-4 inline-block text-sm font-medium ${ST.link}`}
                >
                  Enquire
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {prepaidWalletPreview.length ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-semibold">Featured prepaid wallets</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {prepaidWalletPreview.map((w) => (
              <article key={w.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-medium">{w.name}</h3>
                {w.shortDescription ? (
                  <p className="mt-2 text-sm text-stone-600">{w.shortDescription}</p>
                ) : null}
                {showPrices && (w.payAmount != null || w.creditAmount != null) ? (
                  <p className="mt-3 text-sm font-semibold">
                    {w.payAmount != null ? `Pay ${formatInr(w.payAmount)}` : null}
                    {w.payAmount != null && w.creditAmount != null ? ' · ' : null}
                    {w.creditAmount != null ? `Get ${formatInr(w.creditAmount)} credit` : null}
                    {w.validityDays ? ` · ${w.validityDays} days` : null}
                  </p>
                ) : w.validityDays ? (
                  <p className="mt-3 text-sm text-stone-600">{w.validityDays} days validity</p>
                ) : null}
                <Link
                  href={miniSiteBasePath(slug, 'contact')}
                  className={`mt-4 inline-block text-sm font-medium ${ST.link}`}
                >
                  Enquire
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {offers.length ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-semibold">Offers</h2>
          <div className="mt-6">
            <OfferCarousel offers={offers} />
          </div>
        </section>
      ) : null}

      {productPreview.length ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold">Featured products</h2>
            <Link href={miniSiteBasePath(slug, 'products')} className={ST.linkNav}>
              View all
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {productPreview.map((p) => (
              <article key={p.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                {showProductImages && p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.imageAlt || p.name} className="h-36 w-full object-cover" />
                ) : null}
                <div className="p-4">
                  <h3 className="font-medium">{p.name}</h3>
                  {showProductPrices && p.price != null ? (
                    <p className="mt-1 text-sm font-semibold">{formatInr(p.price)}</p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {gallery.length ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold">Gallery</h2>
            {gallery.length > 5 ? (
              <Link href={miniSiteBasePath(slug, 'gallery')} className={ST.linkNav}>
                View all
              </Link>
            ) : null}
          </div>
          <div className="mt-6">
            <GalleryMarquee items={gallery} salonName={profile.name} max={5} />
          </div>
        </section>
      ) : null}

      {team.length ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold">Our team</h2>
            <Link href={miniSiteBasePath(slug, 'team')} className={ST.linkNav}>
              View all
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {team.slice(0, 4).map((s) => (
              <StaffCard key={s.id} staff={s} />
            ))}
          </div>
        </section>
      ) : null}

      {reviews.length ? (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold">Reviews</h2>
            {reviews.length > 5 ? (
              <Link href={miniSiteBasePath(slug, 'reviews')} className={ST.linkNav}>
                View all
              </Link>
            ) : null}
          </div>
          <div className="mt-6">
            <ReviewsMarquee reviews={reviews} max={5} />
          </div>
        </section>
      ) : null}


      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold">Visit us</h2>
        <p className="mt-2 text-stone-600">{address || 'Contact us for directions.'}</p>
        {maps !== '#' ? (
          <a href={maps} className={`mt-3 inline-block text-sm font-medium ${ST.link}`}>
            Open in Google Maps
          </a>
        ) : null}
        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
          {profile.social.googleMapsUrl?.includes('maps') ? (
            <iframe
              title="Map"
              src={
                profile.social.googleMapsUrl.includes('/embed')
                  ? profile.social.googleMapsUrl
                  : `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
              }
              className="h-72 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : address ? (
            <iframe
              title="Map"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
              className="h-72 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-stone-500">
              Map coming soon
            </div>
          )}
        </div>
      </section>
    </>
  )
}
