'use client'

import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const AUTO_SCROLL_MS = 5000

export function HeroCoverCarousel({
  images,
  salonName,
}: {
  images: string[]
  salonName: string
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: images.length > 1, duration: 28 })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap())
    onSelect()
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
      emblaApi.off('reInit', onSelect)
    }
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi || images.length <= 1 || isPaused) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      emblaApi.scrollNext()
    }, AUTO_SCROLL_MS)
    return () => window.clearInterval(timer)
  }, [emblaApi, images.length, isPaused])

  if (images.length <= 1) {
    const src = images[0]
    return src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-full w-full object-cover" />
    ) : (
      <div className="h-full w-full bg-gradient-to-br from-stone-800 via-stone-700 to-stone-900" />
    )
  }

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsPaused(false)
        }
      }}
    >
      <div className="h-full overflow-hidden" ref={emblaRef}>
        <div className="flex h-full">
          {images.map((src, index) => (
            <div key={`${index}-${src.slice(0, 32)}`} className="min-w-0 flex-[0_0_100%]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${salonName} cover ${index + 1}`}
                className="h-full w-full object-cover"
                loading={index === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={scrollPrev}
        className="absolute left-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 md:flex"
        aria-label="Previous cover image"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={scrollNext}
        className="absolute right-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 md:flex"
        aria-label="Next cover image"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-12 left-0 right-0 z-10 hidden justify-center gap-1.5 md:flex">
        {images.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => emblaApi?.scrollTo(index)}
            className={cn(
              'h-1.5 rounded-full transition-all',
              index === selectedIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/70'
            )}
            aria-label={`Go to cover image ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
