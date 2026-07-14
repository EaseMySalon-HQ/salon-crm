import type { Metadata } from 'next'
import { ReviewsStrip } from '@/components/mini-site/reviews-strip'
import { JsonLd } from '@/components/mini-site/json-ld'
import { fetchSiteReviews } from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  return siteMetadata(profile, '/reviews')
}

export default async function ReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const profile = await loadSiteProfile(raw)
  const reviews = profile.visibility.showReviews
    ? await fetchSiteReviews(profile.slug).catch(() => [])
    : []
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {profile.rating ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: profile.name,
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: profile.rating.average,
              reviewCount: profile.rating.count,
            },
          }}
        />
      ) : null}
      <h1 className="text-3xl font-semibold">Reviews</h1>
      {profile.rating ? (
        <p className="mt-2 text-stone-600">
          {profile.rating.average} average from {profile.rating.count} reviews
        </p>
      ) : null}
      <div className="mt-8">
        <ReviewsStrip reviews={reviews} />
      </div>
      {!reviews.length ? <p className="mt-8 text-stone-500">No public reviews yet.</p> : null}
    </div>
  )
}
