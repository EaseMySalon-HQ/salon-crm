import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EnquiryForm } from '@/components/mini-site/enquiry-form'
import { loadSiteProfile, siteMetadata } from '@/lib/mini-site-server'

const TYPES = ['bridal', 'package', 'membership', 'product', 'general'] as const
type EnquiryType = (typeof TYPES)[number]

const TITLES: Record<EnquiryType, string> = {
  bridal: 'Bridal enquiry',
  package: 'Package enquiry',
  membership: 'Membership enquiry',
  product: 'Product enquiry',
  general: 'Enquiry',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; type: string }>
}): Promise<Metadata> {
  const { slug, type } = await params
  const profile = await loadSiteProfile(slug)
  const t = (TYPES.includes(type as EnquiryType) ? type : 'general') as EnquiryType
  return {
    ...siteMetadata(profile, `/enquiry/${t}`),
    title: `${TITLES[t]} · ${profile.name}`,
    robots: { index: false, follow: true },
  }
}

export default async function EnquiryTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; type: string }>
  searchParams: Promise<{ id?: string }>
}) {
  const { slug: raw, type: rawType } = await params
  const query = await searchParams
  if (!TYPES.includes(rawType as EnquiryType)) notFound()
  const type = rawType as EnquiryType
  const profile = await loadSiteProfile(raw)
  const relatedId = query.id || undefined
  const relatedField =
    type === 'package'
      ? 'relatedPackageId'
      : type === 'product'
        ? 'relatedProductId'
        : type === 'membership'
          ? 'relatedMembershipId'
          : type === 'bridal'
            ? 'relatedServiceId'
            : undefined

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-semibold">{TITLES[type]}</h1>
      <p className="mt-2 text-stone-600">Tell {profile.name} how we can help.</p>
      <div className="mt-8">
        <EnquiryForm
          slug={profile.slug}
          type={type}
          relatedId={relatedId}
          relatedField={relatedField}
          customFields={profile.enquiryForm?.customFields || []}
        />
      </div>
    </div>
  )
}
