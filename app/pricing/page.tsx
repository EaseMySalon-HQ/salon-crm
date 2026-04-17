"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCircle2, ArrowRight, Sparkles, Zap, Shield, TrendingUp, ChevronDown } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

/** Section label (renders as a non-bullet row) or a standard feature line */
type PlanFeatureLine = string | { heading: string }

function isFeatureHeading(line: PlanFeatureLine): line is { heading: string } {
  return typeof line === "object" && line !== null && "heading" in line
}

const planCards: Array<{
  title: string
  description: string
  monthlyPrice?: number
  yearlyPrice?: number
  price?: string
  includes: PlanFeatureLine[]
  popular?: boolean
  comingSoon?: boolean
}> = [
  {
    title: "Starter",
    monthlyPrice: 999,
    yearlyPrice: 9590, // 20% discount: 999 * 12 * 0.8 = 9590.4, rounded to 9590 (₹799/month)
    description:
      "Operations layer for small salons (1–3 staff). Everything you need to run your salon daily.",
    includes: [
      { heading: "Users & permissions" },
      "Admin + Staff roles (basic); limited permissions (no advanced control)",
      { heading: "Clients (CRM — Basic)" },
      "Client CRUD, basic info, basic visit history",
      { heading: "Appointments" },
      "Create, update & delete; calendar view; basic booking",
      { heading: "POS / Billing" },
      "Services & product billing; basic discounts; single staff assignment per bill",
      { heading: "Products & inventory (Basic)" },
      "Product list; manual stock updates",
      { heading: "Staff (Basic)" },
      "Staff profiles; login access",
      { heading: "Cash & expenses" },
      "Basic cash tracking (limited)",
      { heading: "Reports (Basic)" },
      "Daily revenue & basic summaries",
      { heading: "Notifications" },
      "WhatsApp receipts & basic reminders",
      "Marketing & campaigns not included",
    ],
    popular: false,
  },
  {
    title: "Professional",
    monthlyPrice: 2499,
    yearlyPrice: 23990, // 20% discount: 2499 * 12 * 0.8 = 23990.4, rounded to 23990 (₹1999/month)
    description:
      "Growth layer for growing salons (4–10+ staff). Increase revenue, retention, and efficiency.",
    includes: [
      "Everything in Starter",
      { heading: "Advanced permissions" },
      "Admin / Manager / Staff; full permission matrix & feature toggles",
      { heading: "Advanced CRM" },
      "Client analytics; visit history insights; CSV import; client segmentation",
      { heading: "Advanced appointments" },
      "Multi-staff & group bookings; lead → appointment conversion",
      { heading: "POS / Billing (Advanced)" },
      "Split payments; staff commission split; packages & memberships billing",
      { heading: "Inventory (Advanced)" },
      "Suppliers; purchase orders; inventory tracking; stock alerts",
      { heading: "Staff management" },
      "Commission system; performance tracking; working hours & schedules",
      { heading: "Memberships & packages" },
      "Full module access; redemption tracking; reports",
      { heading: "Advanced analytics" },
      "Revenue trends; service & staff performance; client insights",
      { heading: "Marketing & campaigns" },
      "WhatsApp campaigns; templates; segmentation; campaign stats",
      { heading: "Automation" },
      "Smart reminders; automated campaigns; retention nudges",
    ],
    popular: true,
  },
  {
    title: "Enterprise",
    price: "Custom",
    description: "For salon chains and large businesses.",
    includes: [
      "Unlimited staff members",
      "Everything in Professional",
      "Multi-location Support",
      "Centralized Reporting",
      "Custom Integrations & API",
      "Unlimited SMS",
      "Dedicated Account Manager",
      "On-site Training & Onboarding",
      "24/7 Priority Phone Support",
      "Custom Feature Development",
    ],
    popular: false,
  },
]

