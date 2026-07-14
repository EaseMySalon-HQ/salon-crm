/**
 * Public salon mini-website API (unauthenticated).
 */

import { resolveApiBaseUrl } from '@/lib/resolve-api-base-url'
import { miniSiteBasePath } from '@/lib/mini-site-path'

function apiBase() {
  return resolveApiBaseUrl()
}

function siteBase(slug: string) {
  return `${apiBase()}/public/site/${encodeURIComponent(String(slug).trim().toLowerCase())}`
}

async function siteFetch<T>(slug: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${siteBase(slug)}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `Request failed (${res.status})`)
  }
  return json.data as T
}

export type SiteVisibility = {
  showPrices: boolean
  showServices: boolean
  showStaff: boolean
  showProducts: boolean
  retailProductsOnly: boolean
  showProductPrices: boolean
  showProductImages: boolean
  showPackages: boolean
  showMemberships: boolean
  showPrepaidWallets: boolean
  showOffers: boolean
  showGallery: boolean
  showReviews: boolean
}

export type SiteProfile = {
  slug: string
  bookingCode: string
  name: string
  businessType: string
  businessCategory: string
  tagline: string
  description: string
  coverImage: string
  coverImages: string[]
  showcaseImages: string[]
  logoUrl: string | null
  themeColor: string
  address: { street?: string; city?: string; state?: string; zipCode?: string; country?: string }
  contact: { phone: string; whatsappNumber: string; email?: string; website?: string }
  social: { instagram: string; facebook: string; googleMapsUrl: string; googleProfileUrl: string }
  operatingHours: Record<string, { open?: string; close?: string; closed?: boolean }>
  visibility: SiteVisibility
  featured: {
    serviceIds: string[]
    packageIds: string[]
    productIds: string[]
    membershipIds: string[]
  }
  seo: { title: string; metaDescription: string; ogImage: string }
  onlineBookingEnabled: boolean
  externalAnalytics: {
    gaMeasurementId: string
    metaPixelId: string
    plausibleDomain: string
  }
  counts: Record<string, number>
  rating: { average: number; count: number } | null
  enquiryForm?: {
    customFields: SiteEnquiryCustomField[]
  }
}

export type SiteEnquiryCustomField = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date' | 'select'
  required: boolean
  placeholder: string
  options: string[]
}

export type SiteService = {
  id: string
  slug: string
  name: string
  category: string
  duration: number
  price: number | null
  fullPrice: number | null
  description: string
  shortDescription: string
  imageUrl: string
  imageAlt: string
  isFeatured: boolean
  bookableOnline: boolean
  seoTitle?: string
  seoDescription?: string
}

export type SitePackage = {
  id: string
  slug: string
  name: string
  type: string
  description: string
  shortDescription: string
  price: number | null
  imageUrl: string
  imageAlt: string
  bookableServiceIds: string[]
  bookableOnline: boolean
  isFeatured: boolean
}

export type SiteProduct = {
  id: string
  slug: string
  name: string
  category: string
  price: number | null
  description: string
  shortDescription: string
  imageUrl: string
  imageAlt: string
  isFeatured: boolean
  seoTitle?: string
  seoDescription?: string
}

export type SiteMembership = {
  id: string
  slug: string
  name: string
  price: number | null
  durationInDays: number | null
  unlimitedDuration: boolean
  shortDescription: string
  description: string
  imageUrl: string
  isFeatured: boolean
}

export type SitePrepaidWallet = {
  id: string
  slug: string
  name: string
  payAmount: number | null
  creditAmount: number | null
  validityDays: number
  shortDescription: string
  isFeatured: boolean
}

export type SiteStaff = {
  id: string
  slug: string
  name: string
  title: string
  avatar: string
  specialties: string[]
  shortDescription: string
  isFeatured: boolean
}

export type SiteGalleryItem = {
  id: string
  title: string
  imageUrl: string
  alt: string
  isFeatured: boolean
}

export type SiteOffer = {
  id: string
  title: string
  shortDescription: string
  imageUrl: string
  ctaLabel: string
  ctaHref: string
  isFeatured: boolean
}

export type SiteReview = {
  id: string
  authorName: string
  rating: number
  text: string
  source: string
  createdAt?: string | null
}

