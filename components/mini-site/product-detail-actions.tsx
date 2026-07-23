'use client'

import Link from 'next/link'
import { miniSiteBasePath } from '@/lib/mini-site-path'
import { ST } from '@/lib/mini-site-theme'
import { type SiteProduct } from '@/lib/public-site-api'
import { useOptionalProductCart } from '@/components/mini-site/product-cart-context'
import { ProductCartQuantity } from '@/components/mini-site/product-cart-quantity'

export function ProductDetailActions({
  slug,
  product,
}: {
  slug: string
  product: SiteProduct
}) {
  const cart = useOptionalProductCart()

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {cart ? <ProductCartQuantity product={product} layout="inline" /> : null}
      <Link href={miniSiteBasePath(slug, 'products')} className={ST.link}>
        Back to all products
      </Link>
    </div>
  )
}
