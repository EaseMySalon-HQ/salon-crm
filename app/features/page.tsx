import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Building2, Headphones, ShieldCheck, Sparkles } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Button } from "@/components/ui/button"
import { ProductCapabilitiesExplorer } from "@/components/features/product-capabilities-explorer"

export const metadata: Metadata = {
  title: "Salon Software Features | Dashboard, POS, CRM & More | EaseMySalon",
  description:
    "EaseMySalon — Salon OS for India: dashboards, analytics, appointments, GST billing & invoicing, client CRM, memberships & packages, inventory, staff, cash register, multi-outlet reports, and integrations. Compare tiers on pricing.",
  keywords: [
    "salon software features India",
    "salon POS GST",
    "salon appointment software",
    "salon CRM features",
    "salon inventory management",
    "multi outlet salon software",
    "salon commission tracking",
    "salon analytics dashboard",
    "EaseMySalon features",
    "salon billing WhatsApp",
  ],
  openGraph: {
    title: "Salon OS for India — Product Features | EaseMySalon",
    description:
      "Explore dashboards, appointments, billing, CRM, inventory, staff, and chain-ready reporting. Plans: Starter, Growth, Professional.",
  },
  alternates: {
    canonical: "/features",
  },
}

const trustStrip = [
  { icon: ShieldCheck, text: "99.99% uptime SLA" },
  { icon: Sparkles, text: "Free setup, training & migration" },
  { icon: Headphones, text: "Help articles, tickets & WhatsApp assistance" },
] as const

export default function FeaturesPage() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-14 sm:py-16 lg:py-20">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-white blur-3xl" />
        </div>
        <div className="container relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-200/90">
            EaseMySalon · Salon OS for India
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            One platform for appointments, billing, stock &amp; staff
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-purple-100 sm:text-lg">
            Replace fragmented tools with a single stack built for Indian salons and spas. Feature depth grows with{" "}
            <Link href="/pricing" className="font-semibold text-white underline-offset-2 hover:underline">
              Starter, Growth, and Professional
            </Link>
            .
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 sm:gap-3">
            {trustStrip.map(({ icon: Icon, text }) => (
              <span
                key={text}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-purple-100 backdrop-blur-sm sm:text-sm sm:px-4 sm:py-2"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-300 sm:h-4 sm:w-4" aria-hidden />
                {text}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Button
              size="lg"
              asChild
              className="h-11 bg-white px-7 text-base font-semibold text-[#7C3AED] shadow-xl hover:bg-gray-100 sm:h-12 sm:px-8"
            >
              <Link href="/contact#get-in-touch">
                Book a live demo
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-11 border-2 border-white/50 bg-white/5 px-7 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/10 sm:h-12 sm:px-8"
            >
              <Link href="/pricing">See plans &amp; pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-100 bg-white py-12 sm:py-16 lg:py-20">
        <ProductCapabilitiesExplorer />
      </section>

      <section className="bg-slate-50 py-12 sm:py-16">
        <div className="container mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <Building2 className="mx-auto mb-3 h-9 w-9 text-[#7C3AED]" aria-hidden />
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Ready to go deeper?</h2>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Walk through the modules that matter, then match them to your tier on the pricing page.
          </p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center">
            <Button asChild className="bg-[#7C3AED] hover:bg-[#6D28D9]">
              <Link href="/contact#get-in-touch">
                Book a personalized demo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild className="border-[#7C3AED]/30 bg-white text-[#7C3AED] hover:bg-purple-50">
              <Link href="/pricing">Compare plans &amp; matrix</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
