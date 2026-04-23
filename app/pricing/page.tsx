"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  Headphones,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  Building2,
} from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PricingFeatureMatrix } from "@/components/pricing/pricing-feature-matrix"
import { FEATURE_CATEGORIES, PRICING_PLANS, type PricingPlan } from "@/lib/pricing-matrix"

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n)
}

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: "99.99% uptime SLA" },
  { icon: Sparkles, label: "Free setup, training & data migration" },
  { icon: Headphones, label: "24/7 support available" },
] as const

const PLAN_HIGHLIGHTS: Record<PricingPlan["id"], string[]> = {
  starter: [
    "Single outlet — run day-to-day smoothly",
    "Core appointments, billing & client records",
    "Basic reports & cash tracking",
  ],
  growth: [
    "Scale operations with richer scheduling & alerts",
    "Stronger billing, inventory & lead workflows",
    "Advanced analytics & marketing filters",
  ],
  professional: [
    "Multi-outlet: centralized dashboards & consolidation",
    "Memberships, packages & incentive engines",
    "Premium support options for chains",
  ],
}

const pricingFaq = [
  {
    q: "Are prices inclusive of GST?",
    a: "All figures are per outlet and GST exclusive, as shown on our official pricing matrix. GST is applied at checkout as per applicable law.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Start with a full-featured trial before you commit. No credit card required to explore the product.",
  },
  {
    q: "Can we switch between monthly and annual billing?",
    a: "You can move between monthly and annual billing according to your agreement. Annual plans are billed upfront and include the savings shown on each tier.",
  },
  {
    q: "What happens to our data if we upgrade or downgrade?",
    a: "Your data stays yours. You can move between Starter, Growth, and Professional — we never sell or share your salon data.",
  },
  {
    q: "Do you support custom multi-outlet or enterprise pricing?",
    a: "Yes. For larger chains or custom agreements, contact our sales team — we’ll tailor rollout, training, and commercials.",
  },
]

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly")

  return (
    <PublicShell>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-16 sm:py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-white blur-3xl" />
        </div>
        <div className="container relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-200/90">
            EaseMySalon · Salon OS for India
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Three tiers. Built for Indian salons &amp; spas.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-purple-100 sm:text-xl">
            Start lean, scale as you grow, or go full-power across every outlet. All prices in ₹ per outlet,{" "}
            <span className="font-medium text-white">GST exclusive</span> — effective April&nbsp;2026.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {TRUST_ITEMS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-purple-100 backdrop-blur-sm"
              >
                <Icon className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="border-b border-slate-200 bg-slate-50/80 py-16 sm:py-20">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between sm:gap-6">
            <div className="text-center sm:text-left">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Pick your tier</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-600 sm:text-base">
                Upgrade or downgrade anytime — your data stays yours. Annual billing saves more at every tier.
              </p>
            </div>
            <div
              className="inline-flex shrink-0 rounded-full border border-slate-200 bg-white p-1 shadow-sm"
              role="group"
              aria-label="Billing period"
            >
              <button
                type="button"
                onClick={() => setBillingPeriod("monthly")}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                  billingPeriod === "monthly"
                    ? "bg-slate-900 text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod("yearly")}
                className={`relative rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                  billingPeriod === "yearly"
                    ? "bg-[#7C3AED] text-white shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Annual
                <span className="absolute -right-1 -top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                  Save
                </span>
              </button>
            </div>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3 lg:gap-8">
            {PRICING_PLANS.map((plan) => {
              const isYearly = billingPeriod === "yearly"
              const headlineAmount = isYearly ? Math.round(plan.annualInr / 12) : plan.monthlyInr
              const displayMain = formatInr(headlineAmount)
              const subLine = isYearly
                ? `${formatInr(plan.annualInr)} per outlet / year · Save ${formatInr(plan.annualSavingsInr)} vs paying monthly`
                : "Billed monthly per outlet · Cancel anytime"

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col overflow-hidden border-2 transition-shadow hover:shadow-xl ${
                    plan.popular
                      ? "border-[#7C3AED] shadow-lg ring-2 ring-[#7C3AED]/20 lg:-translate-y-1"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute right-4 top-4">
                      <Badge className="bg-[#7C3AED] text-white hover:bg-[#7C3AED]">Most popular</Badge>
                    </div>
                  )}
                  <CardHeader className="space-y-3 pb-4 pt-8">
                    <div>
                      <CardTitle className="text-2xl font-bold text-slate-900">{plan.name}</CardTitle>
                      <CardDescription className="mt-2 text-base text-slate-600">{plan.tagline}</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-5xl">
                        {displayMain}
                      </span>
                      <span className="text-base font-medium text-slate-500">/mo</span>
                      <span className="w-full text-xs font-normal text-slate-500 sm:text-sm">
                        {isYearly ? "effective when billed annually" : "per outlet"}
                      </span>
                    </div>
                    <p className="text-sm font-medium leading-snug text-[#6D28D9]">{subLine}</p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-6 pt-0">
                    <ul className="flex-1 space-y-3">
                      {PLAN_HIGHLIGHTS[plan.id].map((line) => (
                        <li key={line} className="flex gap-3 text-sm text-slate-700">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto space-y-2">
                      <Button
                        asChild
                        size="lg"
                        className={`h-12 w-full text-base font-semibold ${
                          plan.popular
                            ? "bg-[#7C3AED] hover:bg-[#6D28D9]"
                            : "bg-slate-900 hover:bg-slate-800"
                        }`}
                      >
                        <Link href="/contact">
                          Start free trial
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                      <p className="text-center text-xs text-slate-500">14-day trial · No credit card required</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <p className="mt-10 text-center text-xs text-slate-500 sm:text-sm">
            Annual plans are billed upfront. Figures may change with notice — for enterprise or custom multi-outlet
            agreements,{" "}
            <Link href="/contact" className="font-medium text-[#7C3AED] underline-offset-2 hover:underline">
              contact sales
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Feature matrix */}
      <section className="bg-white py-16 sm:py-20">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-3 font-normal">
              Feature matrix
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">What&apos;s included</h2>
            <p className="mt-3 text-slate-600">
              What&apos;s included at every tier — condensed from our April 2026 matrix. Integrations marked Add-on
              are available as paid extras where noted.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-5xl">
            <div className="mb-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-slate-600 sm:text-sm">
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                </span>
                Included in tier
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="text-lg font-light text-slate-300">—</span>
                Not included
              </span>
              <span className="inline-flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  Add-on
                </Badge>
                Paid add-on
              </span>
              <span className="inline-flex items-center gap-2">
                <Badge className="bg-purple-100 text-[#5B21B6] hover:bg-purple-100 text-[10px]">Free</Badge>
                Complimentary where shown
              </span>
            </div>

            <PricingFeatureMatrix categories={FEATURE_CATEGORIES} />

            <p className="mt-6 text-center text-xs text-slate-500">
              For the full printable matrix and the latest line-by-line availability, ask our team or refer to your
              order form. Product roadmap may extend features over time.
            </p>

            <div className="mt-10 flex justify-center">
              <Button variant="outline" asChild className="border-[#7C3AED]/25 text-[#7C3AED] hover:bg-purple-50">
                <Link href="/features">Explore product features</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise strip */}
      <section className="border-y border-slate-200 bg-slate-50 py-12">
        <div className="container mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 text-center sm:px-6 lg:px-8">
          <Building2 className="h-10 w-10 text-[#7C3AED]" aria-hidden />
          <h2 className="text-2xl font-bold text-slate-900">Chains &amp; enterprise</h2>
          <p className="max-w-2xl text-slate-600">
            Professional covers full multi-outlet power. For custom commercials, SLAs, or dedicated rollout — we
            build agreements that match how you operate.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-2">
            <Link href="/contact">
              Talk to sales
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16 pb-20 sm:py-20 sm:pb-24">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Questions</h2>
            <p className="mt-2 text-slate-600">Straight answers — same tone as our pricing matrix.</p>
          </div>
          <div className="mt-10 space-y-3">
            {pricingFaq.map((item, idx) => (
              <details
                key={item.q}
                className="group rounded-xl border border-slate-200 bg-slate-50/50 px-4 shadow-sm open:bg-white open:shadow-md"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-left font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-sm font-bold text-[#6D28D9]">
                    {idx + 1}
                  </span>
                  <span className="flex-1 pr-2">{item.q}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-slate-100 pb-4 pl-11 pt-2 text-sm leading-relaxed text-slate-700">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
