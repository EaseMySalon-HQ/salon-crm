import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Salon Software Pricing | Affordable Plans Starting ₹999/month",
  description: "Transparent salon management software pricing. Starter plan ₹999/month, Professional ₹2,499/month, Enterprise custom pricing. 14-day free trial, no credit card required. Switch plans anytime.",
  keywords: [
    "salon software pricing",
    "salon management software cost",
    "affordable salon software",
    "salon software price",
    "salon POS pricing",
    "salon CRM pricing",
    "salon software subscription",
    "salon software plans",
    "salon software pricing India",
    "best value salon software",
    "salon software free trial",
    "salon software monthly cost",
    "salon software annual pricing",
    "cheap salon management software",
    "salon software pricing comparison"
  ],
  openGraph: {
    title: "Salon Software Pricing | EaseMySalon",
    description: "Transparent pricing starting at ₹999/month. 14-day free trial, no credit card required. Perfect for salons of all sizes.",
  },
  alternates: {
    canonical: '/pricing',
  },
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
