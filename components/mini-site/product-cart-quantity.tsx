'use client'

import { Minus, Plus, ShoppingBag } from 'lucide-react'
import type { SiteProduct } from '@/lib/public-site-api'
import { ST } from '@/lib/mini-site-theme'
import { cn } from '@/lib/utils'
import {
  PRODUCT_QUANTITY_LIMIT_MESSAGE,
  resolveProductMaxQuantity,
  useOptionalProductCart,
} from '@/components/mini-site/product-cart-context'

export function ProductCartQuantity({
  product,
  layout = 'card',
}: {
  product: SiteProduct
  layout?: 'card' | 'inline'
}) {
  const cart = useOptionalProductCart()
  if (!cart) return null

  const line = cart.lines.find((item) => item.productId === product.id)
  const quantity = line?.quantity ?? 0
  const maxQuantity = line?.maxQuantity ?? resolveProductMaxQuantity(product)
  const canIncrease = quantity < maxQuantity

  function decrease() {
    if (quantity <= 1) {
      cart.removeProduct(product.id)
      return
    }
    cart.setQuantity(product.id, quantity - 1)
  }

  function increase() {
    if (!canIncrease) return
    if (quantity === 0) {
      cart.addProduct(product, 1)
      return
    }
    cart.setQuantity(product.id, quantity + 1)
  }

  if (maxQuantity < 1) {
    return null
  }

  if (quantity === 0) {
    return (
      <button
        type="button"
        onClick={() => cart.addProduct(product, 1)}
        className={cn(
          layout === 'card'
            ? 'flex w-full items-center justify-center gap-1.5 text-sm'
            : 'inline-flex items-center gap-2',
          layout === 'card' ? ST.btnPrimarySm : ST.btnPrimary
        )}
      >
        <ShoppingBag className={layout === 'card' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        Add to cart
      </button>
    )
  }

  const stepperClass =
    layout === 'card'
      ? 'flex w-full items-center justify-center gap-3'
      : 'inline-flex items-center gap-2'

  const buttonClass = cn(
    'rounded-full border border-[color:var(--site-border)] p-1.5 transition hover:bg-[color-mix(in_srgb,var(--site-accent)_8%,var(--site-surface))] disabled:cursor-not-allowed disabled:opacity-40',
    ST.textPrimary
  )

  return (
    <div className={cn(layout === 'card' && 'w-full')}>
      <div className={stepperClass} role="group" aria-label={`Quantity for ${product.name}`}>
        <button
          type="button"
          className={buttonClass}
          onClick={decrease}
          aria-label="Decrease quantity"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className={cn('min-w-[1.75rem] text-center text-sm font-semibold tabular-nums', ST.textPrimary)}>
          {quantity}
        </span>
        <button
          type="button"
          className={buttonClass}
          onClick={increase}
          disabled={!canIncrease}
          aria-label={canIncrease ? 'Increase quantity' : 'Maximum available quantity reached'}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {!canIncrease ? (
        <p
          className={cn(
            'mt-1.5 text-xs leading-snug',
            ST.textMuted,
            layout === 'card' ? 'text-center' : 'text-left'
          )}
        >
          {PRODUCT_QUANTITY_LIMIT_MESSAGE}
        </p>
      ) : null}
    </div>
  )
}
