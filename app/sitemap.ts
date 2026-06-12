import { MetadataRoute } from "next"

import { BLOG_POSTS } from "@/lib/blog/posts"

const STATIC_ENTRIES: Array<{ path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }> = [
  { path: "", priority: 1.0, changeFrequency: "daily" },
  { path: "/features", priority: 0.9, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
  { path: "/solutions", priority: 0.8, changeFrequency: "weekly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
  { path: "/blog", priority: 0.75, changeFrequency: "weekly" },
  { path: "/privacy-policy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/features/billing", priority: 0.85, changeFrequency: "weekly" },
  { path: "/features/appointments", priority: 0.85, changeFrequency: "weekly" },
  { path: "/features/whatsapp-marketing", priority: 0.85, changeFrequency: "weekly" },
  { path: "/features/multi-branch", priority: 0.85, changeFrequency: "weekly" },
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
