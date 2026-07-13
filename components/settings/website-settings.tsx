'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { apiClient } from '@/lib/api'
import { useEntitlements } from '@/hooks/use-entitlements'
import { prepareShowcaseImagesForSave } from '@/lib/compress-showcase-image'
import { BookingShowcaseManager } from '@/components/settings/booking-showcase-manager'
import {
  DEFAULT_BOOKING_HERO_THEME,
  resolveBookingHeroTheme,
  resolveBookingHeroThemeIdFromAccent,
  type BookingHeroThemeId,
} from '@/lib/booking-hero-themes'
import { WebsiteCoverImagesManager } from '@/components/settings/website/website-cover-images-manager'
import { WebsiteCatalogTab } from '@/components/settings/website/website-catalog-tab'
import { WebsiteGalleryTab } from '@/components/settings/website/website-gallery-tab'
import { WebsiteOffersTab } from '@/components/settings/website/website-offers-tab'
import { WebsiteEnquiriesTab, type EnquiryCustomField } from '@/components/settings/website/website-enquiries-tab'
import { AppointmentSettings } from '@/components/settings/appointment-settings'
import { ExternalLink, Globe, Loader2 } from 'lucide-react'

const WEBSITE_TABS = [
  { value: 'analytics', label: 'Analytics' },
  { value: 'general', label: 'General' },
  { value: 'online-booking', label: 'Online Booking' },
  { value: 'services', label: 'Service Catalogue' },
  { value: 'products', label: 'Products' },
  { value: 'memberships', label: 'Memberships' },
  { value: 'packages', label: 'Packages' },
  { value: 'prepaid-wallets', label: 'Prepaid Wallets' },
  { value: 'offers', label: 'Offers' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'contact', label: 'Contact & Location' },
  { value: 'enquiries', label: 'Enquiries' },
  { value: 'seo', label: 'SEO' },
] as const

const WEBSITE_TAB_VALUES = new Set(WEBSITE_TABS.map((tab) => tab.value))

function isWebsiteTab(value: string | null): value is (typeof WEBSITE_TABS)[number]['value'] {
  return value != null && WEBSITE_TAB_VALUES.has(value as (typeof WEBSITE_TABS)[number]['value'])
}

type WebsiteSettingsData = {
  code: string
  name: string
  slug: string
  publicPath: string
  available: boolean
  enabled: boolean
  coverImage: string
  coverImages: string[]
  tagline: string
  description: string
  themeColor: string
  bookingHeroTheme: BookingHeroThemeId
  businessCategory: string
  seo: { title: string; metaDescription: string; ogImage: string }
  social: { instagram: string; facebook: string; googleMapsUrl: string; googleProfileUrl: string }
  contact: { whatsappNumber: string; callNumber: string }
  visibility: Record<string, boolean>
  enquiryForm?: { customFields: EnquiryCustomField[] }
}

type AnalyticsSummary = {
  days: number
  total: number
  byEvent: Record<string, number>
}

const EVENT_LABELS: Record<string, string> = {
  page_view: 'Page views',
  book_appointment_click: 'Book appointment clicks',
  service_book_now_click: 'Service book now',
  whatsapp_click: 'WhatsApp',
  call_click: 'Calls',
  directions_click: 'Directions',
  product_enquiry: 'Product enquiries',
  package_enquiry: 'Package enquiries',
  membership_enquiry: 'Membership enquiries',
  lead_submission: 'Lead submissions',
}

const ANALYTICS_PERIOD_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
] as const

