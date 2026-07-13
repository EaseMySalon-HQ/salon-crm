import { MetadataRoute } from "next"

import { BLOG_POSTS } from "@/lib/blog/posts"
import { resolveApiBaseUrl } from "@/lib/resolve-api-base-url"

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
  { path: "/salon-billing-software", priority: 0.85, changeFrequency: "weekly" },
  { path: "/salon-crm", priority: 0.85, changeFrequency: "weekly" },
  { path: "/appointment-management", priority: 0.85, changeFrequency: "weekly" },
  { path: "/inventory-management", priority: 0.85, changeFrequency: "weekly" },
  { path: "/staff-management", priority: 0.85, changeFrequency: "weekly" },
  { path: "/payroll-management", priority: 0.85, changeFrequency: "weekly" },
  { path: "/whatsapp-marketing", priority: 0.85, changeFrequency: "weekly" },
  { path: "/reports-analytics", priority: 0.85, changeFrequency: "weekly" },
  { path: "/features/billing", priority: 0.75, changeFrequency: "weekly" },
  { path: "/features/appointments", priority: 0.75, changeFrequency: "weekly" },
  { path: "/features/whatsapp-marketing", priority: 0.75, changeFrequency: "weekly" },
  { path: "/features/multi-branch", priority: 0.75, changeFrequency: "weekly" },
  { path: "/privacy-policy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/terms-and-conditions", priority: 0.3, changeFrequency: "monthly" },
  { path: "/refund-policy", priority: 0.3, changeFrequency: "monthly" },
]

const SALON_SUBPATHS = [
  "",
  "/services",
  "/packages",
  "/memberships",
  "/products",
  "/gallery",
  "/team",
  "/reviews",
  "/contact",
  "/offers",
]

async function fetchSalonEntries(baseUrl: string): Promise<MetadataRoute.Sitemap> {
  try {
    const res = await fetch(`${resolveApiBaseUrl()}/public/sites/sitemap-entries`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const json = await res.json()
    const entries: Array<{ slug: string; lastModified?: string }> = json?.data?.entries || []
    const out: MetadataRoute.Sitemap = []
    for (const entry of entries) {
      const lastModified = entry.lastModified ? new Date(entry.lastModified) : new Date()
      for (const sub of SALON_SUBPATHS) {
        out.push({
          url: `${baseUrl}/salon/${entry.slug}${sub}`,
          lastModified,
          changeFrequency: "weekly",
          priority: sub === "" ? 0.8 : 0.6,
        })
      }
    }
    return out
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  const salonUrls = await fetchSalonEntries(baseUrl)

  return [...staticUrls, ...blogUrls, ...salonUrls]
}
