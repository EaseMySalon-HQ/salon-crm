import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Salon Software Pricing in India – Plans from ₹199 | EaseMySalon",
  description:
    "EaseMySalon pricing: Starter ₹199/mo, Growth ₹699/mo, Pro ₹999/mo per outlet (GST exclusive). Annual plans save up to 2 months. 7-day free trial, free setup & migration, 99.99% uptime SLA.",
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
