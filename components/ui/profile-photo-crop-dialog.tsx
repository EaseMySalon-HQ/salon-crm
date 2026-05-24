"use client"

import { useCallback, useState } from "react"
import Cropper, { type Area } from "react-easy-crop"
import { Loader2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { getCroppedImageDataUrl } from "@/lib/crop-image"

type ProfilePhotoCropDialogProps = {
  open: boolean
  imageSrc: string | null
  title?: string
  description?: string
  onOpenChange: (open: boolean) => void
  onCropComplete: (croppedDataUrl: string) => void
}

export function ProfilePhotoCropDialog({
  open,
  imageSrc,
  title = "Crop profile photo",
  description = "Drag to reposition and use the slider to zoom. The photo will be saved as a square.",
  onOpenChange,
  onCropComplete,
}: ProfilePhotoCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)

  const onCropCompleteInternal = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleApply = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    setSaving(true)
    try {
      const dataUrl = await getCroppedImageDataUrl(imageSrc, croppedAreaPixels, {
        maxSize: 512,
        quality: 0.92,
      })
      onCropComplete(dataUrl)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative mx-6 mt-2 h-[280px] overflow-hidden rounded-xl bg-slate-900">
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropCompleteInternal}
            />
          ) : null}
        </div>

        <div className="space-y-2 px-6 py-4">
          <p className="text-xs font-medium text-slate-600">Zoom</p>
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.05}
            onValueChange={(value) => setZoom(value[0] ?? 1)}
            aria-label="Crop zoom"
          />
        </div>

        <DialogFooter className="px-6 pb-6 pt-0 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleApply()} disabled={!imageSrc || !croppedAreaPixels || saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Apply crop"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
