import type { Metadata } from 'next'
import { ServicesCatalog } from '@/components/mini-site/services-catalog'
import { fetchSiteServices, type SiteService } from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'
import { ST } from '@/lib/mini-site-theme'
import { cn } from '@/lib/utils'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  return siteMetadata(profile, '/services')
}

export default async function ServicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const profile = await loadSiteProfile(raw)
  const services = await fetchSiteServices(profile.slug).catch(() => [] as SiteService[])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className={cn('text-3xl font-semibold tracking-tight', ST.textPrimary)}>Services</h1>
      <p className={cn('mt-2', ST.textMuted)}>Choose a service and book online.</p>
      <ServicesCatalog
        slug={profile.slug}
        services={services}
        onlineBookingEnabled={profile.onlineBookingEnabled}
        showPrices={profile.visibility.showPrices}
      />
    </div>
  )
}
