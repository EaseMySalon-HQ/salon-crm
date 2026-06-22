"use client"

import { useRef } from "react"
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { compressImageFile, SHOWCASE_IMAGE_MAX_CHARS } from "@/lib/compress-showcase-image"
import {
  BOOKING_HERO_THEME_IDS,
  resolveBookingHeroTheme,
  type BookingHeroThemeId,
} from "@/lib/booking-hero-themes"
import { cn } from "@/lib/utils"

const MAX_IMAGES = 8

type BookingShowcaseManagerProps = {
  tagline: string
  images: string[]
  heroTheme?: BookingHeroThemeId
  disabled?: boolean
  onTaglineChange: (value: string) => void
  onImagesChange: (images: string[]) => void
  onHeroThemeChange: (theme: BookingHeroThemeId) => void
}

export function BookingShowcaseManager({
  tagline,
  images,
  heroTheme,
  disabled,
  onTaglineChange,
  onImagesChange,
  onHeroThemeChange,
}: BookingShowcaseManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || disabled) return
    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) {
      toast({
        title: "Image limit reached",
        description: `You can add up to ${MAX_IMAGES} showcase photos.`,
        variant: "destructive",
      })
      return
    }

    const toAdd: string[] = []
    for (const file of Array.from(files).slice(0, remaining)) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Invalid file", description: `${file.name} is not an image.`, variant: "destructive" })
        continue
      }
      try {
        const dataUrl = await compressImageFile(file)
        if (dataUrl.length > SHOWCASE_IMAGE_MAX_CHARS) {
          toast({
            title: "Image too large",
            description: `${file.name} is still too large after compression. Try a smaller photo.`,
            variant: "destructive",
          })
          continue
        }
        toAdd.push(dataUrl)
      } catch (error) {
        const message = error instanceof Error ? error.message : `Could not read ${file.name}.`
        toast({ title: "Upload failed", description: message, variant: "destructive" })
      }
    }

    if (toAdd.length) {
      onImagesChange([...images, ...toAdd])
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeAt = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index))
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return
    const next = [...images]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onImagesChange(next)
  }

  const resolvedHeroTheme = resolveBookingHeroTheme(heroTheme)
  const selectedTheme = resolvedHeroTheme

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Label>Hero background</Label>
        <p className="text-xs text-slate-500">
          Choose the cover gradient behind your booking page header.
        </p>
        <div className="flex flex-wrap gap-2">
          {BOOKING_HERO_THEME_IDS.map((id) => {
            const theme = resolveBookingHeroTheme(id)
            const selected = resolvedHeroTheme.id === id
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                aria-label={theme.label}
                aria-pressed={selected}
                title={theme.label}
                onClick={() => onHeroThemeChange(id)}
                className={cn(
                  "relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition",
                  selected
                    ? "border-[#7C3AED] ring-2 ring-[#7C3AED]/20"
                    : "border-slate-200 hover:border-slate-300"
                )}
              >
                <div className="absolute inset-0" style={{ backgroundColor: theme.baseBg }}>
                  <div
                    className="h-full w-full opacity-90"
                    style={{ background: theme.overlay }}
                    aria-hidden
                  />
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-slate-500">
          Selected: <span className="font-medium text-slate-700">{selectedTheme.label}</span>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="booking-tagline">Booking page tagline</Label>
        <Input
          id="booking-tagline"
          value={tagline}
          onChange={(e) => onTaglineChange(e.target.value)}
          placeholder="e.g. Crafted cuts & calm vibes"
          maxLength={120}
          disabled={disabled}
        />
        <p className="text-xs text-slate-500">Shown under your salon name on the public booking page.</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Showcase photos</Label>
          <span className="text-xs text-slate-500">
            {images.length}/{MAX_IMAGES}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Upload photos for the carousel on your booking page. JPG, PNG, or WebP — max 5 MB each.
        </p>

        {images.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {images.map((src, index) => (
              <li
                key={`${index}-${src.slice(0, 24)}`}
                className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-between bg-black/40 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-white hover:bg-white/20 hover:text-white"
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
                    className="h-6 w-6 text-white hover:bg-white/20 hover:text-white"
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
                    className="h-6 w-6 text-white hover:bg-white/20 hover:text-white"
                    disabled={disabled || index === images.length - 1}
                    onClick={() => move(index, index + 1)}
                    aria-label="Move later"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {index + 1}
                </span>
              </li>
            ))}
          </ul>
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
          Add photos
        </Button>
      </div>
    </div>
  )
}
