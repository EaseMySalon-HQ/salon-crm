import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, CheckCircle2, Shield, Sparkles, TrendingUp, Users, BarChart3, Calendar, Receipt, MessageCircle, Star, Zap, Award, Clock, DollarSign, Target } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PublicShell } from "@/components/layout/public-shell"
import {
  BreadcrumbListSchema,
  OrganizationSchema,
  SoftwareApplicationSchema,
} from "@/components/seo/structured-data"

export const metadata: Metadata = {
  title: "Salon Management Software | Grow Your Salon with EaseMySalon",
  description:
    "Manage appointments, billing, CRM, staff, inventory and marketing from one platform. Start growing your salon with EaseMySalon today.",
  keywords: [
    "salon management software",
    "salon POS system",
    "salon CRM software",
    "salon appointment booking",
    "salon inventory management",
    "best salon management software India",
    "salon software free trial",
    "reduce salon no-shows software",
    "salon revenue management software",
    "cloud-based salon management system",
  ],
  alternates: {
    canonical: "/",
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    siteName: "EaseMySalon",
    title: "Salon Management Software | Grow Your Salon with EaseMySalon",
    description:
      "Manage appointments, billing, CRM, staff, inventory and marketing from one platform. Start growing your salon with EaseMySalon today.",
    images: [
      {
        url: "/images/dashboard.png",
        width: 1200,
        height: 630,
        alt: "EaseMySalon salon management software dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon Management Software | Grow Your Salon with EaseMySalon",
    description:
      "Manage appointments, billing, CRM, staff, inventory and marketing from one platform. Start growing your salon with EaseMySalon today.",
    images: ["/images/dashboard.png"],
  },
}

const coreFeatures: Array<{
  icon: typeof Receipt
  title: string
  desc: string
  benefit: string
  metric: string
  href?: string
  linkLabel?: string
}> = [
  {
    icon: Receipt,
    title: "POS & Billing",
    desc: "Fast GST-ready billing with split payments and memberships.",
    benefit: "Reduce billing time by 70%",
    metric: "Average checkout: 30 seconds",
    href: "/salon-billing-software",
    linkLabel: "Discover Salon Billing Features",
  },
  {
    icon: Calendar,
    title: "Appointments",
    desc: "WhatsApp-native calendar with smart reminders and waitlists.",
    benefit: "Cut no-shows by 40%",
    metric: "Automated reminders via WhatsApp",
    href: "/appointment-management",
    linkLabel: "Learn About Appointment Management",
  },
  {
    icon: Users,
    title: "CRM & Loyalty",
    desc: "360° client records, segments, packages and campaigns.",
    benefit: "Increase repeat visits by 35%",
    metric: "Complete client history at your fingertips",
    href: "/salon-crm",
    linkLabel: "Explore Salon CRM Software",
  },
  {
    icon: BarChart3,
    title: "Inventory",
    desc: "Real-time stock, expiry alerts, purchase orders and transfers.",
    benefit: "Reduce wastage by 50%",
    metric: "Never run out of stock again",
    href: "/inventory-management",
    linkLabel: "See Inventory Management Tools",
  },
  {
    icon: Shield,
    title: "Staff & Roles",
    desc: "Attendance, commission engine and granular permissions.",
    benefit: "Automate payroll in minutes",
    metric: "Fair, transparent commission tracking",
    href: "/staff-management",
    linkLabel: "Explore Salon Staff Management",
  },
  {
    icon: TrendingUp,
    title: "Reports",
    desc: "50+ live dashboards for revenue, clients, staff and branches.",
    benefit: "Make data-driven decisions",
    metric: "Real-time insights, anytime, anywhere",
    href: "/reports-analytics",
    linkLabel: "View Salon Reports & Analytics",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp Marketing",
    desc: "Reminders, campaigns, and two-way client chat via official Business API.",
    benefit: "Recover revenue from no-shows",
    metric: "India's #1 salon channel",
    href: "/whatsapp-marketing",
    linkLabel: "Discover WhatsApp Marketing for Salons",
  },
]

const uspList = [
  { text: "Made for Indian salons", icon: Award, metric: "350+ salons trust us" },
  { text: "Fastest POS checkout", icon: Zap, metric: "30-second billing" },
  { text: "Multiple payment modes", icon: DollarSign, metric: "Cash, UPI, Cards" },
  { text: "Real-time dashboards", icon: BarChart3, metric: "Live insights 24/7" },
  { text: "Multi-location ready", icon: Target, metric: "Manage all branches" },
  { text: "Zero training required", icon: Clock, metric: "Setup in 1 day" },
]

const testimonials = [
  {
    quote: "We scaled from one outlet to six without chaos. Billing, staff payouts and inventory run themselves.",
    name: "Aditi Khanna",
    role: "Founder, The Braid Bar",
    location: "Mumbai",
    metric: "6 branches, 45 staff",
    rating: 5
  },
  {
    quote: "WhatsApp reminders + smart calendar cut no-shows by 40% in 90 days. Revenue increased by ₹2.5L monthly.",
    name: "Raghav Shah",
    role: "COO, Urban Glow",
    location: "Bengaluru",
    metric: "40% fewer no-shows",
    rating: 5
  },
  {
    quote: "Our daily stand-up is this dashboard. Revenue, retention, even wastage is visible live. Game changer!",
    name: "Meera Iyer",
    role: "Director, Velvet Spas",
    location: "Delhi",
    metric: "3 locations, 28 staff",
    rating: 5
  },
]

const solutionSegments = [
  { title: "Boutiques", pain: "Manual billing & scattered WhatsApp bookings.", outcome: "POS + CRM unified, digital receipts, auto reminders." },
  { title: "Premium spas", pain: "Complex packages & split bills slow the desk.", outcome: "Prepaid credits, room allocation, luxe client journeys." },
  { title: "Barbershops", pain: "High walk-ins need speed + stylist utilisation.", outcome: "Queue management, cashless POS, stylist scorecards." },
]

export default function MarketingHome() {
  return (
    <PublicShell>
      <OrganizationSchema />
      <SoftwareApplicationSchema />
      <BreadcrumbListSchema items={[{ name: "Home", url: "/" }]} />
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white">
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div className="space-y-8 text-center lg:text-left">
              {/* Main Headline */}
              <div className="space-y-6">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight">
                  Salon Growth Software for Modern Salons
                </h1>
                <p className="text-xl sm:text-2xl text-purple-100 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                  GST billing, WhatsApp appointments, staff commissions, and multi-branch reporting — one platform for salons in Mumbai, Delhi, Bangalore, Pune, and across India. <span className="font-semibold text-white">Reduce no-shows by 40%</span>, <span className="font-semibold text-white">cut billing time by 70%</span>, and <span className="font-semibold text-white">increase revenue by 35%</span>.
                </p>
                <p className="text-base sm:text-lg text-purple-200/90 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                  Plans from ₹199/month per outlet (GST exclusive). Start with a 7-day free trial — no credit card required. Built for how Indian salons run: UPI payments, walk-ins, memberships, packages, and stylist commissions.
                </p>
              </div>
              
              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button size="lg" asChild className="bg-white text-[#7C3AED] hover:bg-gray-100 px-8 py-6 h-auto text-lg font-semibold shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all">
                  <Link href="/demo" aria-label="Book a free EaseMySalon salon software demo">
                    Book a Free Demo
                    <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="px-8 py-6 h-auto text-lg border-2 border-white/40 text-white bg-white/5 hover:bg-white/20 backdrop-blur-sm"
                >
                  <Link href="/pricing" aria-label="Compare EaseMySalon pricing plans">
                    Compare Pricing Plans
                  </Link>
                </Button>
              </div>
              
              {/* Risk Reversal */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm text-purple-200 pt-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>7 Day Trial</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>Setup in 1 day</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-6 bg-gradient-to-tr from-purple-200/60 via-white to-indigo-100/50 blur-3xl" />
              <div className="relative rounded-[32px] border border-white/60 bg-white shadow-2xl p-4">
                <div className="rounded-3xl border border-slate-100 overflow-hidden">
                  <div className="relative h-[420px] bg-slate-900 flex flex-col">
                    <div className="flex-1 grid grid-cols-2 gap-6 p-6">
                      <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                        <p className="text-sm text-slate-200">Today’s revenue</p>
                        <p className="mt-2 text-3xl font-semibold text-white">₹1,84,200</p>
                        <p className="text-xs text-emerald-300 mt-1">▲ 18% vs last week</p>
                      </div>
                      <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
                        <p className="text-sm text-slate-200">Upcoming bookings</p>
                        <p className="mt-2 text-3xl font-semibold text-white">68</p>
                        <p className="text-xs text-purple-200 mt-1">Auto reminders enabled</p>
                      </div>
                      <div className="col-span-2 rounded-3xl bg-gradient-to-r from-indigo-500 to-purple-600 p-5 shadow-2xl">
                        <p className="text-white text-sm">Branches</p>
                        <div className="mt-4 grid grid-cols-3 gap-4 text-white">
                          <div>
                            <p className="text-2xl font-semibold">6</p>
                            <p className="text-xs text-white/70">Cities live</p>
                          </div>
                          <div>
                            <p className="text-2xl font-semibold">122</p>
                            <p className="text-xs text-white/70">Staff active</p>
                          </div>
                          <div>
                            <p className="text-2xl font-semibold">92%</p>
                            <p className="text-xs text-white/70">Utilisation</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white text-slate-900 px-6 py-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">WhatsApp Concierge</p>
                        <p className="font-semibold">“Hi Ayesha, see you at 4:30 PM tomorrow!”</p>
                      </div>
                      <MessageCircle className="h-10 w-10 text-[#25D366]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900">Key Features That Help Your Salon Grow</h2>
            <p className="text-lg text-slate-600">EaseMySalon unifies POS, appointments, CRM, inventory, staff payroll and analytics in one platform—no integrations required.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {coreFeatures.map((feature) => (
              <Card key={feature.title} className="border border-slate-100 shadow-sm hover:shadow-xl transition-all group hover:border-[#7C3AED]/30">
                <CardHeader className="space-y-3">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 text-[#7C3AED] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl mb-1">{feature.title}</CardTitle>
                    <CardDescription className="text-base mb-3">{feature.desc}</CardDescription>
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                      <TrendingUp className="h-4 w-4" />
                      <span>{feature.benefit}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{feature.metric}</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="ghost" className="w-full justify-start text-[#7C3AED] hover:text-[#6D28D9]">
                    <Link
                      href={feature.href ?? "/features"}
                      aria-label={feature.linkLabel ?? `Explore ${feature.title} salon software features`}
                    >
                      {feature.linkLabel ?? `Explore ${feature.title} for Salons`}
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* CTA after features */}
          <div className="mt-12 text-center">
            <Button size="lg" asChild className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-8">
              <Link href="/features" aria-label="See all salon management software features">
                See All Salon Management Features
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 grid gap-12 lg:grid-cols-2 items-start">
          <div className="space-y-6">
            <p className="text-sm uppercase tracking-wide text-white/60">Why EaseMySalon</p>
            <h2 className="text-3xl md:text-4xl font-semibold">Why Salons Choose EaseMySalon</h2>
            <p className="text-lg text-white/70">Every feature is informed by hundreds of hours sitting with front desks, stylists and owners who demanded speed, accuracy and simplicity.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {uspList.map((usp, idx) => (
                <div key={idx} className="flex items-start gap-4 rounded-2xl bg-white/5 border border-white/10 p-5 hover:bg-white/10 transition-all group">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <usp.icon className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white mb-1">{usp.text}</p>
                    <p className="text-xs text-white/70">{usp.metric}</p>
                  </div>
                </div>
              ))}
            </div>
            
            {/* CTA in Why Choose section */}
            <div className="pt-6">
              <Button size="lg" asChild className="bg-white text-[#7C3AED] hover:bg-gray-100 px-8">
                <Link href="/demo" aria-label="Book a free EaseMySalon demo">
                  Book a Free Demo
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
          <div className="bg-white text-slate-900 rounded-3xl p-8 shadow-2xl space-y-8">
            <div>
              <p className="text-sm font-semibold text-[#7C3AED] uppercase tracking-wide">Product preview</p>
              <h3 className="text-2xl font-semibold mt-2">Designed for the front desk, built for the CEO</h3>
            </div>
            <Image src="/images/dashboard.png" alt="EaseMySalon salon management software dashboard showing POS, appointments, CRM, inventory and analytics features" width={1200} height={675} className="rounded-2xl border border-slate-100" />
            <p className="text-sm text-slate-500">Go from Excel chaos to live dashboards and smart workflows—without retraining your teams.</p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 max-w-2xl mx-auto">
            <Badge className="bg-emerald-50 text-emerald-600">Success stories</Badge>
            <h2 className="text-3xl font-semibold text-slate-900">Built in India, powering salons everywhere</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((testimonial, idx) => (
              <Card key={idx} className="border border-slate-100 shadow-lg hover:shadow-2xl transition-all group hover:border-[#7C3AED]/30">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-1 mb-2">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-slate-700 italic text-base leading-relaxed">"{testimonial.quote}"</p>
                  <div className="pt-4 border-t border-slate-100">
                    <p className="font-semibold text-slate-900">{testimonial.name}</p>
                    <p className="text-sm text-slate-600">{testimonial.role}</p>
                    <p className="text-xs text-slate-500 mt-1">{testimonial.location}</p>
                    {testimonial.metric && (
                      <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                        <TrendingUp className="h-3 w-3" />
                        {testimonial.metric}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Impact Tiles */}
          <div className="mt-16 text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-semibold text-slate-900">Benefits for Your Business</h2>
            <p className="mt-2 text-slate-600">
              Real outcomes Indian salon owners see within the first 90 days of using EaseMySalon.
            </p>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-4">
            {[
              { title: "Launch in 1 day", desc: "Dedicated concierge migrates data, trains teams and goes live overnight.", accent: "from-purple-50 to-indigo-50" },
              { title: "WhatsApp-native desk", desc: "Bookings, reminders and receipts flow over WhatsApp with zero manual chase.", accent: "from-emerald-50 to-teal-50" },
              { title: "CEO-grade dashboards", desc: "Revenue, repeat rate, branch health and commissions update in real time.", accent: "from-blue-50 to-cyan-50" },
              { title: "VIP support", desc: "24/7 priority line, proactive audits and success playbooks for every plan.", accent: "from-rose-50 to-amber-50" },
            ].map((tile) => (
              <div
                key={tile.title}
                className={`rounded-3xl border border-white/60 bg-gradient-to-br ${tile.accent} p-6 text-left shadow-lg`}
              >
                <p className="text-sm font-semibold text-slate-900 mb-2">{tile.title}</p>
                <p className="text-sm text-slate-600 leading-relaxed">{tile.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">Book a Free Demo</h2>
          <p className="mt-3 text-lg text-purple-100">
            See EaseMySalon live on your own data. Free setup, free migration, no credit card required.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center">
            <Button size="lg" asChild className="bg-white text-[#7C3AED] hover:bg-gray-100">
              <Link href="/demo" aria-label="Book a free salon management software demo">
                Book a Free Demo
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="border-2 border-white/50 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href="/pricing" aria-label="Compare EaseMySalon pricing plans">
                Compare Pricing Plans
              </Link>
            </Button>
          </div>
        </div>
      </section>

    </PublicShell>
  )
}
