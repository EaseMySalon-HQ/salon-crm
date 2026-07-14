import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicBookingPage } from '@/components/public-booking/public-booking-page'
import { loadSiteProfile } from '@/lib/mini-site-server'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ service?: string; package?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  return {
    title: `Book appointment · ${profile.name}`,
    description: `Book services online at ${profile.name}.`,
    robots: { index: false, follow: true },
  }
}

export default async function SalonBookPage({ params, searchParams }: PageProps) {
  const { slug: raw } = await params
  const profile = await loadSiteProfile(raw)
  const query = await searchParams

  if (!profile.onlineBookingEnabled) {
    notFound()
  }

  return (
    <PublicBookingPage
      code={profile.bookingCode}
      initialServiceId={query.service || null}
      initialPackageId={query.package || null}
      embeddedInMiniSite
    />
  )
}