export async function fetchSiteProfile(slug: string) {
  return siteFetch<SiteProfile>(slug, '/profile')
}

export async function fetchSiteServices(slug: string, opts?: { featured?: boolean }) {
  const q = opts?.featured ? '?featured=1' : ''
  const data = await siteFetch<{ services: SiteService[] }>(slug, `/services${q}`)
  return data.services || []
}

export async function fetchSiteService(slug: string, serviceSlug: string) {
  const data = await siteFetch<{ service: SiteService }>(slug, `/services/${encodeURIComponent(serviceSlug)}`)
  return data.service
}

export async function fetchSitePackages(slug: string, opts?: { featured?: boolean }) {
  const q = opts?.featured ? '?featured=1' : ''
  const data = await siteFetch<{ packages: SitePackage[] }>(slug, `/packages${q}`)
  return data.packages || []
}

export async function fetchSiteProducts(slug: string, opts?: { featured?: boolean }) {
  const q = opts?.featured ? '?featured=1' : ''
  const data = await siteFetch<{ products: SiteProduct[] }>(slug, `/products${q}`)
  return data.products || []
}

export async function fetchSiteProduct(slug: string, productSlug: string) {
  const data = await siteFetch<{ product: SiteProduct }>(
    slug,
    `/products/${encodeURIComponent(productSlug)}`
  )
  return data.product
}

export async function fetchSiteMemberships(slug: string, opts?: { featured?: boolean }) {
  const q = opts?.featured ? '?featured=1' : ''
  const data = await siteFetch<{ memberships: SiteMembership[] }>(slug, `/memberships${q}`)
  return data.memberships || []
}

export async function fetchSitePrepaidWallets(slug: string, opts?: { featured?: boolean }) {
  const q = opts?.featured ? '?featured=1' : ''
  const data = await siteFetch<{ prepaidWallets: SitePrepaidWallet[] }>(slug, `/prepaid-wallets${q}`)
  return data.prepaidWallets || []
}

export async function fetchSiteTeam(slug: string) {
  const data = await siteFetch<{ staff: SiteStaff[] }>(slug, '/team')
  return data.staff || []
}

export async function fetchSiteGallery(slug: string) {
  const data = await siteFetch<{ items: SiteGalleryItem[] }>(slug, '/gallery')
  return data.items || []
}

export async function fetchSiteOffers(slug: string) {
  const data = await siteFetch<{ offers: SiteOffer[] }>(slug, '/offers')
  return data.offers || []
}

export async function fetchSiteReviews(slug: string) {
  const data = await siteFetch<{ reviews: SiteReview[] }>(slug, '/reviews')
  return data.reviews || []
}

export async function submitSiteEnquiry(
  slug: string,
  body: {
    type?: string
    name: string
    phone: string
    email?: string
    city?: string
    message?: string
    relatedServiceId?: string
    relatedPackageId?: string
    relatedProductId?: string
    relatedMembershipId?: string
    customFields?: Record<string, string>
    website?: string
  }
) {
  return siteFetch<{ received: boolean }>(slug, '/enquiry', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function trackSiteEvent(
  slug: string,
  payload: { event: string; path?: string; refId?: string; sessionId?: string }
) {
  try {
    await siteFetch(slug, '/track', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch {
    // best-effort
  }
}

export function formatInr(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return null
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
}

export function bookAppointmentHref(slug: string, opts?: { serviceId?: string; packageId?: string }) {
  const base = miniSiteBasePath(slug, 'book')
  const params = new URLSearchParams()
  if (opts?.serviceId) params.set('service', opts.serviceId)
  if (opts?.packageId) params.set('package', opts.packageId)
  const q = params.toString()
  return q ? `${base}?${q}` : base
}

export function whatsappHref(phone: string, text?: string) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return '#'
  const msg = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${digits}${msg}`
}

export function telHref(phone: string) {
  const digits = String(phone || '').replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : '#'
}

export function mapsHref(urlOrAddress: string) {
  if (!urlOrAddress) return '#'
  if (/^https?:\/\//i.test(urlOrAddress)) return urlOrAddress
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(urlOrAddress)}`
}

export function formatAddress(address: SiteProfile['address']) {
  return [address?.street, address?.city, address?.state, address?.zipCode].filter(Boolean).join(', ')
}
