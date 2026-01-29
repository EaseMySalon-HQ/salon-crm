import Link from "next/link"
import Image from "next/image"
import { ArrowRight, CheckCircle2, Shield, Sparkles, TrendingUp, Users, BarChart3, Calendar, Receipt, MessageCircle, Star, Zap, Award, Clock, DollarSign, Target, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PublicShell } from "@/components/layout/public-shell"

const coreFeatures = [
  { 
    icon: Receipt, 
    title: "POS & Billing", 
    desc: "Fast GST-ready billing with split payments and memberships.",
    benefit: "Reduce billing time by 70%",
    metric: "Average checkout: 30 seconds"
  },
  { 
    icon: Calendar, 
    title: "Appointments", 
    desc: "WhatsApp-native calendar with smart reminders and waitlists.",
    benefit: "Cut no-shows by 40%",
    metric: "Automated reminders via WhatsApp"
  },
  { 
    icon: Users, 
    title: "CRM & Loyalty", 
    desc: "360° client records, segments, packages and campaigns.",
    benefit: "Increase repeat visits by 35%",
    metric: "Complete client history at your fingertips"
  },
  { 
    icon: BarChart3, 
    title: "Inventory", 
    desc: "Real-time stock, expiry alerts, purchase orders and transfers.",
    benefit: "Reduce wastage by 50%",
    metric: "Never run out of stock again"
  },
  { 
    icon: Shield, 
    title: "Staff & Roles", 
    desc: "Attendance, commission engine and granular permissions.",
    benefit: "Automate payroll in minutes",
    metric: "Fair, transparent commission tracking"
  },
  { 
    icon: TrendingUp, 
    title: "Reports", 
    desc: "50+ live dashboards for revenue, clients, staff and branches.",
    benefit: "Make data-driven decisions",
    metric: "Real-time insights, anytime, anywhere"
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

const plans = [
  {
    name: "Starter",
    price: "₹999",
    subtitle: "Perfect for small salons just getting started.",
    features: [
      "Up to 3 staff members",
      "POS & Billing",
      "Appointment Management",
      "Basic Reports",
      "WhatsApp Receipts",
      "100 SMS/month",
      "Email Support",
      "Mobile App Access",
    ],
    savings: null,
    featured: false,
  },
  {
    name: "Professional",
    price: "₹2,499",
    subtitle: "For growing salons with multiple staff.",
    features: [
      "Up to 10 staff members",
      "Everything in Starter",
      "Inventory Management",
      "Customer CRM with History",
      "Advanced Analytics & Reports",
      "Staff Commission Tracking",
      "500 SMS/month",
      "Priority Email & Phone Support",
      "Custom Receipt Templates",
      "Data Export (Excel/PDF)",
    ],
    featured: true,
    savings: "Save ₹3,000/year",
  },
  {
    name: "Enterprise",
    price: "Custom",
    subtitle: "For salon chains and large businesses.",
    features: [
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
    savings: "Best value for chains",
    featured: false,
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
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white">
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div className="space-y-8 text-center lg:text-left">
              {/* Main Headline */}
              <div className="space-y-6">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight">
                  Stop Losing Money. Start Growing Your Salon Business.
                </h1>
                <p className="text-xl sm:text-2xl text-purple-100 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                  India's #1 Salon Management Software. <span className="font-semibold text-white">Reduce no-shows by 40%</span>, <span className="font-semibold text-white">cut billing time by 70%</span>, and <span className="font-semibold text-white">increase revenue by 35%</span> — all in one platform.
                </p>
              </div>
              
              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button size="lg" asChild className="bg-white text-[#7C3AED] hover:bg-gray-100 px-8 py-6 h-auto text-lg font-semibold shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all">
                  <Link href="/contact">
                    Book a Free Demo
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="px-8 py-6 h-auto text-lg border-2 border-white/40 text-white bg-white/5 hover:bg-white/20 backdrop-blur-sm"
                >
                  <Link href="/pricing">See Pricing</Link>
                </Button>
              </div>
              
              {/* Risk Reversal */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm text-purple-200 pt-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>14-day free trial</span>
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
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900">Everything you need to run a high-growth salon</h2>
            <p className="text-lg text-slate-600">Ease My Salon unifies POS, appointments, CRM, inventory, staff payroll and analytics—no integrations required.</p>
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
                    <Link href="/features">
                      Learn more <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* CTA after features */}
          <div className="mt-12 text-center">
            <Button size="lg" asChild className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-8">
              <Link href="/contact">
                See All Features
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 grid gap-12 lg:grid-cols-2 items-start">
          <div className="space-y-6">
            <p className="text-sm uppercase tracking-wide text-white/60">Why Ease My Salon</p>
            <h2 className="text-3xl md:text-4xl font-semibold">Purpose-built for Indian salons and spas</h2>
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
                <Link href="/contact">
                  Experience the Difference
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="bg-white text-slate-900 rounded-3xl p-8 shadow-2xl space-y-8">
            <div>
              <p className="text-sm font-semibold text-[#7C3AED] uppercase tracking-wide">Product preview</p>
              <h3 className="text-2xl font-semibold mt-2">Designed for the front desk, built for the CEO</h3>
            </div>
            <Image src="/images/dashboard.png" alt="Ease My Salon dashboard preview" width={1200} height={675} className="rounded-2xl border border-slate-100" />
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
          <div className="mt-12 grid gap-6 lg:grid-cols-4">
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

      <section className="py-20 bg-slate-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <Badge className="bg-blue-50 text-blue-700">Pricing</Badge>
            <h2 className="text-3xl font-semibold text-slate-900">Transparent plans for every stage</h2>
            <p className="text-lg text-slate-600">Start with a 14-day free trial. No credit card needed. Switch plans anytime.</p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => {
              const previewCount = 5
              const primaryFeatures = plan.features.slice(0, previewCount)
              const remainingFeatures = plan.features.slice(previewCount)

              return (
                <Card
                  key={plan.name}
                  className={`border-2 relative ${plan.featured ? "border-[#7C3AED] shadow-2xl scale-[1.02] lg:scale-105" : "border-slate-100 shadow-sm"} hover:shadow-xl transition-all`}
                >
                {plan.featured && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white px-4 py-1 shadow-lg">
                      ⭐ Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="space-y-3 pt-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                  </div>
                  <p className="text-sm text-slate-600">{plan.subtitle}</p>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                      {plan.price !== "Custom" && <span className="text-base text-slate-500">/month</span>}
                      {plan.price === "Custom" && <span className="text-base text-slate-500">/contact us</span>}
                    </div>
                    {plan.savings && (
                      <p className="text-sm font-semibold text-emerald-600 mt-1">{plan.savings}</p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ul className="space-y-3 text-sm text-slate-700">
                    {primaryFeatures.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  {remainingFeatures.length > 0 && (
                    <details className="group rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3">
                      <summary className="flex items-center justify-center gap-2 cursor-pointer text-sm font-semibold text-[#7C3AED]">
                        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                        <span className="group-open:hidden">Show {remainingFeatures.length} more features</span>
                        <span className="hidden group-open:inline">Hide extra features</span>
                      </summary>
                      <ul className="mt-3 space-y-3 text-sm text-slate-700">
                        {remainingFeatures.map((item, idx) => (
                          <li key={`extra-${plan.name}-${idx}`} className="flex items-start gap-3">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <Button 
                    asChild 
                    size="lg"
                    className={`w-full ${plan.featured ? "bg-[#7C3AED] hover:bg-[#6D28D9] text-white shadow-lg" : "border-2"}`}
                    variant={plan.featured ? "default" : "outline"}
                  >
                    <Link href="/contact">
                      {plan.price === "Custom" ? "Contact Sales" : "Book a Demo"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  {plan.price !== "Custom" && (
                    <p className="text-xs text-center text-slate-500">
                      ✓ 14-day free trial • ✓ No credit card • ✓ Cancel anytime
                    </p>
                  )}
                </CardContent>
              </Card>
              )
            })}
          </div>
          
          {/* Pricing CTA */}
          <div className="mt-12 text-center p-8 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100">
            <p className="text-lg font-semibold text-slate-900 mb-2">Not sure which plan is right for you?</p>
            <p className="text-slate-600 mb-4">Book a free consultation and we'll help you choose the perfect plan.</p>
            <Button size="lg" asChild className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white">
              <Link href="/contact">
                Get Free Consultation
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

    </PublicShell>
  )
}
