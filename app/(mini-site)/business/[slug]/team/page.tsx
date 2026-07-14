import type { Metadata } from 'next'
import { StaffCard } from '@/components/mini-site/staff-card'
import { fetchSiteTeam } from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  return siteMetadata(profile, '/team')
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const profile = await loadSiteProfile(raw)
  const team = profile.visibility.showStaff
    ? await fetchSiteTeam(profile.slug).catch(() => [])
    : []
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Our team</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {team.map((s) => (
          <StaffCard key={s.id} staff={s} />
        ))}
      </div>
      {!team.length ? <p className="mt-8 text-stone-500">Team profiles coming soon.</p> : null}
    </div>
  )
}
