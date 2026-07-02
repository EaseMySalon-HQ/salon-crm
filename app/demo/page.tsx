import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
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

const benefits = [
  "Streamline billing, appointments and client management from day one",
  "Automate WhatsApp reminders and cut no-shows by up to 40%",
  "Track staff performance, commissions and payroll effortlessly",
  "Get real-time revenue insights across every branch",
  "Simplify inventory with alerts, PO tracking and supplier management",
  "Launch targeted campaigns that actually bring clients back",
]

export default function DemoPage() {
  return (
    <PublicShell>
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Book Demo", url: "/demo" },
        ]}
      />

      {/* ── Hero: Video + CTA ─────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#7C3AED]/20 via-transparent to-purple-900/30" aria-hidden />
        <div className="container relative mx-auto px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.3em] text-purple-300">
            Live 30-min demo
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Ready to transform how you run your salon?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-300 sm:text-lg">
            Book a personalized demo and we&apos;ll tailor everything to your salon, team, and branches.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              asChild
              className="bg-[#7C3AED] px-8 hover:bg-[#6D28D9]"
            >
              <a href="#book-demo">Book a Free Demo</a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="border-white/30 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href="/how-it-works">
                <Play className="mr-2 h-4 w-4" aria-hidden />
                Watch How It Works
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Two-column: Persuasive copy + Form ────────────────── */}
      <section
        id="book-demo"
        className="relative overflow-hidden bg-gradient-to-b from-white via-purple-50/30 to-white py-12 sm:py-16 lg:py-20"
      >
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-purple-100/40 blur-3xl" aria-hidden />
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid items-start gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
            {/* ── Left column: copy ── */}
            <div className="pt-6 sm:pt-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-[#7C3AED]">
                Want a hands-on walkthrough? We&apos;re here for you.
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
                Book Your Free Growth Consultation
              </h2>

              {/* Bold stat */}
              <div className="mt-8 rounded-2xl border border-purple-100 bg-purple-50/60 p-5">
                <p className="text-base font-medium italic text-slate-800">
                  Every day without the right system costs your salon missed bookings, forgotten follow-ups, and revenue slipping through the cracks.{" "}
                  <span className="font-bold not-italic text-[#7C3AED]">Let&apos;s fix that — together.</span>
                </p>
              </div>

              {/* Bullet benefits */}
              <div className="mt-8">
                <h3 className="text-lg font-bold text-slate-900">
                  Book a free consultation to explore:
                </h3>
                <ul className="mt-4 space-y-3">
                  {benefits.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
                      <span className="text-sm leading-relaxed text-slate-700">{b}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm font-medium italic text-slate-500">and much more…</p>
              </div>
            </div>

            {/* ── Right column: form ── */}
            <div>
              <DemoWizard />
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
