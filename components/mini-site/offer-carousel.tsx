import type { SiteOffer } from '@/lib/public-site-api'

export function OfferCarousel({ offers }: { offers: SiteOffer[] }) {
  if (!offers.length) return null
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {offers.map((offer) => (
        <article
          key={offer.id}
          className="min-w-[260px] max-w-xs shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
        >
          {offer.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={offer.imageUrl} alt={offer.title} className="h-36 w-full object-cover" />
          ) : null}
          <div className="p-4">
            <h3 className="font-medium">{offer.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-stone-600">{offer.shortDescription}</p>
            {offer.ctaHref ? (
              <a href={offer.ctaHref} className="mt-3 inline-block text-sm font-medium underline">
                {offer.ctaLabel || 'Learn more'}
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}
