'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import type { SiteReview } from '@/lib/public-site-api'

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

function ReviewMarqueeCard({ review }: { review: SiteReview }) {
  return (
    <blockquote className="w-[min(100vw-2rem,320px)] shrink-0 rounded-2xl border border-[color:var(--site-border)] bg-[color:var(--site-surface)] p-5 shadow-sm sm:w-[320px]">
      <div className="flex items-center gap-1 text-amber-500">
        {Array.from({ length: Math.min(5, Math.round(review.rating || 0)) }).map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-current" />
        ))}
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-[color:var(--site-text-muted)]">
        &ldquo;{review.text}&rdquo;
      </p>
      <footer className="mt-4 text-sm font-medium text-[color:var(--site-text-primary)]">
        {review.authorName}
      </footer>
    </blockquote>
  )
}

export function ReviewsMarquee({ reviews, max = 5 }: { reviews: SiteReview[]; max?: number }) {
  const items = reviews.slice(0, max)
  const prefersReducedMotion = usePrefersReducedMotion()
  if (!items.length) return null

  const track = prefersReducedMotion ? items : [...items, ...items]

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
            ? 'flex gap-4 overflow-x-auto pb-1'
            : 'flex w-max gap-4 motion-safe:animate-reviews-marquee motion-safe:hover:[animation-play-state:paused]'
        }
      >
        {track.map((review, index) => (
          <ReviewMarqueeCard key={`${review.id}-${index}`} review={review} />
        ))}
      </div>
    </div>
  )
}
