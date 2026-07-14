import type { Metadata } from 'next'
import { ProductsCatalog } from '@/components/mini-site/products-catalog'
import { fetchSiteProducts } from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'

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
        <h1 className="text-3xl font-semibold">Products</h1>
        <p className="mt-2 text-stone-500">Products are not listed on this website.</p>
      </div>
    )
  }
  const products = await fetchSiteProducts(profile.slug).catch(() => [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
      <p className="mt-2 text-stone-600">Browse retail products and send an enquiry.</p>
      <ProductsCatalog
        slug={profile.slug}
        products={products}
        showPrices={profile.visibility.showProductPrices !== false}
        showImages={profile.visibility.showProductImages !== false}
      />
    </div>
  )
}
