import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://easemysalon.com'
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/dashboard/',
          '/login/',
          '/forgot-password/',
          '/reset-password/',
          '/unauthorized/',
          '/profile/',
          '/settings/',
          '/appointments/new/',
          '/clients/new/',
          '/products/new/',
          '/services/new/',
          '/staff/new/',
          '/bills/',
          '/billing/',
          '/receipt/',
          '/analytics/',
          '/campaigns/',
          '/cash-registry/',
          '/leads/',
          '/quick-sale/',
          '/reports/',
          '/users/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
