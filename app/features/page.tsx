import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Building2, Headphones, ShieldCheck, Sparkles } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Button } from "@/components/ui/button"
import { ProductCapabilitiesExplorer } from "@/components/features/product-capabilities-explorer"
import { BreadcrumbListSchema } from "@/components/seo/structured-data"

export const metadata: Metadata = {
  title: "Salon Software Features | EaseMySalon",
  description:
    "Explore powerful salon software features including billing, CRM, appointments, inventory, staff management and WhatsApp automation.",
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
  alternates: {
    canonical: "/features",
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/features",
    siteName: "EaseMySalon",
    title: "Salon Software Features | EaseMySalon",
    description:
      "Explore powerful salon software features including billing, CRM, appointments, inventory, staff management and WhatsApp automation.",
    images: [{ url: "/images/dashboard.png", width: 1200, height: 630, alt: "EaseMySalon salon software features" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon Software Features | EaseMySalon",
    description:
      "Explore powerful salon software features including billing, CRM, appointments, inventory, staff management and WhatsApp automation.",
    images: ["/images/dashboard.png"],
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
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Features", url: "/features" },
        ]}
      />
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
            Everything You Need to Run and Grow Your Salon
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
              <Link href="/contact#get-in-touch" aria-label="Book a free salon software demo">
                Book a Free Demo
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="h-11 border-2 border-white/50 bg-white/5 px-7 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/10 sm:h-12 sm:px-8"
            >
              <Link href="/pricing" aria-label="Compare salon software pricing plans">
                Compare Pricing Plans
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-100 bg-slate-50 py-12">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">Key Features</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/salon-billing-software"
              aria-label="Explore salon billing and GST invoice software"
              className="rounded-xl border border-slate-200 bg-white p-5 hover:border-[#7C3AED]/40 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-slate-900">Salon Billing &amp; GST Invoices</h3>
              <p className="mt-1 text-sm text-slate-600">Fast checkout, split payments, and compliant GST billing.</p>
            </Link>
            <Link
              href="/appointment-management"
              aria-label="Explore salon appointment management software"
              className="rounded-xl border border-slate-200 bg-white p-5 hover:border-[#7C3AED]/40 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-slate-900">Appointment Management</h3>
              <p className="mt-1 text-sm text-slate-600">Calendars, waitlists, and WhatsApp reminders.</p>
            </Link>
            <Link
              href="/salon-crm"
              aria-label="Explore salon CRM software"
              className="rounded-xl border border-slate-200 bg-white p-5 hover:border-[#7C3AED]/40 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-slate-900">Salon CRM Software</h3>
              <p className="mt-1 text-sm text-slate-600">Client visits, preferences, packages and loyalty.</p>
            </Link>
            <Link
              href="/inventory-management"
              aria-label="Explore salon inventory management software"
              className="rounded-xl border border-slate-200 bg-white p-5 hover:border-[#7C3AED]/40 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-slate-900">Inventory Management</h3>
              <p className="mt-1 text-sm text-slate-600">Track stock, expiry alerts, and purchase orders.</p>
            </Link>
            <Link
              href="/staff-management"
              aria-label="Explore salon staff management software"
              className="rounded-xl border border-slate-200 bg-white p-5 hover:border-[#7C3AED]/40 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-slate-900">Staff Management</h3>
              <p className="mt-1 text-sm text-slate-600">Attendance, schedules, commissions and performance.</p>
            </Link>
            <Link
              href="/payroll-management"
              aria-label="Explore salon payroll management software"
              className="rounded-xl border border-slate-200 bg-white p-5 hover:border-[#7C3AED]/40 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-slate-900">Payroll Management</h3>
              <p className="mt-1 text-sm text-slate-600">Automated salary, commissions and incentives.</p>
            </Link>
            <Link
              href="/whatsapp-marketing"
              aria-label="Explore WhatsApp marketing for salons"
              className="rounded-xl border border-slate-200 bg-white p-5 hover:border-[#7C3AED]/40 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-slate-900">WhatsApp Marketing</h3>
              <p className="mt-1 text-sm text-slate-600">Reminders, campaigns, and two-way client chat.</p>
            </Link>
            <Link
              href="/reports-analytics"
              aria-label="Explore salon reports and analytics software"
              className="rounded-xl border border-slate-200 bg-white p-5 hover:border-[#7C3AED]/40 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-slate-900">Reports &amp; Analytics</h3>
              <p className="mt-1 text-sm text-slate-600">Revenue, staff and growth dashboards.</p>
            </Link>
            <Link
              href="/features/multi-branch"
              aria-label="Explore multi-branch salon management software"
              className="rounded-xl border border-slate-200 bg-white p-5 hover:border-[#7C3AED]/40 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-slate-900">Multi-Branch Management</h3>
              <p className="mt-1 text-sm text-slate-600">One login for every outlet with branch-level control.</p>
            </Link>
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
              <Link href="/contact#get-in-touch" aria-label="Book a free salon software demo">
                Book a Free Demo
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button variant="outline" asChild className="border-[#7C3AED]/30 bg-white text-[#7C3AED] hover:bg-purple-50">
              <Link href="/pricing" aria-label="Compare salon software pricing plans">
                Compare Pricing Plans
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
