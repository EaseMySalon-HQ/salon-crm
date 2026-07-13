import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { fetchSiteProfile, type SiteProfile } from '@/lib/public-site-api'

export const loadSiteProfile = cache(async function loadSiteProfile(slug: string): Promise<SiteProfile> {
  try {
    return await fetchSiteProfile(slug)
  } catch {
    notFound()
  }
})

export function siteMetadata(profile: SiteProfile, path = ''): Metadata {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.FRONTEND_URL ||
    'https://easemysalon.in'
  const origin = base.replace(/\/$/, '')
  const canonical = `${origin}/salon/${profile.slug}${path}`
  const title = profile.seo.title || profile.name
  const description = profile.seo.metaDescription || profile.description || `Visit ${profile.name}`
  const ogImage = profile.seo.ogImage || profile.coverImage || profile.logoUrl || undefined

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: { index: true, follow: true },
  }
}
