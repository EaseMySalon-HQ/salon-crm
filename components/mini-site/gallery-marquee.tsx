'use client'

import { useEffect, useState } from 'react'
import type { SiteGalleryItem } from '@/lib/public-site-api'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

function GalleryMarqueeImage({ item, salonName }: { item: SiteGalleryItem; salonName: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.imageUrl}
      alt={item.alt || salonName}
      className="aspect-square w-[min(100vw-2rem,240px)] shrink-0 rounded-xl object-cover sm:w-[240px]"
    />
  )
}

export function GalleryMarquee({
  items,
  salonName,
  max = 5,
}: {
  items: SiteGalleryItem[]
  salonName: string
  max?: number
}) {
  const preview = items.slice(0, max)
  const prefersReducedMotion = usePrefersReducedMotion()
  if (!preview.length) return null

  const track = prefersReducedMotion ? preview : [...preview, ...preview]

  return (
    <div className="relative -mx-4 overflow-hidden px-4 sm:mx-0 sm:px-0">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[color:var(--site-surface-muted)] to-transparent sm:w-12"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[color:var(--site-surface-muted)] to-transparent sm:w-12"
        aria-hidden
      />
      <div
        className={
          prefersReducedMotion
            ? 'flex gap-3 overflow-x-auto pb-1'
            : 'flex w-max gap-3 motion-safe:animate-reviews-marquee motion-safe:hover:[animation-play-state:paused]'
        }
      >
        {track.map((item, index) => (
          <GalleryMarqueeImage key={`${item.id}-${index}`} item={item} salonName={salonName} />
        ))}
      </div>
    </div>
  )
}
