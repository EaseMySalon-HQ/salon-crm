import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  TrendingUp,
  Sparkles,
  Clock,
  Heart,
  MessageCircle,
  BarChart3,
  Wallet,
  Handshake,
} from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BreadcrumbListSchema } from "@/components/seo/structured-data"

export const metadata: Metadata = {
  title: "Why EaseMySalon | The Beliefs That Shape Our Salon Software",
  description:
    "The 8 beliefs that shape EaseMySalon — from growth-first thinking and zero-training UX to human automation and affordable, data-driven salon software built for India.",
  keywords: [
    "why EaseMySalon",
    "salon software philosophy",
    "salon software beliefs",
    "salon growth software",
    "salon software mission",
    "salon software India",
    "best salon management software",
    "salon retention software",
    "salon automation philosophy",
  ],
  alternates: {
    canonical: "/about",
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/about",
    siteName: "EaseMySalon",
    title: "Why EaseMySalon | The Beliefs That Shape Our Salon Software",
    description:
      "The 8 beliefs that shape EaseMySalon — growth-first, zero-training, human automation, and affordable salon software built for India.",
    images: [{ url: "/images/dashboard.png", width: 1200, height: 630, alt: "Why EaseMySalon" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Why EaseMySalon | The Beliefs That Shape Our Salon Software",
    description:
      "The 8 beliefs that shape EaseMySalon — growth-first, zero-training, human automation, and affordable salon software built for India.",
    images: ["/images/dashboard.png"],
  },
}

type Belief = {
  number: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  hook: string
  body: string[]
}

const beliefs: Belief[] = [
  {
    number: "01",
    icon: TrendingUp,
    title: "Growth Comes Before Management",
    hook: "Most software helps you manage your salon. We believe software should help you grow your salon.",
    body: [
      "Every feature we build must answer one question:",
      "Will this bring more revenue, retention, or referrals?",
    ],
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Salon Owners Shouldn't Need Training",
    hook: "If you need weeks of training, the software is broken.",
    body: [
      "We believe technology should adapt to salon owners — not the other way around.",
      "That's why EaseMySalon is designed to feel familiar from day one.",
    ],
  },
  {
    number: "03",
    icon: Clock,
    title: "Every Minute Saved Matters",
    hook: "A salon owner already wears 10 different hats.",
    body: [
      "We obsess over reducing clicks, automating repetitive work, and helping teams move faster.",
      "Because saving 30 minutes daily means gaining 180 hours every year.",
    ],
  },
  {
    number: "04",
    icon: Heart,
    title: "Customers Are a Salon's Greatest Asset",
    hook: "New customers are expensive. Repeat customers build businesses.",
    body: [
      "That's why we focus heavily on retention, memberships, loyalty, reminders, and customer relationships.",
    ],
  },
  {
    number: "05",
    icon: MessageCircle,
    title: "Automation Should Feel Human",
    hook: "Automation shouldn't make clients feel like they're talking to a robot.",
    body: [
      "We believe reminders, campaigns, and follow-ups should feel personal and thoughtful.",
    ],
  },
  {
    number: "06",
    icon: BarChart3,
    title: "Data Should Drive Decisions",
    hook: "Guessing is expensive.",
    body: [
      "Salon owners deserve clear insights into what's working, who's performing, and where money is being lost.",
      "We build reports that lead to action, not confusion.",
    ],
  },
  {
    number: "07",
    icon: Wallet,
    title: "Technology Should Be Affordable",
    hook: "Growing a salon shouldn't require enterprise budgets.",
    body: [
      "We believe powerful tools should be accessible to independent salons, growing chains, and everyone in between.",
    ],
  },
  {
    number: "08",
    icon: Handshake,
    title: "We Succeed Only When Salons Succeed",
    hook: "We're not in the software business. We're in the salon success business.",
    body: [
      "If your revenue grows, your clients return, and your team performs better — we've done our job.",
    ],
  },
]

export default function WhyEaseMySalonPage() {
  return (
    <PublicShell>
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Why EaseMySalon", url: "/about" },
        ]}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-center max-w-4xl">
          <Badge className="bg-white/15 text-white border border-white/20 backdrop-blur-sm hover:bg-white/20">
            Why EaseMySalon
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            The Beliefs That Shape EaseMySalon
          </h1>
          <p className="text-xl sm:text-2xl text-purple-100 leading-relaxed">
            We don't build salon software to look pretty in a demo. We build it to{" "}
            <span className="font-semibold text-white">grow revenue, save time, and keep clients coming back</span>.
            These eight beliefs guide every product decision we make.
          </p>
        </div>
      </section>

      {/* Beliefs grid */}
      <section className="py-20 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <Badge className="bg-purple-100 text-[#7C3AED] hover:bg-purple-100">Our Principles</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              Eight beliefs. Every feature. Every release.
            </h2>
            <p className="text-lg text-slate-600">
              These are the non-negotiables we hold ourselves to when shipping the platform that powers your salon.
            </p>
          </div>

          <Accordion
            type="single"
            collapsible
            defaultValue="belief-01"
            className="mx-auto max-w-4xl space-y-4"
          >
            {beliefs.map((belief) => {
              const Icon = belief.icon
              return (
                <AccordionItem
                  key={belief.number}
                  value={`belief-${belief.number}`}
                  className="group rounded-2xl border-2 border-slate-100 bg-white shadow-md hover:shadow-xl hover:border-[#7C3AED]/30 transition-all data-[state=open]:border-[#7C3AED]/40 data-[state=open]:shadow-xl"
                >
                  <AccordionTrigger className="px-5 sm:px-6 py-5 hover:no-underline [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-[#7C3AED]">
                    <div className="flex items-center gap-4 sm:gap-5 text-left flex-1 min-w-0">
                      <div className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-2xl bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white flex items-center justify-center shadow-lg shadow-purple-200/50">
                        <Icon className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
                      </div>
                      <span className="hidden sm:inline-block text-2xl font-bold bg-gradient-to-br from-[#7C3AED] to-[#A855F7] bg-clip-text text-transparent shrink-0">
                        {belief.number}
                      </span>
                      <span className="text-lg sm:text-xl font-bold text-slate-900 leading-snug flex-1 min-w-0">
                        {belief.title}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-5 sm:px-6 pb-6 pt-2 text-base">
                    <div className="pl-0 sm:pl-[4.5rem] space-y-3">
                      <p className="text-base text-slate-800 font-semibold leading-relaxed">
                        {belief.hook}
                      </p>
                      {belief.body.map((line, idx) => (
                        <p key={idx} className="text-slate-600 leading-relaxed">
                          {line}
                        </p>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-10 lg:p-16 text-center shadow-2xl">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/80" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Software built for salon success — not just salon management
            </h2>
            <p className="text-xl text-slate-300 mb-8 max-w-3xl mx-auto leading-relaxed">
              See how these beliefs translate into{" "}
              <span className="font-semibold text-white">revenue, retention, and time saved</span> for 350+ salons across India.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                asChild
                className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-8 py-6 h-auto text-lg font-semibold shadow-2xl"
              >
                <Link href="/demo" aria-label="Book a free salon software demo">
                  Book a Free Demo
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden />
                </Link>
              </Button>
              <Button
                size="lg"
                asChild
                className="bg-white text-[#7C3AED] hover:bg-gray-100 px-8 py-6 h-auto text-lg font-semibold shadow-2xl"
              >
                <Link href="/features" aria-label="Explore EaseMySalon salon software features">
                  Explore Features
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
