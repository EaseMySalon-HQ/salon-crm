'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'
import { apiClient } from '@/lib/api'
import { compressImageFile } from '@/lib/compress-showcase-image'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'

type GalleryItem = {
  id: string
  title: string
  imageUrl: string
  alt: string
  isPublic: boolean
}

export function WebsiteGalleryTab({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean
  onEnabledChange: (v: boolean) => void
}) {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/settings/website/gallery')
      setItems(res.data?.data || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function addImages(files: FileList | null) {
    if (!files?.length) return

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    const skipped = files.length - imageFiles.length
    if (!imageFiles.length) {
      toast({ title: 'Please upload image files', variant: 'destructive' })
      return
    }

    setUploading(true)
    setUploadProgress({ current: 0, total: imageFiles.length })

    let added = 0
    const failures: string[] = []

    try {
      for (let i = 0; i < imageFiles.length; i += 1) {
        const file = imageFiles[i]
        setUploadProgress({ current: i + 1, total: imageFiles.length })
        try {
          const imageUrl = await compressImageFile(file)
          await apiClient.post('/settings/website/gallery', {
            imageUrl,
            title: file.name.replace(/\.[^.]+$/, ''),
          })
          added += 1
        } catch (e: unknown) {
          failures.push(file.name)
        }
      }

      if (added > 0) await load()

      if (added === imageFiles.length && skipped === 0) {
        toast({
          title: added === 1 ? 'Image added to gallery' : `${added} images added to gallery`,
        })
      } else if (added > 0) {
        toast({
          title: `${added} of ${imageFiles.length} images added`,
          description:
            [
              skipped > 0 ? `${skipped} non-image file${skipped === 1 ? '' : 's'} skipped.` : null,
              failures.length > 0 ? `Failed: ${failures.join(', ')}` : null,
            ]
              .filter(Boolean)
              .join(' ') || undefined,
        })
      } else {
        toast({
          title: 'Upload failed',
          description: failures.length
            ? `Could not upload: ${failures.join(', ')}`
            : 'No images could be uploaded.',
          variant: 'destructive',
        })
      }
    } finally {
      setUploading(false)
      setUploadProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function updateItem(id: string, patch: Partial<GalleryItem>) {
    try {
      await apiClient.put(`/settings/website/gallery/${id}`, patch)
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
    } catch {
      toast({ title: 'Update failed', variant: 'destructive' })
    }
  }

  async function removeItem(id: string) {
    try {
      await apiClient.delete(`/settings/website/gallery/${id}`)
      setItems((prev) => prev.filter((item) => item.id !== id))
      toast({ title: 'Image removed' })
    } catch {
      toast({ title: 'Could not remove image', variant: 'destructive' })
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="font-medium">Gallery</h3>
        <p className="mt-1 text-sm text-slate-600">Photos displayed on your public gallery page.</p>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 text-sm">
        <span className="font-medium">Show gallery on website</span>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </label>

      {!enabled ? (
        <p className="text-sm text-slate-500">Enable the gallery section to upload images.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              multiple
              className="sr-only"
              onChange={(e) => void addImages(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {uploadProgress
                    ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…`
                    : 'Uploading…'}
                </>
              ) : (
                <>
                  <ImagePlus className="mr-2 h-4 w-4" /> Upload images
                </>
              )}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading gallery…
            </div>
          ) : !items.length ? (
            <p className="text-sm text-slate-500">No gallery images yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {items.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-lg border border-slate-100">
                  <div className="aspect-square bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt={item.alt || item.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="space-y-1.5 p-2">
                    <Input
                      value={item.title}
                      placeholder="Caption"
                      className="h-8 text-xs"
                      onChange={(e) => setItems((prev) =>
                        prev.map((row) => (row.id === item.id ? { ...row, title: e.target.value } : row))
                      )}
                      onBlur={() => void updateItem(item.id, { title: item.title })}
                    />
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-[11px] text-slate-500">Public</Label>
                        <Switch
                          className="scale-90"
                          checked={item.isPublic}
                          onCheckedChange={(v) => void updateItem(item.id, { isPublic: v })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => void removeItem(item.id)}
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
