import Link from 'next/link'
import type { Metadata } from 'next'
import { fetchSiteMemberships, formatInr } from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'
import { ST } from '@/lib/mini-site-theme'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  return siteMetadata(profile, '/memberships')
}

export default async function MembershipsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const profile = await loadSiteProfile(raw)
  if (!profile.visibility.showMemberships) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-semibold">Memberships</h1>
        <p className="mt-2 text-stone-500">Memberships are not listed on this website.</p>
      </div>
    )
  }
  const memberships = await fetchSiteMemberships(profile.slug).catch(() => [])
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Memberships</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {memberships.map((m) => (
          <article key={m.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-medium">{m.name}</h2>
            <p className="mt-2 text-sm text-stone-600">{m.shortDescription || m.description}</p>
            {profile.visibility.showPrices && m.price != null ? (
              <p className="mt-3 font-semibold">{formatInr(m.price)}</p>
            ) : null}
            <Link
              href={`/salon/${profile.slug}/enquiry/membership?id=${encodeURIComponent(m.id)}`}
              className={`mt-4 inline-block text-sm ${ST.link}`}
            >
              Enquire
            </Link>
          </article>
        ))}
      </div>
      {!memberships.length ? <p className="mt-8 text-stone-500">No public memberships yet.</p> : null}
    </div>
  )
}
