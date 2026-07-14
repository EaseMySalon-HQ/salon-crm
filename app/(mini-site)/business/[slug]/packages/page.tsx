import type { Metadata } from 'next'
import { PackageCard } from '@/components/mini-site/package-card'
import { fetchSitePackages } from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  return siteMetadata(profile, '/packages')
}

export default async function PackagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const profile = await loadSiteProfile(raw)
  if (!profile.visibility.showPackages) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-semibold">Packages</h1>
        <p className="mt-2 text-stone-500">Packages are not listed on this website.</p>
      </div>
    )
  }
  const packages = await fetchSitePackages(profile.slug).catch(() => [])
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Packages</h1>
      <p className="mt-2 text-stone-600">Bundles and multi-sitting packages.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <PackageCard
            key={pkg.id}
            slug={profile.slug}
            pkg={pkg}
            onlineBookingEnabled={profile.onlineBookingEnabled}
            showPrices={profile.visibility.showPrices}
          />
        ))}
      </div>
      {!packages.length ? <p className="mt-8 text-stone-500">No public packages yet.</p> : null}
    </div>
  )
}
