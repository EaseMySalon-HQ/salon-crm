import type { Metadata } from 'next'
import { EnquiryForm } from '@/components/mini-site/enquiry-form'
import { OfferCarousel } from '@/components/mini-site/offer-carousel'
import { fetchSiteOffers } from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  return siteMetadata(profile, '/offers')
}

export default async function OffersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const profile = await loadSiteProfile(raw)
  const offers = profile.visibility.showOffers
    ? await fetchSiteOffers(profile.slug).catch(() => [])
    : []
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Offers</h1>
      <div className="mt-8">
        <OfferCarousel offers={offers} />
      </div>
      {!offers.length ? <p className="mt-8 text-stone-500">No active offers right now.</p> : null}
      <div className="mt-12">
        <h2 className="text-xl font-medium">Ask about an offer</h2>
        <div className="mt-4">
          <EnquiryForm
            slug={profile.slug}
            type="general"
            customFields={profile.enquiryForm?.customFields || []}
          />
        </div>
      </div>
    </div>
  )
}
