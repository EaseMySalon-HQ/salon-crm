import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2, MessageCircle, Phone, Mail, MapPin, Clock, Users, Sparkles } from "lucide-react"

import { PublicShell } from "@/components/layout/public-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ContactForm } from "@/components/marketing/contact-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Contact & Demo | Ease My Salon",
  description: "Talk to our team, schedule a personalised demo or download the Ease My Salon brochure.",
}

const contactHighlights = [
  {
    title: "Human onboarding",
    desc: "We migrate clients, services and inventory data for free within 48 hours.",
  },
  {
    title: "WhatsApp-first support",
    desc: "Concierge team is available 10am–10pm IST for Professional and above.",
  },
  {
    title: "All-India coverage",
    desc: "Trainers and success managers across Mumbai, Bengaluru, Delhi, Pune and beyond.",
  },
]

export default function ContactPage() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white py-20 lg:py-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-4xl space-y-6">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            Book a Personalized Walkthrough
          </h1>
          <p className="text-xl sm:text-2xl text-purple-100 leading-relaxed">
            Share your priorities and we'll curate a <span className="font-semibold text-white">live demo</span> with POS, appointments, staff management and analytics tailored to your business.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-4 text-sm text-purple-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <span>Free 30-minute demo</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <span>No commitment required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <span>See it live in action</span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white" id="get-in-touch">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 space-y-4">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 scroll-mt-[7.5rem]">Get in Touch</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">Fill out the form below and we'll get back to you within 1 business day with a personalized demo.</p>
          </div>
          
          <div className="grid gap-8 lg:grid-cols-3">
            <Card className="lg:col-span-2 border-2 border-slate-100 shadow-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl font-bold">Tell Us About Your Salon</CardTitle>
                <CardDescription className="text-base">We'll reply within 1 business day with a calendar invite and WhatsApp confirmation.</CardDescription>
              </CardHeader>
              <CardContent>
                <ContactForm />
              </CardContent>
            </Card>

            <div className="space-y-6">
              {contactHighlights.map((item, idx) => (
                <Card key={item.title} className="border-2 border-slate-100 shadow-lg hover:shadow-xl transition-all hover:border-[#7C3AED]/30">
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-50 to-indigo-50 text-[#7C3AED] flex items-center justify-center">
                        {idx === 0 && <Users className="h-5 w-5" />}
                        {idx === 1 && <MessageCircle className="h-5 w-5" />}
                        {idx === 2 && <MapPin className="h-5 w-5" />}
                      </div>
                      <CardTitle className="text-lg font-bold">{item.title}</CardTitle>
                    </div>
                    <CardDescription className="text-sm">{item.desc}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
              
              <Card className="border border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-900">Chat on WhatsApp</CardTitle>
                  <CardDescription className="text-sm text-slate-600">We typically reply in under 5 minutes.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full bg-[#25D366] hover:bg-[#1FB55B] text-white">
                    <a href="https://wa.me/917091140602?text=Hi%20Ease%20My%20Salon!%20We%20would%20like%20a%20demo." target="_blank" rel="noreferrer">
                      Start WhatsApp chat
                    </a>
                  </Button>
                </CardContent>
              </Card>
              
              <Card className="border-2 border-slate-100 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg font-bold">Other Ways to Reach Us</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-[#7C3AED] mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Phone</p>
                      <a href="tel:+917091140602" className="text-sm text-slate-600 hover:text-[#7C3AED]">+91 70911 40602</a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-[#7C3AED] mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Email</p>
                      <a href="mailto:hello@easemysalon.in" className="text-sm text-slate-600 hover:text-[#7C3AED]">hello@easemysalon.in</a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-[#7C3AED] mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Response Time</p>
                      <p className="text-sm text-slate-600">Within 1 business day</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

