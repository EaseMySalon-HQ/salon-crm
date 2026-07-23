'use client'

import Link from 'next/link'
import { formatInr, type SiteProduct } from '@/lib/public-site-api'
import { ST } from '@/lib/mini-site-theme'
import { miniSiteBasePath } from '@/lib/mini-site-path'
import { cn } from '@/lib/utils'
import { useOptionalProductCart } from '@/components/mini-site/product-cart-context'
import { ProductCartQuantity } from '@/components/mini-site/product-cart-quantity'

export function ProductCard({
  slug,
  product,
  showPrices,
  showImages,
  categoryLabel,
}: {
  slug: string
  product: SiteProduct
  showPrices: boolean
  showImages: boolean
  categoryLabel?: string
}) {
  const cart = useOptionalProductCart()
  const placeholder = categoryLabel || product.category || 'Product'

  return (
    <article className={cn('flex h-full flex-col overflow-hidden transition hover:shadow-md', ST.card)}>
      {showImages ? (
        product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.imageAlt || product.name}
            className="h-40 w-full shrink-0 object-cover"
          />
        ) : (
          <div className={cn('flex h-40 shrink-0 items-center justify-center text-sm', ST.imagePlaceholder)}>
            {placeholder}
          </div>
        )
      ) : null}
      <div className="flex flex-1 flex-col p-4">
        <h3 className={cn('font-medium', ST.textPrimary)}>
          <Link href={miniSiteBasePath(slug, `products/${product.slug}`)} className={ST.hoverLinkTitle}>
            {product.name}
          </Link>
        </h3>
        <p className={cn('mt-1 min-h-[2.5rem] flex-1 line-clamp-2 text-sm', ST.textMuted)}>
          {product.shortDescription || product.description}
        </p>
        {showPrices ? (
          <p className={cn('mt-2 min-h-[1.25rem] font-semibold', ST.textPrimary)}>
            {product.price != null ? formatInr(product.price) : null}
          </p>
        ) : null}
        {cart ? (
          <div className="mt-auto pt-3">
            <ProductCartQuantity product={product} layout="card" />
          </div>
        ) : null}
      </div>
    </article>
  )
}
