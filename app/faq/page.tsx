import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, HelpCircle, MessageCircle, Sparkles } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export const metadata: Metadata = {
  title: "FAQ | Ease My Salon",
  description: "Answers to common questions about Ease My Salon’s platform, onboarding, pricing and support.",
}

const faqs = [
  { q: "Is Ease My Salon cloud-based?", a: "Yes, it’s a secure cloud platform accessible from any device with real-time sync across branches." },
  { q: "How long does implementation take?", a: "Most salons go live in under a week including data migration, staff training and trial run." },
  { q: "Can you migrate data from my existing system?", a: "Absolutely. We import clients, memberships, services, price lists and stock from Excel/CSV exports for free." },
  { q: "Do you support GST invoices?", a: "Yes. POS and receipt flows are GST-compliant with configurable tax profiles per branch." },
  { q: "What kind of support do I receive?", a: "Email and WhatsApp support are included. Professional adds phone support; Enterprise gets 24/7 concierge + CSM." },
  { q: "Can my staff use it on mobile?", a: "Yes. Stylists can manage appointments, notes and goals through mobile-optimised dashboards while HQ works on desktop." },
]

export default function FAQPage() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 max-w-4xl">
          <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">Frequently Asked Questions</Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            Everything You Need to Know
          </h1>
          <p className="text-xl sm:text-2xl text-purple-100 leading-relaxed">
            Didn't find what you're looking for? <span className="font-semibold text-white">WhatsApp us anytime</span> and we'll respond within minutes.
          </p>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((item, idx) => (
                <AccordionItem 
                  key={idx} 
                  value={`item-${idx}`}
                  className="border-2 border-slate-100 rounded-2xl px-6 shadow-sm hover:shadow-lg transition-all hover:border-[#7C3AED]/30"
                >
                  <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline py-6">
                    <div className="flex items-center gap-3">
                      <HelpCircle className="h-5 w-5 text-[#7C3AED] flex-shrink-0" />
                      <span>{item.q}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-700 leading-relaxed pb-6 pl-8">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          
          {/* CTA Section */}
          <div className="mt-16 rounded-3xl bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white p-10 lg:p-16 text-center shadow-2xl max-w-4xl mx-auto">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/80" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Still Have Questions?</h2>
            <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
              Our team is here to help. Book a personalized demo or chat with us on WhatsApp.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="bg-white text-[#7C3AED] hover:bg-gray-100 px-8 py-6 h-auto text-lg font-semibold shadow-2xl">
                <Link href="/contact">
                  Book a Free Demo
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" asChild className="bg-white text-[#25D366] hover:bg-emerald-50 px-8 py-6 h-auto text-lg font-semibold shadow-2xl">
                <a href="https://wa.me/917091140602" target="_blank" rel="noreferrer">
                  Chat on WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

