import type { Metadata } from 'next'
import { ProductsCatalog } from '@/components/mini-site/products-catalog'
import { fetchSiteProducts } from '@/lib/public-site-api'
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
  return siteMetadata(profile, '/products')
}

export default async function ProductsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const profile = await loadSiteProfile(raw)
  if (!profile.visibility.showProducts) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className={cn('text-3xl font-semibold', ST.textPrimary)}>Products</h1>
        <p className={cn('mt-2', ST.textMuted)}>Products are not listed on this website.</p>
      </div>
    )
  }
  const products = await fetchSiteProducts(profile.slug).catch(() => [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className={cn('text-3xl font-semibold tracking-tight', ST.textPrimary)}>Products</h1>
      <p className={cn('mt-2', ST.textMuted)}>
        Browse products in stock and submit a purchase request — the salon will contact you.
      </p>
      <ProductsCatalog
        slug={profile.slug}
        products={products}
        showPrices={profile.visibility.showProductPrices !== false}
        showImages={profile.visibility.showProductImages !== false}
      />
    </div>
  )
}
