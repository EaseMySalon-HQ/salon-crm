import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://easemysalon.com'
  
  const routes = [
    '',
    '/about',
    '/features',
    '/pricing',
    '/contact',
    '/blog',
    '/faq',
    '/privacy-policy',
    '/terms-and-conditions',
    '/refund-policy',
    '/solutions',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }))

  return routes
}
