'use client'

import Link from 'next/link'
import { SiteProfile, bookAppointmentHref } from '@/lib/public-site-api'
import { useSiteTrack } from '@/components/mini-site/mini-site-shell'
import { ST } from '@/lib/mini-site-theme'
import { HeroCoverCarousel } from '@/components/mini-site/hero-cover-carousel'
import { GoogleProfileBrandIcon, InstagramBrandIcon } from '@/components/mini-site/brand-icons'

const iconCtaBase =
  'inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-white/90 shadow-sm backdrop-blur'

export function MiniSiteHero({ slug, profile }: { slug: string; profile: SiteProfile }) {
  const { track } = useSiteTrack(slug)
  const bookHref = bookAppointmentHref(slug)
  const googleProfileUrl = profile.social.googleProfileUrl?.trim()
  const coverImages =
    profile.coverImages?.length > 0
      ? profile.coverImages
      : profile.coverImage
        ? [profile.coverImage]
        : profile.showcaseImages?.slice(0, 8) || []

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <HeroCoverCarousel images={coverImages} salonName={profile.name} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/25" />
      </div>
      <div className="relative mx-auto flex min-h-[35vh] max-w-6xl flex-col justify-end px-4 pb-8 pt-16 text-white">
        <div className="flex items-end gap-4">
          {profile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logoUrl}
              alt={profile.name}
              className="h-16 w-16 rounded-2xl border border-white/30 object-cover shadow-lg"
            />
          ) : null}
          <div>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{profile.name}</h1>
          </div>
        </div>
        {profile.tagline || profile.description ? (
          <p className="mt-4 max-w-2xl text-base text-white/85 md:text-lg">
            {profile.tagline || profile.description}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-3">
          {profile.onlineBookingEnabled ? (
            <Link
              href={bookHref}
              onClick={() => track('book_appointment_click')}
              className={ST.btnPrimaryMd}
            >
              Book Appointment
            </Link>
          ) : null}
          {googleProfileUrl ? (
            <a
              href={googleProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('google_profile_click')}
              className={iconCtaBase}
              aria-label="Google Business Profile"
              title="View on Google"
            >
              <GoogleProfileBrandIcon />
            </a>
          ) : null}
          {profile.social.instagram ? (
            <a
              href={profile.social.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className={iconCtaBase}
              aria-label="Instagram"
            >
              <InstagramBrandIcon />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  )
}
