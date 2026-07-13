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

  async function addImage(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) {
      toast({ title: 'Please upload an image file', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      const imageUrl = await compressImageFile(file)
      await apiClient.post('/settings/website/gallery', { imageUrl, title: file.name.replace(/\.[^.]+$/, '') })
      await load()
      toast({ title: 'Image added to gallery' })
    } catch (e: unknown) {
      toast({
        title: 'Upload failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
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
              className="sr-only"
              onChange={(e) => void addImage(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <ImagePlus className="mr-2 h-4 w-4" /> Upload image
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-lg border border-slate-100">
                  <div className="aspect-[4/3] bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt={item.alt || item.title} className="h-full w-full object-cover" />
                  </div>
                  <div className="space-y-2 p-3">
                    <Input
                      value={item.title}
                      placeholder="Caption"
                      onChange={(e) => setItems((prev) =>
                        prev.map((row) => (row.id === item.id ? { ...row, title: e.target.value } : row))
                      )}
                      onBlur={() => void updateItem(item.id, { title: item.title })}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-slate-500">Public</Label>
                        <Switch
                          checked={item.isPublic}
                          onCheckedChange={(v) => void updateItem(item.id, { isPublic: v })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void removeItem(item.id)}
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-4 w-4" />
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
