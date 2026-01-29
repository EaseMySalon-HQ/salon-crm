import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2, TrendingUp, Zap, Target, Users } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Solutions | Ease My Salon",
  description: "Playbooks for boutique salons, premium spas, barbershops and multi-location chains.",
}

const solutions = [
  {
    title: "Boutique salons",
    problem: "Manual billing, scattered WhatsApp bookings and zero client visibility.",
    solve: "Digitise appointments + POS, auto reminders, loyalty programs and instant revenue dashboards.",
    outcome: "Cut no-shows by 40% and increase repeat rate within 60 days.",
  },
  {
    title: "Premium spas & wellness",
    problem: "Complex packages, memberships and split payments slow down front-desk teams.",
    solve: "Custom packages, prepaid credits, room & therapist allocation plus mobile check-in.",
    outcome: "Smarter utilisation and 20% faster billing per guest.",
  },
  {
    title: "Barbershops & grooming lounges",
    problem: "High walk-in volume needs speed while keeping stylists productive.",
    solve: "Queue management with QR check-ins, cashless POS and stylist performance boards.",
    outcome: "Serve more guests per chair and keep stylists accountable.",
  },
  {
    title: "Multi-location chains",
    problem: "No unified view of revenue, staff performance and inventory shrinkage.",
    solve: "HQ command centre, branch benchmarking, central catalogues and transfer logs.",
    outcome: "Confident expansion with franchise-ready controls.",
  },
  {
    title: "Franchise & partner networks",
    problem: "Need standardised SOPs and brand governance without micro-managing branches.",
    solve: "Approval workflows, templated offers, digital SOPs and audit-ready logs.",
    outcome: "Protect brand experience while empowering local agility.",
  },
]

export default function SolutionsPage() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 max-w-4xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            Built for Every Salon Type, Every Growth Stage
          </h1>
          <p className="text-xl sm:text-2xl text-purple-100 leading-relaxed">
            From single-chair boutiques to nationwide chains—<span className="font-semibold text-white">Ease My Salon adapts to your business model</span> with purpose-built workflows and proven playbooks.
          </p>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 grid gap-8">
          {solutions.map((solution, idx) => (
            <Card key={solution.title} className="border-2 border-slate-100 shadow-lg hover:shadow-2xl transition-all group hover:border-[#7C3AED]/30">
              <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 pb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 text-[#7C3AED] flex items-center justify-center group-hover:scale-110 transition-transform font-bold">
                      {idx + 1}
                    </div>
                    <CardTitle className="text-2xl font-bold text-slate-900">{solution.title}</CardTitle>
                  </div>
                  <div className="rounded-2xl bg-red-50 border border-red-100 p-4 mb-4">
                    <p className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-2">The Challenge</p>
                    <p className="text-slate-700 font-medium">{solution.problem}</p>
                  </div>
                </div>
                <Button asChild className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-lg">
                  <Link href="/contact">
                    See How It Works
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-100 p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="h-5 w-5 text-[#7C3AED]" />
                      <p className="text-sm font-semibold text-[#7C3AED] uppercase tracking-wide">Our Solution</p>
                    </div>
                    <p className="text-slate-800 font-medium leading-relaxed">{solution.solve}</p>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                      <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">Proven Results</p>
                    </div>
                    <p className="text-emerald-900 font-bold text-lg leading-relaxed">{solution.outcome}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* CTA Section */}
        <div className="mt-16 container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white p-10 lg:p-16 text-center shadow-2xl">
            <Target className="h-12 w-12 mx-auto mb-4 text-white/80" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Transform Your Salon Operations?</h2>
            <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
              Book a personalized demo and see exactly how Ease My Salon can solve your unique challenges.
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

