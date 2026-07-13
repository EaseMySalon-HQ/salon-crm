'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { apiClient } from '@/lib/api'
import { compressImageFile } from '@/lib/compress-showcase-image'
import { ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react'

type Offer = {
  id: string
  title: string
  shortDescription: string
  imageUrl: string
  ctaLabel: string
  ctaHref: string
  isPublic: boolean
}

export function WebsiteOffersTab({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean
  onEnabledChange: (v: boolean) => void
}) {
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({
    title: '',
    shortDescription: '',
    imageUrl: '',
    ctaLabel: 'Learn more',
    ctaHref: '',
  })
  const posterInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/settings/website/offers')
      setOffers(res.data?.data || [])
    } catch {
      setOffers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function uploadPoster(file: File | undefined, forDraft = true, offerId?: string) {
    if (!file || !file.type.startsWith('image/')) {
      toast({ title: 'Please upload an image file', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const dataUrl = await compressImageFile(file)
      if (forDraft) {
        setDraft((d) => ({ ...d, imageUrl: dataUrl }))
      } else if (offerId) {
        await apiClient.put(`/settings/website/offers/${offerId}`, { imageUrl: dataUrl })
        setOffers((prev) =>
          prev.map((o) => (o.id === offerId ? { ...o, imageUrl: dataUrl } : o))
        )
        toast({ title: 'Poster updated' })
      }
    } catch (e: unknown) {
      toast({
        title: 'Upload failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
      if (posterInputRef.current) posterInputRef.current.value = ''
    }
  }

  async function createOffer() {
    if (!draft.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await apiClient.post('/settings/website/offers', draft)
      setDraft({ title: '', shortDescription: '', imageUrl: '', ctaLabel: 'Learn more', ctaHref: '' })
      await load()
      toast({ title: 'Offer added' })
    } catch (e: unknown) {
      toast({
        title: 'Could not add offer',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function updateOffer(id: string, patch: Partial<Offer>) {
    setSaving(true)
    try {
      await apiClient.put(`/settings/website/offers/${id}`, patch)
      setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    } catch (e: unknown) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function removeOffer(id: string) {
    setSaving(true)
    try {
      await apiClient.delete(`/settings/website/offers/${id}`)
      setOffers((prev) => prev.filter((o) => o.id !== id))
      toast({ title: 'Offer removed' })
    } catch (e: unknown) {
      toast({ title: 'Could not remove offer', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="font-medium">Offers</h3>
        <p className="mt-1 text-sm text-slate-600">
          Promotional posters and offers on your public mini-site.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 text-sm">
        <span className="font-medium">Show offers on website</span>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </label>

      {!enabled ? (
        <p className="text-sm text-slate-500">Enable offers to upload posters and manage promotions.</p>
      ) : (
        <>
          <div className="space-y-3 rounded-lg border border-dashed border-slate-200 p-4">
            <p className="text-sm font-medium">Add offer</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Title</Label>
                <Input
                  className="mt-1"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div>
                <Label>CTA label</Label>
                <Input
                  className="mt-1"
                  value={draft.ctaLabel}
                  onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Short description</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={draft.shortDescription}
                  onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Poster image</Label>
                <div className="mt-2 flex flex-wrap items-start gap-3">
                  {draft.imageUrl ? (
                    <div className="relative h-28 w-40 overflow-hidden rounded-lg border bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={draft.imageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : null}
                  <input
                    ref={posterInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    className="sr-only"
                    onChange={(e) => void uploadPoster(e.target.files?.[0], true)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => posterInputRef.current?.click()}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />
                    Upload poster
                  </Button>
                </div>
              </div>
            </div>
            <Button type="button" size="sm" disabled={saving} onClick={() => void createOffer()}>
              <Plus className="mr-2 h-4 w-4" /> Add offer
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading offers…
            </div>
          ) : !offers.length ? (
            <p className="text-sm text-slate-500">No offers yet.</p>
          ) : (
            <div className="space-y-3">
              {offers.map((offer) => (
                <div key={offer.id} className="rounded-lg border border-slate-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{offer.title}</p>
                      {offer.shortDescription ? (
                        <p className="mt-1 text-sm text-slate-600">{offer.shortDescription}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-slate-500">Public</Label>
                      <Switch
                        checked={offer.isPublic}
                        onCheckedChange={(v) => void updateOffer(offer.id, { isPublic: v })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void removeOffer(offer.id)}
                        aria-label="Remove offer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {offer.imageUrl ? (
                      <div className="h-20 w-32 overflow-hidden rounded border bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={offer.imageUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">No poster</span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/jpeg,image/png,image/webp,image/jpg'
                        input.onchange = () => void uploadPoster(input.files?.[0], false, offer.id)
                        input.click()
                      }}
                    >
                      <ImagePlus className="mr-2 h-4 w-4" />
                      {offer.imageUrl ? 'Replace poster' : 'Upload poster'}
                    </Button>
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
