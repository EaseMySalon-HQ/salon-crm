import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Heart, Target, Eye, Shield, Sparkles } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "About | Ease My Salon",
  description: "Learn why we built Ease My Salon, our mission to digitize every Indian salon, and the team behind the platform.",
}

const values = [
  { title: "Customer obsession", desc: "We shadow stylists, front desks and owners to build features that remove real friction." },
  { title: "Clarity over clutter", desc: "Every interface, report and workflow is designed to be understood in seconds." },
  { title: "Skin in the game", desc: "We measure ourselves by salon revenue, not vanity metrics. Your growth is our KPI." },
  { title: "Privacy & trust", desc: "Data is encrypted, access-controlled and compliant with India’s DPDP guidelines." },
]

export default function AboutPage() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-center max-w-4xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            Built by Product Leaders, Designers & Engineers Obsessed with Salons
          </h1>
          <p className="text-xl sm:text-2xl text-purple-100 leading-relaxed">
            Ease My Salon was born after <span className="font-semibold text-white">hundreds of hours</span> sitting with front desks, stylists and owners who juggled spreadsheets, WhatsApp and legacy POS. We set out to build an operating system that feels as <span className="font-semibold text-white">premium as the salons it powers</span>.
          </p>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 grid gap-8 lg:grid-cols-2">
          <Card className="border-2 border-slate-100 shadow-lg hover:shadow-2xl transition-all hover:border-[#7C3AED]/30">
            <CardHeader className="space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 text-[#7C3AED] flex items-center justify-center">
                <Target className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold">Our Mission</CardTitle>
              <CardDescription className="text-base text-slate-700 font-medium">
                Digitize every Indian salon and empower them with enterprise-grade tools minus the complexity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 leading-relaxed">We bring the rigor of modern SaaS—automation, analytics, security—to salons that have historically been underserved by software. Every feature is built with real salon workflows in mind.</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-slate-100 shadow-lg hover:shadow-2xl transition-all hover:border-[#7C3AED]/30">
            <CardHeader className="space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 text-[#7C3AED] flex items-center justify-center">
                <Eye className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold">Our Vision</CardTitle>
              <CardDescription className="text-base text-slate-700 font-medium">
                Create the most trusted salon OS in Asia, powering franchises, independents and partners.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 leading-relaxed">From single-chair stylists to nationwide brands, Ease My Salon should be synonymous with smoother operations and happier teams. We're building the infrastructure that powers India's salon industry.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <Badge className="bg-purple-100 text-[#7C3AED]">Our Values</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">How We Work</h2>
            <p className="text-lg text-slate-600">These principles guide every decision, feature, and interaction we have with salon owners.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {values.map((value, idx) => (
              <Card key={value.title} className="border-2 border-slate-100 shadow-lg hover:shadow-2xl transition-all hover:border-[#7C3AED]/30">
                <CardHeader className="flex flex-row items-start gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 text-[#7C3AED] flex items-center justify-center flex-shrink-0 font-bold text-lg">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-xl font-bold mb-2">{value.title}</CardTitle>
                    <p className="text-slate-700 leading-relaxed">{value.desc}</p>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-10 lg:p-16 text-center shadow-2xl">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/80" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Built by Industry Leaders</h2>
            <p className="text-xl text-slate-300 mb-8 max-w-3xl mx-auto leading-relaxed">
              Led by operators, builders and designers from <span className="font-semibold text-white">Accenture, SaaS unicorns and top salons</span>. Product management, UI/UX and full-stack engineering come together with real salon experience to ship features that matter.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-8 py-6 h-auto text-lg font-semibold shadow-2xl">
                <Link href="/contact">
                  Join Our Journey
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                size="lg"
                asChild
                className="bg-white text-[#7C3AED] hover:bg-gray-100 px-8 py-6 h-auto text-lg font-semibold shadow-2xl"
              >
                <Link href="/features">See What We Built</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

