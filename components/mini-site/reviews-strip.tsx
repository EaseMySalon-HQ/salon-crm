import { Star } from 'lucide-react'
import type { SiteReview } from '@/lib/public-site-api'

export function ReviewsStrip({ reviews, limit }: { reviews: SiteReview[]; limit?: number }) {
  if (!reviews.length) return null
  const visible = limit != null ? reviews.slice(0, limit) : reviews
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {visible.map((review) => (
        <blockquote key={review.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-1 text-amber-500">
            {Array.from({ length: Math.min(5, Math.round(review.rating || 0)) }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-current" />
            ))}
          </div>
          <p className="mt-3 line-clamp-4 text-sm text-stone-700">&ldquo;{review.text}&rdquo;</p>
          <footer className="mt-4 text-sm font-medium text-stone-900">{review.authorName}</footer>
        </blockquote>
      ))}
    </div>
  )
}
