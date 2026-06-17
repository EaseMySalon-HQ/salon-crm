import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Salon Software Pricing | Affordable Plans for Every Salon",
  description:
    "Simple and transparent pricing for salons of all sizes. No hidden fees. Start with the plan that fits your business.",
  keywords: [
    "salon software pricing India",
    "salon management software cost",
    "EaseMySalon pricing",
    "salon POS subscription",
    "salon CRM pricing India",
    "GST exclusive salon software",
    "multi outlet salon software pricing",
    "salon software annual plan",
    "salon software free trial",
  ],
  alternates: {
    canonical: "/pricing",
  },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/pricing",
    siteName: "EaseMySalon",
    title: "Salon Software Pricing | Affordable Plans for Every Salon",
    description:
      "Simple and transparent pricing for salons of all sizes. No hidden fees. Start with the plan that fits your business.",
    images: [
      {
        url: "/images/dashboard.png",
        width: 1200,
        height: 630,
        alt: "EaseMySalon salon software pricing plans",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon Software Pricing | Affordable Plans for Every Salon",
    description:
      "Simple and transparent pricing for salons of all sizes. No hidden fees. Start with the plan that fits your business.",
    images: ["/images/dashboard.png"],
  },
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
