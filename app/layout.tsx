import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from "@/lib/auth-context"
import { AdminAuthProvider } from "@/lib/admin-auth-context"
import { CookieConsentBanner } from "@/components/gdpr/cookie-consent-banner"
import { OrganizationSchema, SoftwareApplicationSchema } from "@/components/seo/structured-data"

const inter = Inter({ subsets: ["latin"] })

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://easemysalon.com'

export const metadata: Metadata = {
  title: {
    default: "EaseMySalon - India's #1 Salon Management Software",
    template: "%s | EaseMySalon"
  },
  description: "Reduce no-shows by 40%, cut billing time by 70%, and increase revenue by 35%. India's leading salon POS, CRM, appointments, inventory & analytics platform. 14-day free trial, no credit card required.",
  keywords: [
    "salon management software",
    "salon POS system",
    "salon CRM software",
    "salon appointment booking software",
    "salon inventory management",
    "salon billing software",
    "salon software India",
    "beauty salon software",
    "spa management software",
    "salon analytics software",
    "salon staff management",
    "salon commission tracking",
    "GST billing for salons",
    "salon receipt software",
    "salon cash registry",
    "salon client management",
    "salon reports and analytics",
    "multi-location salon software",
    "salon franchise management",
    "salon POS India",
    "best salon management software India",
    "salon software with WhatsApp integration",
    "cloud-based salon management system",
    "salon software free trial",
    "reduce salon no-shows software",
    "salon inventory tracking software",
    "salon appointment reminder system",
    "salon staff payroll software",
    "salon revenue management software",
    "salon software for multiple branches",
    "salon software Mumbai",
    "salon software Delhi",
    "salon software Bangalore",
    "salon software Pune",
    "salon software Hyderabad",
    "salon software Chennai",
    "salon software Kolkata",
    "salon POS with GST",
    "WhatsApp salon booking",
    "salon inventory expiry alerts",
    "salon commission calculator",
    "salon cash drawer management",
    "salon membership management",
    "salon package management",
    "salon loyalty program software",
    "affordable salon software",
    "salon management system",
    "salon booking system",
    "salon ERP software",
    "salon management app",
    "salon POS software",
    "salon CRM system",
    "salon business software",
    "salon operations software",
    "salon management platform",
    "salon software solution",
    "digital salon management",
    "automated salon software",
    "salon management tools"
  ],
  authors: [{ name: "EaseMySalon" }],
  creator: "EaseMySalon",
  publisher: "EaseMySalon",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: '/',
    siteName: 'EaseMySalon',
    title: "EaseMySalon - India's #1 Salon Management Software",
    description: "Reduce no-shows by 40%, cut billing time by 70%, and increase revenue by 35%. Complete salon POS, CRM, appointments & analytics platform. 14-day free trial.",
    images: [
      {
        url: '/images/dashboard.png',
        width: 1200,
        height: 630,
        alt: 'EaseMySalon - Salon Management Software Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "EaseMySalon - India's #1 Salon Management Software",
    description: "Reduce no-shows by 40%, cut billing time by 70%, and increase revenue by 35%. Complete salon POS, CRM, appointments & analytics.",
    images: ['/images/dashboard.png'],
    creator: '@easemysalon',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Add verification codes when available
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
    // bing: 'your-bing-verification-code',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <OrganizationSchema />
        <SoftwareApplicationSchema />
        <AuthProvider>
          <AdminAuthProvider>
            {children}
            <Toaster />
            <CookieConsentBanner />
          </AdminAuthProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
