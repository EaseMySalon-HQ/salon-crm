import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2, TrendingUp, Zap, Clock } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Features | Ease My Salon",
  description: "Deep dive into POS, appointments, CRM, inventory, staff, reports, receipts, cash registry, admin & security modules.",
}

const featureSections = [
  {
    title: "Point of Sale (POS)",
    description: "Blazing fast, GST-compliant POS built for front desk speed with split payments and upsell prompts.",
    bullets: ["Custom combos & memberships", "Wallets, UPI, cards, cash in a single receipt", "Smart upsell recommendations at checkout"],
  },
  {
    title: "Appointments & CRM",
    description: "Drag-and-drop calendar synced with WhatsApp. Manage stylists, waitlists and VIP preferences effortlessly.",
    bullets: ["Auto reminders & confirmations", "Colour-coded staff calendars", "Client notes, tags and preferences"],
  },
  {
    title: "Inventory & procurement",
    description: "Track every SKU with expiry, vendor, reorder alerts and multi-warehouse visibility.",
    bullets: ["Low-stock + pilferage alerts", "GRN, purchase orders and approvals", "Kit & bundle tracking"],
  },
  {
    title: "Staff, payroll & roles",
    description: "Single source of truth for attendance, rosters, commissions and access permissions.",
    bullets: ["Commission rules per service/product", "Digital rosters & shift swaps", "Granular roles for branches and HQ"],
  },
  {
    title: "Reports & analytics",
    description: "50+ dashboards covering revenue, channels, repeat clients, utilisation and stock health.",
    bullets: ["Branch comparisons with benchmarking", "Subscription & membership insights", "Export-ready for finance & investors"],
  },
  {
    title: "Receipts & cash registry",
    description: "Professional GST invoices, paperless signatures, cash drawer reconciliation and night audits.",
    bullets: ["Thermal & A4 templates", "Multi-currency tips & settlements", "Daily open-close workflows"],
  },
  {
    title: "Admin & multi-location control",
    description: "Centralise offers, pricing, catalogues and SOPs while branches retain local agility.",
    bullets: ["Branch-specific taxes and pricing", "Approval flows for discounts", "Central content + assets"],
  },
  {
    title: "Security & compliance",
    description: "Enterprise-grade security, audit trails and compliance with GDPR/DPDP readiness.",
    bullets: ["Role-based access, SSO ready", "Field-level encryption", "Comprehensive activity logs"],
  },
]

export default function FeaturesPage() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight max-w-4xl mx-auto">
            Everything You Need to Run a High-Growth Salon Business
          </h1>
          <p className="text-xl sm:text-2xl text-purple-100 max-w-3xl mx-auto leading-relaxed">
            One powerful platform that replaces spreadsheets, legacy POS, and disconnected apps.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" asChild className="bg-white text-[#7C3AED] hover:bg-gray-100 px-8 py-6 h-auto text-lg font-semibold shadow-2xl">
              <Link href="/contact#get-in-touch">
                See It In Action - Book Demo
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-2 border-white/60 bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm px-8 py-6 h-auto text-lg font-semibold">
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 grid gap-8">
          {featureSections.map((section, idx) => (
            <Card key={section.title} className="border-2 border-slate-100 shadow-lg hover:shadow-2xl transition-all group hover:border-[#7C3AED]/30">
              <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 pb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 text-[#7C3AED] flex items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="text-xl font-bold">{idx + 1}</span>
                    </div>
                    <CardTitle className="text-2xl">{section.title}</CardTitle>
                  </div>
                  <CardDescription className="text-base text-slate-700 max-w-3xl leading-relaxed">
                    {section.description}
                  </CardDescription>
                </div>
                <Button asChild className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-lg">
                  <Link href="/contact">
                    See Live Demo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-4 text-sm text-slate-700 md:grid-cols-3">
                  {section.bullets.map((bullet, bulletIdx) => (
                    <li key={bulletIdx} className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-slate-50 to-white p-4 border border-slate-100 hover:border-[#7C3AED]/30 transition-all group/item">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5 group-hover/item:scale-110 transition-transform" />
                      <span className="font-medium">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* CTA Section */}
        <div className="mt-16 container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white p-10 lg:p-16 text-center shadow-2xl">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Experience All Features?</h2>
            <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
              Book a personalized demo and see exactly how Ease My Salon can transform your salon operations.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                asChild
                className="bg-white text-[#7C3AED] hover:bg-gray-100 px-8 py-6 h-auto text-lg font-semibold shadow-2xl"
              >
                <Link href="/pricing">View Pricing Plans</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

