import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { AuthProvider } from "@/lib/auth-context"
import { AdminAuthProvider } from "@/lib/admin-auth-context"
import { QueryProvider } from "@/components/providers/query-provider"
import { CookieConsentBanner } from "@/components/gdpr/cookie-consent-banner"
const inter = Inter({ subsets: ["latin"] })

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.easemysalon.in"
const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID

export const metadata: Metadata = {
  title: {
    default: "Salon Management Software | Grow Your Salon with EaseMySalon",
    template: "%s",
  },
  description:
    "Manage appointments, billing, CRM, staff, inventory and marketing from one platform. Start growing your salon with EaseMySalon today.",
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
  icons: {
    icon: [{ url: "/images/monogram-circle-color-transparent.png", type: "image/png" }],
    apple: "/images/monogram-circle-color-transparent.png",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "EaseMySalon",
    title: "Salon Management Software | Grow Your Salon with EaseMySalon",
    description:
      "Manage appointments, billing, CRM, staff, inventory and marketing from one platform. Start growing your salon with EaseMySalon today.",
    images: [
      {
        url: "/images/dashboard.png",
        width: 1200,
        height: 630,
        alt: "EaseMySalon - Salon Management Software Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon Management Software | Grow Your Salon with EaseMySalon",
    description:
      "Manage appointments, billing, CRM, staff, inventory and marketing from one platform. Start growing your salon with EaseMySalon today.",
    images: ["/images/dashboard.png"],
    creator: "@easemysalon",
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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'AW-18203026415');
              (function () {
                var script = document.createElement('script');
                script.async = true;
                script.src = 'https://www.googletagmanager.com/gtag/js?id=AW-18203026415';
                document.head.appendChild(script);
              })();
            `,
          }}
        />
        {metaPixelId ? (
          <>
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  !function(f,b,e,v,n,t,s)
                  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                  n.queue=[];t=b.createElement(e);t.async=!0;
                  t.src=v;s=b.getElementsByTagName(e)[0];
                  s.parentNode.insertBefore(t,s)}(window, document,'script',
                  'https://connect.facebook.net/en_US/fbevents.js');
                  fbq('init', '${metaPixelId}');
                  fbq('track', 'PageView');
                `,
              }}
            />
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                height="1"
                width="1"
                style={{ display: "none" }}
                alt=""
                src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
              />
            </noscript>
          </>
        ) : null}
      </head>
      <body className={inter.className}>
        <AuthProvider>
          <QueryProvider>
          <AdminAuthProvider>
            {children}
            <Toaster />
            <CookieConsentBanner />
          </AdminAuthProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
