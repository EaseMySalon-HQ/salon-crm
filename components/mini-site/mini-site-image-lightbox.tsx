'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function MiniSiteImageLightbox({
  src,
  alt,
  className,
  imageClassName,
}: {
  src: string
  alt: string
  className?: string
  imageClassName?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('block w-full cursor-zoom-in text-left', className)}
        aria-label={`View full image: ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={imageClassName} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[min(96vw,56rem)] gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none"
          overlayClassName="bg-black/90"
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <div className="relative flex max-h-[90vh] items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[90vh] w-full object-contain"
            />
            <DialogClose
              className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Close image"
            >
              <X className="h-5 w-5" />
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
