import type { SiteOffer } from '@/lib/public-site-api'
import { MiniSiteImageLightbox } from '@/components/mini-site/mini-site-image-lightbox'
import { ST } from '@/lib/mini-site-theme'
import { cn } from '@/lib/utils'

export function OfferCarousel({ offers }: { offers: SiteOffer[] }) {
  if (!offers.length) return null
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {offers.map((offer) => (
        <article
          key={offer.id}
          className={cn('min-w-[260px] max-w-xs shrink-0 overflow-hidden', ST.card)}
        >
          {offer.imageUrl ? (
            <MiniSiteImageLightbox
              src={offer.imageUrl}
              alt={offer.title}
              imageClassName="h-36 w-full object-cover transition hover:opacity-95"
            />
          ) : null}
          <div className="p-4">
            <h3 className={cn('font-medium', ST.textPrimary)}>{offer.title}</h3>
            <p className={cn('mt-1 line-clamp-2 text-sm', ST.textMuted)}>{offer.shortDescription}</p>
            {offer.ctaHref ? (
              <a href={offer.ctaHref} className={cn('mt-3 inline-block text-sm font-medium', ST.link)}>
                {offer.ctaLabel || 'Learn more'}
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}
