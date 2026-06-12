import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "Salon Reports & Analytics Software | EaseMySalon",
  description:
    "Track revenue, staff performance, appointments and business growth with powerful salon reports.",
  keywords: [
    "salon reports software",
    "salon analytics software",
    "salon business intelligence",
    "salon revenue tracking",
    "salon KPI dashboard",
    "salon performance reports",
  ],
  alternates: { canonical: "/reports-analytics" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/reports-analytics",
    siteName: "EaseMySalon",
    title: "Salon Reports & Analytics Software | EaseMySalon",
    description:
      "Track revenue, staff performance, appointments and business growth with powerful salon reports.",
    images: [
      { url: "/images/dashboard.png", width: 1200, height: 630, alt: "Salon reports and analytics software" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon Reports & Analytics Software | EaseMySalon",
    description:
      "Track revenue, staff performance, appointments and business growth with powerful salon reports.",
    images: ["/images/dashboard.png"],
  },
}

export default function ReportsAnalyticsPage() {
  return (
    <FeatureLandingPage
      slug="reports-analytics"
      eyebrow="EaseMySalon · Reports & analytics"
      h1="Make Better Business Decisions"
      intro="Real-time dashboards covering revenue, staff productivity, client retention and inventory — so you stop guessing and start growing on data."
      breadcrumbs={[
        { name: "Home", url: "/" },
        { name: "Reports & Analytics", url: "/reports-analytics" },
      ]}
      benefits={[
        "Live revenue and bill count dashboards",
        "Stylist productivity and retail attach reports",
        "Client retention, repeat rate and lifetime value",
        "Appointment utilisation and no-show analytics",
        "Branch comparison reports for chains",
        "Export to Excel, PDF and accounting tools",
      ]}
      sections={[
        {
          heading: "Why salon reports are the missing link to growth",
          paragraphs: [
            "Most Indian salon owners can tell you yesterday's collections from memory. Far fewer can tell you their repeat rate, their retail attach percentage, or which stylist has the highest average ticket size. Without those numbers, growth is luck, not strategy.",
            "EaseMySalon turns every booking, bill and visit into clean, real-time reports. Owners log in each morning to a one-page snapshot of the business — and drill into the details only when they spot something worth investigating.",
          ],
        },
        {
          heading: "Revenue dashboards that update in real time",
          paragraphs: [
            "See today's revenue, services vs. retail split, average ticket size, total bills and payment-mode split (UPI, cash, cards, wallets) live. Compare against yesterday, last week or last month with a single click.",
            "Branch-level dashboards roll up into a chain-level view automatically. Multi-outlet owners in cities like Hyderabad and Pune use this to spot a branch that's slipping before it becomes a serious problem.",
          ],
        },
        {
          heading: "Staff performance you can actually trust",
          paragraphs: [
            "Track each stylist's revenue, bills, average ticket size, retail attach rate and client retention. Fair, transparent numbers turn performance reviews from arguments into conversations.",
            "See who's hitting their targets, who's slipping and who deserves recognition. The same data feeds straight into the commission and payroll engine, so stylists trust the numbers because the system uses the same ones to pay them.",
          ],
        },
        {
          heading: "Client retention, repeat rate and lifetime value",
          paragraphs: [
            "Retention is where most salons leak revenue. EaseMySalon shows your repeat rate over time, your average client visit frequency, and your top clients by lifetime value. You can finally answer the question: \"Are we keeping our clients or just churning new ones?\"",
            "Identify your most loyal segments and protect them with personalised offers. Identify your at-risk segments and win them back before they're gone.",
          ],
        },
        {
          heading: "Inventory, marketing and operational reports",
          paragraphs: [
            "Track stock movement, expiry risk, retail attach by stylist, and gross margin per product category. See which marketing campaigns drove bookings and which fizzled. Slice appointment utilisation by stylist, day of week and service to spot capacity gaps.",
            "Export anything to Excel or PDF in one click. Pro plans add deeper exports, custom report builders and accounting integrations. Plans start affordably per outlet with a 7-day free trial.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/salon-billing-software", label: "Discover Salon Billing Features" },
        { href: "/staff-management", label: "Explore Salon Staff Management" },
        { href: "/salon-crm", label: "Explore Salon CRM Software" },
        { href: "/inventory-management", label: "See Inventory Management Tools" },
      ]}
    />
  )
}
