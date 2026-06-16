import type { Metadata } from "next"

import { PublicShell } from "@/components/layout/public-shell"
import { DemoWizard } from "@/components/marketing/demo-wizard"
import { BreadcrumbListSchema } from "@/components/seo/structured-data"

export const metadata: Metadata = {
  title: "Book a Free Demo | EaseMySalon",
  description:
    "Book a free 30-minute live demo of EaseMySalon. See POS, appointments, WhatsApp marketing, multi-branch and reports — tailored to your salon.",
  keywords: [
    "book salon software demo",
    "EaseMySalon demo",
    "salon software demo India",
    "free salon software demo",
    "salon POS demo",
    "salon management demo",
    "salon CRM demo",
    "salon software trial",
    "salon billing demo",
  ],
  alternates: {
    canonical: "/demo",
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/demo",
    siteName: "EaseMySalon",
    title: "Book a Free Demo | EaseMySalon",
    description:
      "Book a free 30-minute live walkthrough of EaseMySalon, tailored to your salon's services and locations.",
    images: [{ url: "/images/dashboard.png", width: 1200, height: 630, alt: "EaseMySalon demo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Book a Free Demo | EaseMySalon",
    description:
      "Book a free 30-minute live walkthrough of EaseMySalon, tailored to your salon.",
    images: ["/images/dashboard.png"],
  },
}

export default function DemoPage() {
  return (
    <PublicShell>
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Book Demo", url: "/demo" },
        ]}
      />

      <section className="relative overflow-hidden bg-gradient-to-b from-purple-50/50 via-white to-white py-12 sm:py-16 lg:py-20">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-100/40 blur-3xl" aria-hidden />
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <p className="mb-2 text-center font-mono text-xs font-semibold uppercase tracking-[0.3em] text-[#7C3AED]/80">
            Live 30-min demo · 7 days a week
          </p>
          <DemoWizard />
        </div>
      </section>
    </PublicShell>
  )
}
