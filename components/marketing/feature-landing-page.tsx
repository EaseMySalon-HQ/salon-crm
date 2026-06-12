import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Button } from "@/components/ui/button"
import { BreadcrumbListSchema } from "@/components/seo/structured-data"

export interface FeatureSection {
  heading: string
  paragraphs: string[]
}

export interface RelatedFeatureLink {
  href: string
  label: string
}

export interface FeatureLandingPageProps {
  slug: string
  eyebrow: string
  h1: string
  intro: string
  sections: FeatureSection[]
  relatedLinks: RelatedFeatureLink[]
}

export function FeatureLandingPage({
  slug,
  eyebrow,
  h1,
  intro,
  sections,
  relatedLinks,
}: FeatureLandingPageProps) {
  const breadcrumbLabel = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")

  return (
    <PublicShell>
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Features", url: "/features" },
          { name: breadcrumbLabel, url: `/features/${slug}` },
        ]}
      />

      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-14 sm:py-16 lg:py-20">
        <div className="container relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-200/90">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">{h1}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-purple-100 sm:text-lg">{intro}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="bg-white text-[#7C3AED] hover:bg-gray-100">
              <Link href="/pricing">
                See plans from ₹199/mo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/50 bg-white/5 text-white hover:bg-white/10">
              <Link href="/contact">Book a demo</Link>
            </Button>
          </div>
        </div>
      </section>

      <article className="py-16 bg-white">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 prose prose-slate prose-lg">
          {sections.map((section) => (
            <section key={section.heading} className="mb-10">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">{section.heading}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={i} className="text-slate-700 leading-relaxed mb-4">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </article>

      {relatedLinks.length > 0 && (
        <section className="border-t border-slate-100 bg-slate-50 py-12">
          <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Explore related features</h2>
            <ul className="space-y-2">
              {relatedLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-[#7C3AED] font-medium hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </PublicShell>
  )
}
