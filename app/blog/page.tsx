import type { Metadata } from "next"

import { PublicShell } from "@/components/layout/public-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Blog | Ease My Salon",
  description: "Insights, playbooks and best practices for Indian salons, spas and grooming brands.",
}

const articles = [
  {
    title: "Why every salon needs an operating system",
    summary: "How a unified POS + CRM + inventory stack cuts costs and unlocks personalised experiences.",
    tag: "Playbook",
  },
  {
    title: "Reducing no-shows with WhatsApp automation",
    summary: "Templates, reminder cadences and offers that recovered ₹2.3M in revenue for leading salons.",
    tag: "Growth",
  },
  {
    title: "Inventory mistakes salon owners make",
    summary: "From shrinkage to shelf-life, here’s a proven framework for healthier margins.",
    tag: "Operations",
  },
]

export default function BlogPage() {
  return (
    <PublicShell>
      <section className="py-16 bg-gradient-to-b from-white via-orange-50/40 to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 space-y-4 text-center max-w-3xl">
          <Badge className="bg-orange-100 text-orange-700">Insights</Badge>
          <h1 className="text-4xl font-semibold text-slate-900">Salon growth playbooks</h1>
          <p className="text-lg text-slate-600">Actionable tips from the Ease My Salon community. Subscribe to get monthly updates in your inbox.</p>
          <Button asChild className="bg-[#7C3AED] hover:bg-[#6D28D9]">
            <a href="mailto:hello@easemysalon.in">Subscribe to newsletter</a>
          </Button>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Card key={article.title} className="border border-slate-100 shadow-sm">
              <CardHeader>
                <Badge className="bg-slate-100 text-slate-700 w-fit mb-2">{article.tag}</Badge>
                <CardTitle>{article.title}</CardTitle>
                <CardDescription>{article.summary}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-400">Full article coming soon.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </PublicShell>
  )
}

