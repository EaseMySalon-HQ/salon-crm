"use client"

import { useEffect, useState } from "react"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PricingAddOnCards } from "@/components/pricing/pricing-addon-cards"
import { PricingFeatureMatrix } from "@/components/pricing/pricing-feature-matrix"
import { PricingTierCards } from "@/components/pricing/pricing-tier-cards"
import { PRICING_FAQ } from "@/lib/pricing-faq"
import {
  FEATURE_CATEGORIES,
  PRICING_PLANS,
  type FeatureCategory,
  type PricingPlan,
} from "@/lib/pricing-matrix"
import {
  fetchPublicPlanPricing,
  fetchPublicPricingMatrix,
  type PublicPlanPricing,
} from "@/lib/public-pricing-api"

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: "99.99% uptime SLA" },
  { icon: Sparkles, label: "Free setup, training & data migration" },
  { icon: Headphones, label: "24/7 support available" },
] as const

function applyAdminPricing(
  plans: PricingPlan[],
  pricing: PublicPlanPricing[],
): PricingPlan[] {
  if (pricing.length === 0) return plans
  const byId = new Map(pricing.map((p) => [p.id, p]))
  return plans.map((plan) => {
    const override = byId.get(plan.id)
    if (!override) return plan
    const monthly = override.monthlyPrice ?? plan.monthlyInr
    const annual = override.yearlyPrice ?? plan.annualInr
    const savings = Math.max(0, monthly * 12 - annual)
    return {
      ...plan,
      monthlyInr: monthly,
      annualInr: annual,
      annualSavingsInr: savings,
    }
  })
}

export default function PricingPage() {
  const [matrixCategories, setMatrixCategories] = useState<FeatureCategory[]>(FEATURE_CATEGORIES)
  const [plans, setPlans] = useState<PricingPlan[]>(PRICING_PLANS)

  useEffect(() => {
    fetchPublicPricingMatrix().then((categories) => {
      if (categories.length > 0) setMatrixCategories(categories)
    })
    fetchPublicPlanPricing().then((pricing) => {
      if (pricing.length > 0) setPlans((current) => applyAdminPricing(current, pricing))
    })
  }, [])

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
            Free to start. Grow when you&apos;re ready.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-purple-100 sm:text-xl">
            Run your salon on Free, unlock feedback &amp; loyalty on Growth, or go all-in with Pro — WhatsApp
            automation included. All prices in ₹ per outlet,{" "}
            <span className="font-medium text-white">GST exclusive</span>.
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
      <section className="border-b border-slate-200 bg-white py-16 sm:py-20">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Pick your tier</h2>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">
              Start free, upgrade anytime — your data stays yours.
            </p>
          </div>

          <div className="mt-12">
            <PricingTierCards plans={plans} />
          </div>

          <div className="mt-20">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="secondary" className="mb-3 font-normal">
                Optional add-ons
              </Badge>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Plug in what you need
              </h2>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Layer integrations on top of any plan. Setup and onboarding handled by our team.
              </p>
            </div>

            <div className="mt-10">
              <PricingAddOnCards />
            </div>
          </div>

          <p className="mt-10 text-center text-xs text-slate-500 sm:text-sm">
            Prices shown are monthly per outlet. For enterprise or custom multi-outlet agreements,{" "}
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
              Compare Free, Growth, and Pro — from core salon ops to feedback, loyalty, and WhatsApp.
              Integrations marked Add-on are available as paid extras where noted.
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
                <span className="text-xs font-semibold text-amber-600">Soon</span>
                Coming soon
              </span>
            </div>

            <PricingFeatureMatrix categories={matrixCategories} plans={plans} />

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
            Pro covers full multi-outlet power. For custom commercials, SLAs, or dedicated rollout — we
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
            {PRICING_FAQ.map((item, idx) => (
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
