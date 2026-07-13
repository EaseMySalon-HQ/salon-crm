'use client'

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
import { ServiceRateList } from '@/components/mini-site/service-rate-list'
import type { SiteService } from '@/lib/public-site-api'
import { ST } from '@/lib/mini-site-theme'
import { Search } from 'lucide-react'

function uncategorized(category: string | undefined) {
  const c = String(category || '').trim()
  return c || 'Other'
}

export function ServicesCatalog({
  slug,
  services,
  onlineBookingEnabled,
  showPrices,
}: {
  slug: string
  services: SiteService[]
  onlineBookingEnabled: boolean
  showPrices: boolean
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')

  const categories = useMemo(() => {
    const set = new Set(services.map((s) => uncategorized(s.category)))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [services])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return services.filter((service) => {
      const cat = uncategorized(service.category)
      if (category !== 'all' && cat !== category) return false
      if (!term) return true
      return (
        service.name.toLowerCase().includes(term) ||
        cat.toLowerCase().includes(term) ||
        service.shortDescription?.toLowerCase().includes(term) ||
        service.description?.toLowerCase().includes(term)
      )
    })
  }, [services, search, category])

  const byCategory = useMemo(() => {
    const groups: Record<string, SiteService[]> = {}
    for (const service of filtered) {
      const key = uncategorized(service.category)
      if (!groups[key]) groups[key] = []
      groups[key].push(service)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const total = filtered.length

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services…"
            className="pl-9"
            aria-label="Search services"
          />
        </div>

        {categories.length > 1 ? (
          <div className="w-full sm:w-56">
            <Label htmlFor="service-category-filter" className="sr-only">
              Category
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="service-category-filter" className="w-full">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {total === 0 ? (
        <p className="py-8 text-stone-500">
          {search || category !== 'all' ? 'No services match your search.' : 'No public services yet.'}
        </p>
      ) : (
        <div className="space-y-8">
          {byCategory.map(([cat, items]) => (
            <section key={cat}>
              <h2 className={ST.categoryHeading}>
                {cat}
              </h2>
              <div className="mt-3">
                <ServiceRateList
                  slug={slug}
                  services={items}
                  onlineBookingEnabled={onlineBookingEnabled}
                  showPrices={showPrices}
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
