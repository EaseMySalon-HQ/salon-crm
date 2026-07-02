import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PublicShell } from "@/components/layout/public-shell"
import { BreadcrumbListSchema } from "@/components/seo/structured-data"

export const metadata: Metadata = {
  title: "How EaseMySalon Works | Product Walkthrough",
  description:
    "Watch a quick walkthrough of EaseMySalon — billing, appointments, WhatsApp reminders, staff, inventory and reports for Indian salons.",
  keywords: [
    "how salon software works",
    "EaseMySalon walkthrough",
    "salon management software demo video",
    "salon POS walkthrough",
    "salon software overview",
  ],
  alternates: {
    canonical: "/how-it-works",
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/how-it-works",
    siteName: "EaseMySalon",
    title: "How EaseMySalon Works | Product Walkthrough",
    description:
      "Watch a quick walkthrough of EaseMySalon — billing, appointments, WhatsApp reminders, staff, inventory and reports.",
    images: [{ url: "/images/dashboard.png", width: 1200, height: 630, alt: "EaseMySalon walkthrough" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "How EaseMySalon Works | Product Walkthrough",
    description:
      "Watch a quick walkthrough of EaseMySalon — billing, appointments, WhatsApp reminders, staff, inventory and reports.",
    images: ["/images/dashboard.png"],
  },
}

const WALKTHROUGH_YOUTUBE_ID = "8UZa4daFpZ8"

export default function HowItWorksPage() {
  return (
    <PublicShell>
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: "/" },
          { name: "How It Works", url: "/how-it-works" },
        ]}
      />

      <section className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#7C3AED]/20 via-transparent to-purple-900/30" aria-hidden />
        <div className="container relative mx-auto px-4 py-14 text-center sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-purple-300">
            Product walkthrough
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            See EaseMySalon in action
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-300 sm:text-lg">
            A quick look at how salons run billing, bookings, client follow-ups, and day-to-day operations on one platform.
          </p>
        </div>
      </section>

      <section className="bg-white py-12 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-950 shadow-xl shadow-purple-100/40 ring-1 ring-purple-100/80">
              <div className="relative aspect-video">
                <iframe
                  src={`https://www.youtube.com/embed/${WALKTHROUGH_YOUTUBE_ID}?rel=0`}
                  title="EaseMySalon product walkthrough"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-slate-500">
              Billing, appointments, client records, staff, inventory — all in one place.
            </p>

            <div className="mt-10 flex justify-center">
              <Button
                size="lg"
                asChild
                className="bg-[#7C3AED] px-8 hover:bg-[#6D28D9]"
              >
                <Link href="/demo">
                  Book Free Demo
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
