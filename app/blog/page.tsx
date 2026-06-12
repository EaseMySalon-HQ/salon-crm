import type { Metadata } from "next"
import Link from "next/link"

import { PublicShell } from "@/components/layout/public-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BLOG_POSTS } from "@/lib/blog/posts"

export const metadata: Metadata = {
  title: "Salon Management Blog | Tips, Strategies & Best Practices",
  description: "Insights, playbooks and best practices for Indian salons, spas and grooming brands. Learn how to grow your salon business, reduce no-shows, manage inventory, and increase revenue.",
  keywords: [
    "salon management tips",
    "salon business blog",
    "salon growth strategies",
    "salon management best practices",
    "salon business advice",
    "salon marketing tips",
    "salon operations guide",
    "salon management insights",
    "salon industry trends",
    "salon business growth",
    "salon management playbooks",
    "salon success stories"
  ],
  openGraph: {
    title: "Salon Management Blog | EaseMySalon",
    description: "Insights, playbooks and best practices for Indian salons, spas and grooming brands.",
  },
  alternates: {
    canonical: '/blog',
  },
}

export default function BlogPage() {
  return (
    <PublicShell>
      <section className="py-16 bg-gradient-to-b from-white via-orange-50/40 to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 space-y-4 text-center max-w-3xl">
          <Badge className="bg-orange-100 text-orange-700">Insights</Badge>
          <h1 className="text-4xl font-semibold text-slate-900">Salon growth playbooks</h1>
          <p className="text-lg text-slate-600">Actionable tips for Indian salon owners — no-shows, GST, commissions, and growth strategies.</p>
          <Button asChild className="bg-[#7C3AED] hover:bg-[#6D28D9]">
            <a href="mailto:support@easemysalon.in">Subscribe to newsletter</a>
          </Button>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 grid gap-6 md:grid-cols-2">
          {BLOG_POSTS.map((article) => (
            <Card key={article.slug} className="border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <Badge className="bg-slate-100 text-slate-700 w-fit mb-2">{article.tag}</Badge>
                <CardTitle>
                  <Link href={`/blog/${article.slug}`} className="hover:text-[#7C3AED] transition-colors">
                    {article.title}
                  </Link>
                </CardTitle>
                <CardDescription>{article.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-400 mb-3">{article.publishedAt}</p>
                <Button asChild variant="link" className="p-0 h-auto text-[#7C3AED]">
                  <Link href={`/blog/${article.slug}`}>Read article →</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </PublicShell>
  )
}
