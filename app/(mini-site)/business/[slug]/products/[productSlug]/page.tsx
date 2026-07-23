import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/mini-site/json-ld'
import { ProductDetailActions } from '@/components/mini-site/product-detail-actions'
import { fetchSiteProduct, formatInr } from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'
import { ST } from '@/lib/mini-site-theme'
import { miniSiteBasePath } from '@/lib/mini-site-path'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>
}): Promise<Metadata> {
  const { slug, productSlug } = await params
  const profile = await loadSiteProfile(slug)
  try {
    const product = await fetchSiteProduct(profile.slug, productSlug)
    return {
      ...siteMetadata(profile, `/products/${product.slug}`),
      title: product.seoTitle || `${product.name} · ${profile.name}`,
      description: product.seoDescription || product.shortDescription || product.description,
    }
  } catch {
    return siteMetadata(profile, '/products')
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>
}) {
  const { slug: raw, productSlug } = await params
  const profile = await loadSiteProfile(raw)
  if (!profile.visibility.showProducts) notFound()
  let product
  try {
    product = await fetchSiteProduct(profile.slug, productSlug)
  } catch {
    notFound()
  }
  const price = profile.visibility.showProductPrices !== false ? formatInr(product.price) : null
  const showProductImages = profile.visibility.showProductImages !== false

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          description: product.description || product.shortDescription,
          image: product.imageUrl || undefined,
          offers:
            product.price != null
              ? { '@type': 'Offer', price: product.price, priceCurrency: 'INR' }
              : undefined,
        }}
      />
      <p className="text-sm text-stone-500">
        <Link href={miniSiteBasePath(profile.slug, 'products')} className={ST.link}>
          Products
        </Link>
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{product.name}</h1>
      {showProductImages && product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.imageAlt || product.name}
          className="mt-6 aspect-[16/9] w-full rounded-2xl object-cover"
        />
      ) : null}
      {price ? <p className="mt-4 text-lg font-semibold">{price}</p> : null}
      <p className="mt-4 whitespace-pre-wrap text-stone-700">
        {product.description || product.shortDescription}
      </p>
      <ProductDetailActions slug={profile.slug} product={product} />
    </div>
  )
}
