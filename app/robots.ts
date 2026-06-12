import { MetadataRoute } from "next"

/**
 * robots.txt sequencing (SEO pack):
 *
 * PHASE 1 (current): Allow crawling of app routes so Googlebot can see noindex
 * headers/meta and drop already-indexed URLs like /profile from search.
 * Only block /api/.
 *
 * PHASE 2 (~2–4 weeks later): After GSC → Pages confirms app URLs are gone,
 * re-add disallows from ROBOTS_DISALLOW_PHASE2 in lib/seo/route-classification.ts
 * and optionally add "/*?action=" for query-param profile URLs.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.easemysalon.in"

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
