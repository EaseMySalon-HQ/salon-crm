'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { compressImageFile, SHOWCASE_IMAGE_MAX_CHARS } from '@/lib/compress-showcase-image'

const MAX_IMAGES = 8

export function WebsiteCoverImagesManager({
  images,
  onImagesChange,
  disabled,
}: {
  images: string[]
  onImagesChange: (images: string[]) => void
  disabled?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files?.length || disabled) return
    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) {
      toast({
        title: 'Image limit reached',
        description: `You can add up to ${MAX_IMAGES} cover photos.`,
        variant: 'destructive',
      })
      return
    }

    const toAdd: string[] = []
    for (const file of Array.from(files).slice(0, remaining)) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid file',
          description: `${file.name} is not an image.`,
          variant: 'destructive',
        })
        continue
      }
      try {
        const dataUrl = await compressImageFile(file)
        if (dataUrl.length > SHOWCASE_IMAGE_MAX_CHARS) {
          toast({
            title: 'Image too large',
            description: `${file.name} is still too large after compression.`,
            variant: 'destructive',
          })
          continue
        }
        toAdd.push(dataUrl)
      } catch (error) {
        toast({
          title: 'Upload failed',
          description: error instanceof Error ? error.message : `Could not read ${file.name}.`,
          variant: 'destructive',
        })
      }
    }

    if (toAdd.length) onImagesChange([...images, ...toAdd])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAt(index: number) {
    onImagesChange(images.filter((_, i) => i !== index))
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return
    const next = [...images]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onImagesChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Cover images</Label>
        <span className="text-xs text-slate-500">
          {images.length}/{MAX_IMAGES}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Hero carousel on your mini-site home page. First image is the default. JPG, PNG, or WebP — max
        5 MB each.
      </p>

      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {images.map((src, index) => (
            <li
              key={`${index}-${src.slice(0, 24)}`}
              className="group relative h-24 w-36 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-between bg-black/40 px-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:bg-white/20 hover:text-white"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, index - 1)}
                  aria-label="Move earlier"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:bg-white/20 hover:text-white"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  aria-label="Remove photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white hover:bg-white/20 hover:text-white"
                  disabled={disabled || index === images.length - 1}
                  onClick={() => move(index, index + 1)}
                  aria-label="Move later"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {index + 1}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex h-24 w-full max-w-sm items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
          No cover images yet
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        multiple
        className="hidden"
        disabled={disabled || images.length >= MAX_IMAGES}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        disabled={disabled || images.length >= MAX_IMAGES}
        onClick={() => fileInputRef.current?.click()}
      >
        <ImagePlus className="mr-2 h-4 w-4" />
        Add cover photos
      </Button>
    </div>
  )
}
