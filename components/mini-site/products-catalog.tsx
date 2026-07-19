'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatInr, type SiteProduct } from '@/lib/public-site-api'
import { ST } from '@/lib/mini-site-theme'
import { miniSiteBasePath } from '@/lib/mini-site-path'
import { cn } from '@/lib/utils'
import { Search } from 'lucide-react'

function uncategorized(category: string | undefined) {
  const c = String(category || '').trim()
  return c || 'Other'
}

export function ProductsCatalog({
  slug,
  products,
  showPrices,
  showImages,
}: {
  slug: string
  products: SiteProduct[]
  showPrices: boolean
  showImages: boolean
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => uncategorized(p.category)))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [products])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((product) => {
      const cat = uncategorized(product.category)
      if (category !== 'all' && cat !== category) return false
      if (!term) return true
      return (
        product.name.toLowerCase().includes(term) ||
        cat.toLowerCase().includes(term) ||
        product.shortDescription?.toLowerCase().includes(term) ||
        product.description?.toLowerCase().includes(term)
      )
    })
  }, [products, search, category])

  const byCategory = useMemo(() => {
    const groups: Record<string, SiteProduct[]> = {}
    for (const product of filtered) {
      const key = uncategorized(product.category)
      if (!groups[key]) groups[key] = []
      groups[key].push(product)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const total = filtered.length

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="relative max-w-md flex-1">
          <Search className={cn('pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', ST.textMuted)} />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className={cn('pl-9', ST.input)}
            aria-label="Search products"
          />
        </div>

        {categories.length > 1 ? (
          <div className="w-full sm:w-56">
            <Label htmlFor="product-category-filter" className="sr-only">
              Category
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="product-category-filter" className={cn('w-full', ST.selectTrigger)}>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent className={ST.selectContent}>
                <SelectItem value="all" className={ST.selectItem}>
                  All categories
                </SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat} className={ST.selectItem}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {total === 0 ? (
        <p className={cn('py-8', ST.textMuted)}>
          {search || category !== 'all' ? 'No products match your search.' : 'No public products yet.'}
        </p>
      ) : (
        <div className="space-y-10">
          {byCategory.map(([cat, items]) => (
            <section key={cat}>
              <h2 className={ST.categoryHeading}>{cat}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {items.map((p) => (
                  <article key={p.id} className={cn('overflow-hidden transition hover:shadow-md', ST.card)}>
                    {showImages ? (
                      p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt={p.imageAlt || p.name}
                          className="h-40 w-full object-cover"
                        />
                      ) : (
                        <div className={cn('flex h-40 items-center justify-center text-sm', ST.imagePlaceholder)}>
                          {cat}
                        </div>
                      )
                    ) : null}
                    <div className="p-4">
                      <h3 className={cn('font-medium', ST.textPrimary)}>
                        <Link
                          href={miniSiteBasePath(slug, `products/${p.slug}`)}
                          className={ST.hoverLinkTitle}
                        >
                          {p.name}
                        </Link>
                      </h3>
                      <p className={cn('mt-1 line-clamp-2 text-sm', ST.textMuted)}>
                        {p.shortDescription || p.description}
                      </p>
                      {showPrices && p.price != null ? (
                        <p className={cn('mt-2 font-semibold', ST.textPrimary)}>{formatInr(p.price)}</p>
                      ) : null}
                      <Link
                        href={miniSiteBasePath(slug, `enquiry/product?id=${encodeURIComponent(p.id)}`)}
                        className={`mt-3 inline-block text-sm ${ST.link}`}
                      >
                        Enquire
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
