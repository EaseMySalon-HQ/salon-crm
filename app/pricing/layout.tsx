import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Salon Software Pricing India | Starter, Growth & Professional | EaseMySalon",
  description:
    "EaseMySalon pricing April 2026: Starter from ₹899/mo, Growth ₹2,099/mo, Professional ₹3,999/mo per outlet (GST exclusive). Annual plans save up to ₹12,000. 99.99% uptime SLA, free setup & migration, 24/7 support.",
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
  openGraph: {
    title: "Salon Software Pricing | Starter, Growth, Professional | EaseMySalon",
    description:
      "Three tiers for Indian salons: Starter, Growth, Professional. Per-outlet pricing, GST exclusive. Free setup, migration & training.",
  },
  alternates: {
    canonical: "/pricing",
  },
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