const pricingFaq = [
  { q: "Is there a free trial?", a: "Yes, every plan comes with a 14-day full-featured trial. No credit card required." },
  { q: "Can I upgrade or downgrade anytime?", a: "Absolutely. Plans can be changed instantly and invoices are prorated." },
  { q: "Do you offer annual billing?", a: "Annual commitments receive up to 20% savings plus onboarding credits." },
  { q: "What about data migration?", a: "Our concierge team imports clients, services, price lists and packages for free." },
  { q: "Is support included?", a: "Starter includes email support. Professional adds WhatsApp + phone. Enterprise gets 24/7 concierge." },
]

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly")

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price)
  }

  const getMonthlyEquivalent = (yearlyPrice: number) => {
    return Math.round(yearlyPrice / 12)
  }

  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-4xl space-y-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            Simple Pricing That Grows With Your Business
          </h1>
          <p className="text-xl sm:text-2xl text-purple-100 leading-relaxed">
            Start with a <span className="font-semibold text-white">14-day free trial</span>. No credit card required. Switch plans anytime—we'll prorate your invoice.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 text-sm text-left text-white/80">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
              <p className="text-base font-semibold text-white">Transparent by design</p>
              <p>No setup fees. No hidden charges. Honest invoices every month.</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
              <p className="text-base font-semibold text-white">Switch plans anytime</p>
              <p>Pause, upgrade or downgrade in a click. Billing prorates instantly across all branches.</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4 pt-4 text-sm text-purple-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <span>14-day free trial</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <span>Cancel anytime</span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Billing Period Toggle */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex items-center gap-4 p-1.5 bg-slate-100 rounded-full border border-slate-200">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                  billingPeriod === "monthly"
                    ? "bg-white text-slate-900 shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod("yearly")}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 relative ${
                  billingPeriod === "yearly"
                    ? "bg-white text-slate-900 shadow-md"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Yearly
                <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            {planCards.map((plan) => {
              const isCustom = plan.price === "Custom"
              const monthlyEquivalent = !isCustom && billingPeriod === "yearly"
                ? getMonthlyEquivalent(plan.yearlyPrice!)
                : null
              
              // For yearly: show monthly equivalent as main price, yearly total below
              const displayPrice = isCustom
                ? "Custom"
                : billingPeriod === "monthly"
                ? formatPrice(plan.monthlyPrice!)
                : formatPrice(monthlyEquivalent!)
              const displayPer = isCustom
                ? "contact us"
                : billingPeriod === "monthly"
                ? "per month"
                : "per month"
              const yearlyTotal = !isCustom && billingPeriod === "yearly"
                ? formatPrice(plan.yearlyPrice!)
                : null

              return (
                <Card
                  key={plan.title}
                  className={`relative border-2 transition-all hover:shadow-2xl flex flex-col ${
                    plan.popular
                      ? "border-[#7C3AED] shadow-2xl scale-[1.02] lg:-mt-4 lg:mb-4"
                      : "border-slate-200 hover:border-[#7C3AED]/50 shadow-lg"
                  }`}
                >
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {plan.popular && (
                      <Badge className="bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] text-white px-4 py-1.5 text-sm font-semibold shadow-lg">
                        Most Popular
                      </Badge>
                    )}
                    {plan.comingSoon && (
                      <Badge className="bg-amber-500 text-white px-4 py-1.5 text-sm font-semibold shadow-lg">
                        Coming Soon
                      </Badge>
                    )}
                  </div>
                  <CardHeader className="space-y-4 pt-8">
                    <div>
                      <CardTitle className="text-3xl font-bold text-slate-900">
                        {plan.title}
                      </CardTitle>
                      <CardDescription className="text-base text-slate-600 mt-2">
                        {plan.description}
                      </CardDescription>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-bold text-slate-900">{displayPrice}</span>
                        <span className="text-lg text-slate-500 font-normal">/{displayPer}</span>
                      </div>
                      {yearlyTotal && (
                        <p className="text-sm text-slate-600 font-medium">
                          {yearlyTotal}/per Year
                        </p>
                      )}
                      {!isCustom && (
                        <p className="text-sm text-slate-500">
                          {billingPeriod === "monthly"
                            ? "Billed monthly • Cancel anytime"
                            : "Billed annually • Save 20%"}
                        </p>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col flex-grow space-y-6">
                    <ul className="space-y-3 flex-grow">
                      {plan.includes.map((item, idx) =>
                        isFeatureHeading(item) ? (
                          <li
                            key={`h-${idx}`}
                            className="list-none pt-2 first:pt-0"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#7C3AED]">
                              {item.heading}
                            </p>
                          </li>
                        ) : (
                          <li key={idx} className="flex items-start gap-3">
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                            <span className="text-sm font-medium text-slate-700">
                              {item}
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                    <div className="mt-auto">
                      {plan.comingSoon ? (
                        <Button
                          size="lg"
                          disabled
                          className="w-full py-6 text-base font-semibold bg-slate-400 cursor-not-allowed text-white"
                        >
                          Coming Soon
                        </Button>
                      ) : (
                        <Button
                          asChild
                          size="lg"
                          className={`w-full py-6 text-base font-semibold ${
                            plan.popular
                              ? "bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-lg shadow-purple-200"
                              : "bg-slate-900 hover:bg-slate-800 text-white"
                          }`}
                        >
                          <Link href="/contact">
                            {isCustom ? "Contact Sales" : "Start Free Trial"}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                      {!isCustom && !plan.comingSoon && (
                        <p className="text-xs text-center text-slate-500 mt-2">
                          14-day free trial • No credit card required
                        </p>
                      )}
                      {isCustom && (
                        <p className="text-xs text-center text-slate-500 mt-2">
                          Custom pricing for your business needs
                        </p>
                      )}
                      {plan.comingSoon && (
                        <p className="text-xs text-center text-slate-500 mt-2">
                          We're working on this plan. Stay tuned!
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          
          {/* Value Proposition */}
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100">
              <Zap className="h-8 w-8 text-[#7C3AED] mx-auto mb-3" />
              <h3 className="font-semibold text-slate-900 mb-2">Setup in 24 Hours</h3>
              <p className="text-sm text-slate-600">We migrate your data, train your team, and launch you in under a day.</p>
            </div>
            <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
              <Shield className="h-8 w-8 text-emerald-600 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-900 mb-2">Enterprise-Grade Security</h3>
              <p className="text-sm text-slate-600">Bank-level encryption, GDPR compliant, and daily backups included.</p>
            </div>
            <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100">
              <TrendingUp className="h-8 w-8 text-blue-600 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-900 mb-2">ROI Guaranteed</h3>
              <p className="text-sm text-slate-600">Most salons see 3x ROI within 90 days through reduced wastage and better retention.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <Badge className="bg-purple-100 text-[#7C3AED]">Common Questions</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Everything You Need to Know</h2>
            <p className="text-lg text-slate-600">Transparent answers to help you make the right decision for your salon.</p>
          </div>
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Native <details> avoids Radix useId / aria-controls hydration mismatches with Next.js SSR */}
            {pricingFaq.map((item, idx) => (
              <details
                key={idx}
                className="group border-2 border-slate-100 rounded-2xl px-4 shadow-sm hover:shadow-lg transition-all open:shadow-md"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-left font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-sm font-bold text-[#7C3AED]">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-base">{item.q}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="border-t border-slate-100 pb-4 pl-11 pt-2 text-sm leading-relaxed text-slate-700">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
          
          {/* Final CTA */}
          <div className="rounded-3xl bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white p-10 lg:p-16 text-center shadow-2xl max-w-4xl mx-auto">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/80" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Still Have Questions?</h2>
            <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
              Our team is here to help. Book a personalized demo and get your questions answered.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="bg-white text-[#7C3AED] hover:bg-gray-100 px-8 py-6 h-auto text-lg font-semibold shadow-2xl">
                <Link href="/contact">
                  Book a Free Demo
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

