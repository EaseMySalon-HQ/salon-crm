'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { SiteProduct } from '@/lib/public-site-api'

const ABSOLUTE_MAX_QTY = 99

export const PRODUCT_QUANTITY_LIMIT_MESSAGE =
  'Sorry we have limited quantity available for this item'

export type ProductCartLine = {
  productId: string
  slug: string
  name: string
  price: number | null
  imageUrl?: string
  quantity: number
  maxQuantity: number
}

type ProductCartContextValue = {
  lines: ProductCartLine[]
  itemCount: number
  addProduct: (product: SiteProduct, quantity?: number) => void
  removeProduct: (productId: string) => void
  setQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
}

const ProductCartContext = createContext<ProductCartContextValue | null>(null)

function storageKey(slug: string) {
  return `ems-mini-site-cart:${slug}`
}

export function resolveProductMaxQuantity(product: Pick<SiteProduct, 'maxQuantity'>): number {
  const n = Number(product.maxQuantity)
  if (!Number.isFinite(n) || n < 1) return ABSOLUTE_MAX_QTY
  return Math.min(Math.floor(n), ABSOLUTE_MAX_QTY)
}

function clampQuantity(quantity: number, maxQuantity: number) {
  return Math.min(Math.max(quantity, 1), maxQuantity)
}

function normalizeStoredLine(line: Partial<ProductCartLine>): ProductCartLine | null {
  if (!line?.productId || !line?.name) return null
  const maxQuantity = Math.min(
    Math.max(Number(line.maxQuantity) || ABSOLUTE_MAX_QTY, 1),
    ABSOLUTE_MAX_QTY
  )
  const quantity = clampQuantity(Number(line.quantity) || 1, maxQuantity)
  return {
    productId: String(line.productId),
    slug: String(line.slug || ''),
    name: String(line.name),
    price: line.price ?? null,
    imageUrl: line.imageUrl,
    quantity,
    maxQuantity,
  }
}

function readStored(slug: string): ProductCartLine[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(storageKey(slug))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((line) => normalizeStoredLine(line))
      .filter((line): line is ProductCartLine => line != null)
  } catch {
    return []
  }
}

function writeStored(slug: string, lines: ProductCartLine[]) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(storageKey(slug), JSON.stringify(lines))
  } catch {
    // ignore quota errors
  }
}

export function ProductCartProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [lines, setLines] = useState<ProductCartLine[]>([])

  useEffect(() => {
    setLines(readStored(slug))
  }, [slug])

  useEffect(() => {
    writeStored(slug, lines)
  }, [slug, lines])

  const addProduct = useCallback((product: SiteProduct, quantity = 1) => {
    const maxQuantity = resolveProductMaxQuantity(product)
    const qty = clampQuantity(quantity, maxQuantity)
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === product.id)
      if (idx >= 0) {
        const next = [...prev]
        const cap = Math.min(next[idx].maxQuantity, maxQuantity)
        next[idx] = {
          ...next[idx],
          maxQuantity: cap,
          quantity: clampQuantity(next[idx].quantity + qty, cap),
        }
        return next
      }
      return [
        ...prev,
        {
          productId: product.id,
          slug: product.slug,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          quantity: qty,
          maxQuantity,
        },
      ]
    })
  }, [])

  const removeProduct = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId))
  }, [])

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l
        return { ...l, quantity: clampQuantity(quantity, l.maxQuantity) }
      })
    )
  }, [])

  const clearCart = useCallback(() => setLines([]), [])

  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines]
  )

  const value = useMemo(
    () => ({
      lines,
      itemCount,
      addProduct,
      removeProduct,
      setQuantity,
      clearCart,
    }),
    [lines, itemCount, addProduct, removeProduct, setQuantity, clearCart]
  )

  return <ProductCartContext.Provider value={value}>{children}</ProductCartContext.Provider>
}

export function useProductCart() {
  const ctx = useContext(ProductCartContext)
  if (!ctx) {
    throw new Error('useProductCart must be used within ProductCartProvider')
  }
  return ctx
}

export function useOptionalProductCart() {
  return useContext(ProductCartContext)
}
