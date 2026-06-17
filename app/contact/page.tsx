import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Mail, Clock } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BreadcrumbListSchema } from "@/components/seo/structured-data"

export const metadata: Metadata = {
  title: "Contact EaseMySalon | Book a Demo Today",
  description:
    "Have questions? Talk to our experts and see how EaseMySalon can help you manage and grow your salon business.",
  keywords: [
    "salon software demo",
    "contact salon software",
    "book salon software demo",
    "salon software consultation",
    "salon software support",
    "salon software contact",
    "salon management demo",
    "salon POS demo",
    "salon CRM demo",
    "salon software trial",
  ],
  alternates: {
    canonical: "/contact",
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/contact",
    siteName: "EaseMySalon",
    title: "Contact EaseMySalon | Book a Demo Today",
    description:
      "Have questions? Talk to our experts and see how EaseMySalon can help you manage and grow your salon business.",
    images: [{ url: "/images/dashboard.png", width: 1200, height: 630, alt: "Contact EaseMySalon" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact EaseMySalon | Book a Demo Today",
    description:
      "Have questions? Talk to our experts and see how EaseMySalon can help you manage and grow your salon business.",
    images: ["/images/dashboard.png"],
  },
}

export default function ContactPage() {
  return (
    <PublicShell>
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Contact", url: "/contact" },
        ]}
      />
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-4xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            Contact us
          </h1>
        </div>
      </section>

      <section className="py-20 bg-white" id="get-in-touch">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-2 border-slate-100 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg font-bold">Other Ways to Reach Us</CardTitle>
                  <CardDescription>Pick the channel that suits you best.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-[#7C3AED] mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Email</p>
                      <a href="mailto:support@easemysalon.in" className="text-sm text-slate-600 hover:text-[#7C3AED]">support@easemysalon.in</a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-[#7C3AED] mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Response Time</p>
                      <p className="text-sm text-slate-600">Within 1 business day</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border-2 border-[#7C3AED]/20 bg-gradient-to-br from-purple-50 via-white to-indigo-50 shadow-lg">
                <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-purple-200/40 blur-3xl" aria-hidden />
                <CardHeader className="relative">
                  <CardTitle className="text-lg font-bold text-slate-900">Prefer a guided walkthrough?</CardTitle>
                  <CardDescription>
                    Pick a slot that suits you — we&apos;ll tailor the demo to your services, branches and team size.
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative space-y-4">
                  <ul className="space-y-2 text-sm text-slate-600">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#7C3AED]" />
                      Live 30-minute walkthrough
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#7C3AED]" />
                      Real questions, real answers
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#7C3AED]" />
                      No card, no commitment
                    </li>
                  </ul>
                  <Button asChild className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]">
                    <Link href="/demo">
                      Book Free Demo
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

