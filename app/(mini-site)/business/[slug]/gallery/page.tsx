import type { Metadata } from 'next'
import { fetchSiteGallery } from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  return siteMetadata(profile, '/gallery')
}

export default async function GalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const profile = await loadSiteProfile(raw)
  const items = profile.visibility.showGallery
    ? await fetchSiteGallery(profile.slug).catch(() => [])
    : []
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Gallery</h1>
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.id}
            src={item.imageUrl}
            alt={item.alt || profile.name}
            className="aspect-square rounded-xl object-cover"
          />
        ))}
      </div>
      {!items.length ? <p className="mt-8 text-stone-500">No gallery images yet.</p> : null}
    </div>
  )
}