export function WebsiteSettings() {
  const searchParams = useSearchParams()
  const { planInfo } = useEntitlements()
  const hasMiniWebsite = Boolean(planInfo?.features?.includes('mini_website'))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<WebsiteSettingsData | null>(null)
  const [slugCheck, setSlugCheck] = useState('')
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [analyticsDays, setAnalyticsDays] = useState('30')
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const [savingEnquiryForm, setSavingEnquiryForm] = useState(false)

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (isWebsiteTab(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiClient.get('/settings/website')
        if (!cancelled) {
          const loaded = res.data?.data
          if (loaded) {
            setData({
              ...loaded,
              bookingHeroTheme:
                loaded.bookingHeroTheme ||
                resolveBookingHeroThemeIdFromAccent(loaded.themeColor),
            })
          } else {
            setData(null)
          }
        }
      } catch (e: unknown) {
        toast({
          title: 'Could not load website settings',
          description: e instanceof Error ? e.message : undefined,
          variant: 'destructive',
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasMiniWebsite || !data?.enabled || activeTab !== 'analytics') {
      if (activeTab !== 'analytics') {
        setAnalyticsLoading(false)
      }
      return
    }
    let cancelled = false
    setAnalyticsLoading(true)
    ;(async () => {
      try {
        const res = await apiClient.get(`/settings/website/analytics?days=${analyticsDays}`)
        if (!cancelled) setAnalytics(res.data?.data || null)
      } catch {
        if (!cancelled) setAnalytics(null)
      } finally {
        if (!cancelled) setAnalyticsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hasMiniWebsite, data?.enabled, analyticsDays, activeTab])

  if (!hasMiniWebsite) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Salon mini website</h2>
        <p className="mt-2 text-sm text-slate-600">
          Your current plan does not include the public salon storefront. Upgrade to enable it.
        </p>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading website settings…
      </div>
    )
  }

  async function checkSlug() {
    if (!data?.slug) return
    try {
      const res = await apiClient.post('/settings/website/slug-available', { slug: data.slug })
      const available = res.data?.data?.available
      setSlugCheck(available ? 'Available' : `Unavailable (${res.data?.data?.reason || 'taken'})`)
    } catch {
      setSlugCheck('Could not check')
    }
  }

  async function save() {
    if (!data) return
    const payload = data
    setSaving(true)
    try {
      let coverImages = payload.coverImages || []
      if (coverImages.length > 0) {
        coverImages = await prepareShowcaseImagesForSave(coverImages)
      }
      const res = await apiClient.put('/settings/website', {
        enabled: payload.enabled,
        slug: payload.slug,
        coverImages,
        tagline: payload.tagline,
        description: payload.description,
        bookingHeroTheme: payload.bookingHeroTheme,
        businessCategory: payload.businessCategory,
        seo: payload.seo,
        social: payload.social,
        contact: payload.contact,
        visibility: payload.visibility,
        enquiryForm: payload.enquiryForm,
      })
      setData(res.data?.data || payload)
      toast({ title: 'Website settings saved' })
    } catch (e: unknown) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function saveEnquiryFormFields() {
    if (!data) return
    setSavingEnquiryForm(true)
    try {
      const res = await apiClient.put('/settings/website', {
        enquiryForm: { customFields: data.enquiryForm?.customFields || [] },
      })
      setData(res.data?.data || data)
      toast({ title: 'Enquiry form fields saved' })
    } catch (e: unknown) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSavingEnquiryForm(false)
    }
  }

  function selectHeroTheme(themeId: BookingHeroThemeId) {
    if (!data) return
    const theme = resolveBookingHeroTheme(themeId)
    setData({ ...data, bookingHeroTheme: themeId, themeColor: theme.accent })
  }

  function setVisibility(key: string, value: boolean) {
    if (!data) return
    setData({ ...data, visibility: { ...data.visibility, [key]: value } })
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = `${origin}${data.publicPath}`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Globe className="h-5 w-5" />
            Salon mini website
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Public SEO storefront that links into your existing booking page.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">Enabled</span>
          <Switch
            checked={data.enabled}
            onCheckedChange={(v) => setData({ ...data, enabled: v })}
          />
        </div>
      </div>

      {data.enabled ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <p className="font-medium text-emerald-900">Public URL</p>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-emerald-800 underline"
          >
            {publicUrl}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="inline-flex h-11 w-max min-w-full justify-start gap-1 rounded-xl bg-slate-100 p-1 sm:min-w-0">
            {WEBSITE_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="shrink-0 rounded-lg px-3 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="analytics" className="mt-0">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            {!data.enabled ? (
              <p className="text-sm text-slate-500">
                Enable your salon website to view storefront analytics.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">First-party events from your public mini-site.</p>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="analytics-period" className="text-sm text-slate-500">
                      Date period
                    </Label>
                    <Select value={analyticsDays} onValueChange={setAnalyticsDays}>
                      <SelectTrigger id="analytics-period" className="w-[160px]">
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                      <SelectContent>
                        {ANALYTICS_PERIOD_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {analyticsLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
                  </div>
                ) : analytics ? (
                  <>
                    <p className="text-sm text-slate-500">
                      {analytics.total} total events in the last {analytics.days} days
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {Object.entries(EVENT_LABELS).map(([key, label]) => (
                        <div key={key} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                          <p className="text-slate-500">{label}</p>
                          <p className="text-lg font-semibold">{analytics.byEvent[key] || 0}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="py-4 text-sm text-slate-500">No analytics data for this period yet.</p>
                )}
              </>
            )}
          </section>
        </TabsContent>

        <TabsContent value="general" className="mt-0 space-y-4">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="slug">URL slug</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="slug"
                    value={data.slug}
                    onChange={(e) => setData({ ...data, slug: e.target.value.toLowerCase() })}
                    placeholder={data.code?.toLowerCase()}
                  />
                  <Button type="button" variant="outline" onClick={checkSlug}>
                    Check
                  </Button>
                </div>
                {slugCheck ? <p className="mt-1 text-xs text-slate-500">{slugCheck}</p> : null}
                <p className="mt-1 text-xs text-slate-500">
                  Falls back to {data.code?.toLowerCase()} if empty.
                </p>
              </div>
              <div>
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  id="tagline"
                  className="mt-1"
                  value={data.tagline}
                  onChange={(e) => setData({ ...data, tagline: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  className="mt-1"
                  rows={4}
                  value={data.description}
                  onChange={(e) => setData({ ...data, description: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <BookingShowcaseManager
                  heroTheme={data.bookingHeroTheme || DEFAULT_BOOKING_HERO_THEME}
                  onHeroThemeChange={selectHeroTheme}
                />
              </div>
              <div className="md:col-span-2">
                <WebsiteCoverImagesManager
                  images={data.coverImages || (data.coverImage ? [data.coverImage] : [])}
                  onImagesChange={(coverImages) =>
                    setData({
                      ...data,
                      coverImages,
                      coverImage: coverImages[0] || '',
                    })
                  }
                />
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="online-booking" className="mt-0">
          <AppointmentSettings embedded />
        </TabsContent>

        <TabsContent value="services" className="mt-0">
          <WebsiteCatalogTab
            type="services"
            title="Service catalogue"
            description="Choose which services appear on your public mini-site and home page."
            showEnableAll
            listPreviewLimit={12}
            showAllLabel="Show all services"
            leadToggles={[
              {
                key: 'showServices',
                label: 'Show service catalogue',
                description: 'Display the services section and services page on your mini-site.',
                checked: data.visibility.showServices !== false,
                onChange: (v) => setVisibility('showServices', v),
              },
            ]}
            extraToggles={[
              {
                key: 'showPrices',
                label: 'Show prices',
                description: 'Display service prices on the public website.',
                checked: data.visibility.showPrices !== false,
                onChange: (v) => setVisibility('showPrices', v),
              },
              {
                key: 'showStaff',
                label: 'Show team',
                description: 'Show the team page and staff section on your mini-site.',
                checked: data.visibility.showStaff !== false,
                onChange: (v) => setVisibility('showStaff', v),
              },
            ]}
            emptyHint="No active services found. Add services in Service Management first."
          />
        </TabsContent>

        <TabsContent value="products" className="mt-0">
          <WebsiteCatalogTab
            type="products"
            title="Products"
            description="Retail products shown on your public products page."
            showEnableAll
            listPreviewLimit={12}
            showAllLabel="Show all products"
            sectionEnabled={data.visibility.showProducts !== false}
            onSectionEnabledChange={(v) => setVisibility('showProducts', v)}
            extraToggles={[
              {
                key: 'retailProductsOnly',
                label: 'Show only retail products',
                description: 'Hide backbar and service-only inventory from your public products page.',
                checked: Boolean(data.visibility.retailProductsOnly),
                onChange: (v) => setVisibility('retailProductsOnly', v),
              },
              {
                key: 'showProductPrices',
                label: 'Show prices',
                description: 'Display product prices on your public products page.',
                checked:
                  typeof data.visibility.showProductPrices === 'boolean'
                    ? data.visibility.showProductPrices
                    : data.visibility.showPrices !== false,
                onChange: (v) => setVisibility('showProductPrices', v),
              },
              {
                key: 'showProductImages',
                label: 'Show images',
                description: 'Display product photos on your public products page.',
                checked: data.visibility.showProductImages !== false,
                onChange: (v) => setVisibility('showProductImages', v),
              },
            ]}
            emptyHint="No active products found. Add products in Inventory first."
          />
        </TabsContent>

        <TabsContent value="memberships" className="mt-0">
          <WebsiteCatalogTab
            type="memberships"
            title="Memberships"
            description="Membership plans visitors can enquire about on your mini-site."
            showEnableAll
            sectionEnabled={Boolean(data.visibility.showMemberships)}
            onSectionEnabledChange={(v) => setVisibility('showMemberships', v)}
            emptyHint="No active membership plans found."
          />
        </TabsContent>

        <TabsContent value="packages" className="mt-0">
          <WebsiteCatalogTab
            type="packages"
            title="Packages"
            description="Service packages and bundles on your public packages page."
            showEnableAll
            sectionEnabled={data.visibility.showPackages !== false}
            onSectionEnabledChange={(v) => setVisibility('showPackages', v)}
            emptyHint="No active packages found."
          />
        </TabsContent>

        <TabsContent value="prepaid-wallets" className="mt-0">
          <WebsiteCatalogTab
            type="prepaid-wallets"
            title="Prepaid wallets"
            description="Prepaid wallet plans promoted on your mini-site."
            showEnableAll
            sectionEnabled={Boolean(data.visibility.showPrepaidWallets)}
            onSectionEnabledChange={(v) => setVisibility('showPrepaidWallets', v)}
            emptyHint="No active prepaid wallet plans found. Configure them under Prepaid Wallet settings."
          />
        </TabsContent>

        <TabsContent value="offers" className="mt-0">
          <WebsiteOffersTab
            enabled={data.visibility.showOffers !== false}
            onEnabledChange={(v) => setVisibility('showOffers', v)}
          />
        </TabsContent>

        <TabsContent value="reviews" className="mt-0">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h3 className="font-medium">Reviews</h3>
              <p className="mt-1 text-sm text-slate-600">
                Client feedback and Google reviews shown on your public reviews page.
              </p>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 text-sm">
              <span className="font-medium">Show reviews on website</span>
              <Switch
                checked={data.visibility.showReviews !== false}
                onCheckedChange={(v) => setVisibility('showReviews', v)}
              />
            </label>
            <p className="text-sm text-slate-500">
              Reviews come from post-visit feedback in your CRM and Google Business Profile when connected.
              Connect Google Business under Settings to sync Google reviews.
            </p>
          </section>
        </TabsContent>

        <TabsContent value="gallery" className="mt-0">
          <WebsiteGalleryTab
            enabled={data.visibility.showGallery !== false}
            onEnabledChange={(v) => setVisibility('showGallery', v)}
          />
        </TabsContent>

        <TabsContent value="contact" className="mt-0">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <h3 className="font-medium">Contact & location</h3>
              <p className="mt-1 text-sm text-slate-600">
                How visitors reach you from the mini-site hero and contact page.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>WhatsApp number</Label>
                <Input
                  className="mt-1"
                  value={data.contact.whatsappNumber}
                  onChange={(e) =>
                    setData({ ...data, contact: { ...data.contact, whatsappNumber: e.target.value } })
                  }
                  placeholder="Optional — defaults to business phone"
                />
              </div>
              <div>
                <Label>Instagram URL</Label>
                <Input
                  className="mt-1"
                  value={data.social.instagram}
                  onChange={(e) =>
                    setData({ ...data, social: { ...data.social, instagram: e.target.value } })
                  }
                />
              </div>
              <div>
                <Label>Facebook URL</Label>
                <Input
                  className="mt-1"
                  value={data.social.facebook}
                  onChange={(e) =>
                    setData({ ...data, social: { ...data.social, facebook: e.target.value } })
                  }
                />
              </div>
              <div className="md:col-span-2">
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Address, phone, logo, Google Maps, and Google Review links are managed in{' '}
                  <span className="font-medium">Settings → Business</span> and shown on your mini-site
                  automatically.
                </p>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="enquiries" className="mt-0">
          <WebsiteEnquiriesTab
            customFields={data.enquiryForm?.customFields || []}
            onCustomFieldsChange={(customFields) =>
              setData({
                ...data,
                enquiryForm: { customFields },
              })
            }
            onSaveFormFields={saveEnquiryFormFields}
            savingFormFields={savingEnquiryForm}
          />
        </TabsContent>

        <TabsContent value="seo" className="mt-0">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="grid gap-4">
              <div>
                <Label>Page title</Label>
                <Input
                  className="mt-1"
                  value={data.seo.title}
                  onChange={(e) => setData({ ...data, seo: { ...data.seo, title: e.target.value } })}
                />
              </div>
              <div>
                <Label>Meta description</Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={data.seo.metaDescription}
                  onChange={(e) =>
                    setData({ ...data, seo: { ...data.seo, metaDescription: e.target.value } })
                  }
                />
              </div>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <Button onClick={save} disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
          </>
        ) : (
          'Save website settings'
        )}
      </Button>
    </div>
  )
}
