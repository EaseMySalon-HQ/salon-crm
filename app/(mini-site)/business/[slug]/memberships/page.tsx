import Link from 'next/link'
import type { Metadata } from 'next'
import { fetchSiteMemberships, formatInr } from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'
import { ST } from '@/lib/mini-site-theme'
import { miniSiteBasePath } from '@/lib/mini-site-path'
import { cn } from '@/lib/utils'

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
        <h1 className={cn('text-3xl font-semibold', ST.textPrimary)}>Memberships</h1>
        <p className={cn('mt-2', ST.textMuted)}>Memberships are not listed on this website.</p>
      </div>
    )
  }
  const memberships = await fetchSiteMemberships(profile.slug).catch(() => [])
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className={cn('text-3xl font-semibold', ST.textPrimary)}>Memberships</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {memberships.map((m) => (
          <article key={m.id} className={cn('p-5 transition hover:shadow-md', ST.card)}>
            <h2 className={cn('text-lg font-medium', ST.textPrimary)}>{m.name}</h2>
            <p className={cn('mt-2 text-sm', ST.textMuted)}>{m.shortDescription || m.description}</p>
            {profile.visibility.showPrices && m.price != null ? (
              <p className={cn('mt-3 font-semibold', ST.textPrimary)}>{formatInr(m.price)}</p>
            ) : null}
            <Link
              href={miniSiteBasePath(profile.slug, `enquiry/membership?id=${encodeURIComponent(m.id)}`)}
              className={`mt-4 inline-block text-sm ${ST.link}`}
            >
              Enquire
            </Link>
          </article>
        ))}
      </div>
      {!memberships.length ? (
        <p className={cn('mt-8', ST.textMuted)}>No public memberships yet.</p>
      ) : null}
    </div>
  )
}
