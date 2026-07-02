import { MetadataRoute } from "next"

import { BLOG_POSTS } from "@/lib/blog/posts"

const STATIC_ENTRIES: Array<{
  path: string
  priority: number
  changeFrequency: "daily" | "weekly" | "monthly"
}> = [
  { path: "", priority: 1.0, changeFrequency: "daily" },
  { path: "/features", priority: 0.9, changeFrequency: "weekly" },
  { path: "/solutions", priority: 0.85, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "/contact", priority: 0.8, changeFrequency: "monthly" },
  { path: "/demo", priority: 0.85, changeFrequency: "monthly" },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.75, changeFrequency: "weekly" },
  // SEO-optimized top-level feature landing pages
  { path: "/salon-billing-software", priority: 0.85, changeFrequency: "weekly" },
  { path: "/salon-crm", priority: 0.85, changeFrequency: "weekly" },
  { path: "/appointment-management", priority: 0.85, changeFrequency: "weekly" },
  { path: "/inventory-management", priority: 0.85, changeFrequency: "weekly" },
  { path: "/staff-management", priority: 0.85, changeFrequency: "weekly" },
  { path: "/payroll-management", priority: 0.85, changeFrequency: "weekly" },
  { path: "/whatsapp-marketing", priority: 0.85, changeFrequency: "weekly" },
  { path: "/reports-analytics", priority: 0.85, changeFrequency: "weekly" },
  // Nested feature category pages (kept for internal linking)
  { path: "/features/billing", priority: 0.75, changeFrequency: "weekly" },
  { path: "/features/appointments", priority: 0.75, changeFrequency: "weekly" },
  { path: "/features/whatsapp-marketing", priority: 0.75, changeFrequency: "weekly" },
  { path: "/features/multi-branch", priority: 0.75, changeFrequency: "weekly" },
  // Legal
  { path: "/privacy-policy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/terms-and-conditions", priority: 0.3, changeFrequency: "monthly" },
  { path: "/refund-policy", priority: 0.3, changeFrequency: "monthly" },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.easemysalon.in"

  const staticUrls = STATIC_ENTRIES.map(({ path, priority, changeFrequency }) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }))

  const blogUrls = BLOG_POSTS.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }))

  return [...staticUrls, ...blogUrls]
}
