import type { Metadata } from 'next'
import { EnquiryForm } from '@/components/mini-site/enquiry-form'
import {
  formatAddress,
  mapsHref,
  telHref,
  whatsappHref,
} from '@/lib/public-site-api'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'
import { ST } from '@/lib/mini-site-theme'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  return siteMetadata(profile, '/contact')
}

export default async function ContactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const profile = await loadSiteProfile(raw)
  const address = formatAddress(profile.address)
  const maps = mapsHref(profile.social.googleMapsUrl || address)
  const hours = profile.operatingHours || {}

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Contact</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div className="space-y-4 text-stone-700">
          {address ? <p>{address}</p> : null}
          {profile.contact.phone ? (
            <p>
              <a href={telHref(profile.contact.phone)} className={ST.link}>
                {profile.contact.phone}
              </a>
            </p>
          ) : null}
          {profile.contact.whatsappNumber ? (
            <p>
              <a
                href={whatsappHref(profile.contact.whatsappNumber, `Hi ${profile.name}`)}
                className={ST.link}
              >
                WhatsApp
              </a>
            </p>
          ) : null}
          {maps !== '#' ? (
            <p>
              <a href={maps} className={ST.link}>
                Get directions
              </a>
            </p>
          ) : null}
          <div className="pt-4">
            <h2 className="font-medium">Opening hours</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {Object.entries(hours).map(([day, h]) => (
                <li key={day} className="flex justify-between gap-4 capitalize">
                  <span>{day}</span>
                  <span>
                    {h?.closed ? 'Closed' : h?.open && h?.close ? `${h.open} – ${h.close}` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {profile.description ? (
            <div className="pt-4">
              <h2 className="font-medium">About us</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{profile.description}</p>
            </div>
          ) : null}
        </div>
        <div>
          <h2 className="text-xl font-medium">Send an enquiry</h2>
          <div className="mt-4">
            <EnquiryForm
              slug={profile.slug}
              type="general"
              customFields={profile.enquiryForm?.customFields || []}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
