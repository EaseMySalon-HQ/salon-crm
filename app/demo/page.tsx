import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Clock, Sparkles, Users } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ContactForm } from "@/components/marketing/contact-form"
import { BreadcrumbListSchema } from "@/components/seo/structured-data"

export const metadata: Metadata = {
  title: "Book a Free Salon Software Demo | EaseMySalon",
  description:
    "Book a free, personalized demo of EaseMySalon and see how salons across India manage billing, appointments, staff and marketing in one platform.",
  keywords: [
    "salon software demo",
    "book salon demo",
    "free salon software demo",
    "EaseMySalon demo",
    "salon POS demo",
    "salon CRM demo",
  ],
  alternates: { canonical: "/demo" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/demo",
    siteName: "EaseMySalon",
    title: "Book a Free Salon Software Demo | EaseMySalon",
    description:
      "Book a free, personalized demo of EaseMySalon and see how salons across India manage billing, appointments, staff and marketing in one platform.",
    images: [{ url: "/images/dashboard.png", width: 1200, height: 630, alt: "Book a free EaseMySalon demo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Book a Free Salon Software Demo | EaseMySalon",
    description:
      "Book a free, personalized demo of EaseMySalon and see how salons across India manage billing, appointments, staff and marketing in one platform.",
    images: ["/images/dashboard.png"],
  },
}

const demoBenefits = [
  {
    icon: Clock,
    title: "Quick 30-minute walkthrough",
    desc: "We focus on the modules that matter most to your salon: billing, appointments, staff or marketing.",
  },
  {
    icon: Users,
    title: "Tailored to your business",
    desc: "Tell us your salon size and city, and we'll show how EaseMySalon fits your day-to-day workflow.",
  },
  {
    icon: Sparkles,
    title: "Free setup and migration",
    desc: "Like what you see? Our team migrates your existing data and trains your staff at no extra cost.",
  },
]

export default function DemoPage() {
  return (
    <PublicShell>
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Demo", url: "/demo" },
        ]}
      />
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-20 lg:py-28">
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl text-center space-y-6">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            Book a Free Demo
          </h1>
          <p className="text-xl text-purple-100 leading-relaxed">
            See how EaseMySalon helps Indian salons manage{" "}
            <span className="font-semibold text-white">billing, appointments, staff and marketing</span> in one
            simple platform — live on your own data.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-4 text-sm text-purple-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden />
              <span>Free 30-minute demo</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden />
              <span>No commitment, no credit card</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden />
              <span>Free setup &amp; migration</span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-white">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card className="border-2 border-slate-100 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-2xl font-bold">Tell Us About Your Salon</CardTitle>
                  <p className="text-slate-600 mt-1">
                    Share a few details and our team will get back within 1 business day with a personalized demo.
                  </p>
                </CardHeader>
                <CardContent>
                  <ContactForm />
                </CardContent>
              </Card>
            </div>
            <aside className="space-y-6">
              <h2 className="text-xl font-bold text-slate-900">What to Expect</h2>
              {demoBenefits.map((item) => (
                <Card key={item.title} className="border-2 border-slate-100 shadow-sm">
                  <CardHeader className="space-y-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 text-[#7C3AED] flex items-center justify-center">
                      <item.icon className="h-5 w-5" aria-hidden />
                    </div>
                    <CardTitle className="text-lg font-bold">{item.title}</CardTitle>
                    <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                  </CardHeader>
                </Card>
              ))}
              <div className="rounded-2xl bg-slate-50 p-5">
                <h2 className="text-base font-semibold text-slate-900 mb-2">Prefer to explore on your own?</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Compare plans or read about our salon software features first.
                </p>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" asChild className="border-[#7C3AED]/30 text-[#7C3AED] hover:bg-purple-50">
                    <Link href="/pricing" aria-label="Compare EaseMySalon pricing plans">
                      Compare Pricing Plans
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                  <Button variant="outline" asChild className="border-[#7C3AED]/30 text-[#7C3AED] hover:bg-purple-50">
                    <Link href="/features" aria-label="Explore EaseMySalon salon software features">
                      Explore Salon Software Features
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
