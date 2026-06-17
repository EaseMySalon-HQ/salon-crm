import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "Salon Inventory Management Software | EaseMySalon",
  description:
    "Track stock, reduce wastage and stay informed with real-time inventory management for salons.",
  keywords: [
    "salon inventory management software",
    "salon stock management",
    "salon product tracking",
    "salon inventory app",
    "salon retail tracking",
    "salon stock alerts",
  ],
  alternates: { canonical: "/inventory-management" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/inventory-management",
    siteName: "EaseMySalon",
    title: "Salon Inventory Management Software | EaseMySalon",
    description:
      "Track stock, reduce wastage and stay informed with real-time inventory management for salons.",
    images: [
      { url: "/images/dashboard.png", width: 1200, height: 630, alt: "Salon inventory management software" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon Inventory Management Software | EaseMySalon",
    description:
      "Track stock, reduce wastage and stay informed with real-time inventory management for salons.",
    images: ["/images/dashboard.png"],
  },
}

export default function InventoryManagementPage() {
  return (
    <FeatureLandingPage
      slug="inventory-management"
      eyebrow="EaseMySalon · Inventory management"
      h1="Never Run Out of Stock Again"
      intro="Real-time visibility into every bottle, every brush and every retail SKU across every branch — with expiry alerts, purchase orders and transfer tracking built in."
      breadcrumbs={[
        { name: "Home", url: "/" },
        { name: "Inventory Management", url: "/inventory-management" },
      ]}
      benefits={[
        "Live stock view across branches and storerooms",
        "Low-stock and expiry alerts on WhatsApp",
        "One-click purchase orders to vendors",
        "Branch-to-branch transfers with audit trail",
        "Auto-deduct product usage from service bills",
        "Reduce wastage and pilferage with daily counts",
      ]}
      sections={[
        {
          heading: "Why salon inventory is harder than retail inventory",
          paragraphs: [
            "Salons consume products as part of services — 30 ml of colour here, 50 ml of shampoo there. Unlike a retail store where every unit leaves with a customer, salons \"use\" stock invisibly all day. Without proper tracking, ₹20,000 of inventory can vanish each month into untracked consumption, expiry and shrinkage.",
            "EaseMySalon's inventory management software tracks every bottle, tube and tool. Service recipes link product usage to each service, so a hair colour automatically deducts the right amount from stock when the bill is closed.",
          ],
        },
        {
          heading: "Live stock visibility across every branch",
          paragraphs: [
            "Owners running 2+ outlets struggle to answer a simple question: \"Do we have this product in stock anywhere?\" EaseMySalon answers it in one screen. See live counts per branch, per storeroom, per SKU — refreshed in real time.",
            "Low-stock thresholds trigger WhatsApp alerts to the store-in-charge automatically. No more calling around to check who has L'Oréal 7.4 — your dashboard already knows.",
          ],
        },
        {
          heading: "Expiry, batch and purchase order management",
          paragraphs: [
            "Many salon products have a shelf life. EaseMySalon tracks batch numbers and expiry dates, surfacing items 30 days before they expire so you can use them in promotions or transfer them to a busier branch.",
            "Create purchase orders for vendors directly from the dashboard. Track received quantities, partial deliveries and GST on inwards. Compare vendor prices over time to negotiate better rates.",
          ],
        },
        {
          heading: "Branch transfers, audits and shrinkage control",
          paragraphs: [
            "Move stock between branches with a digital challan. Each transfer is logged with who initiated it, who received it and the quantity at both ends — closing a major source of unexplained inventory loss.",
            "Run daily, weekly or monthly stock audits from a tablet. Variances are flagged automatically. Chains using EaseMySalon report wastage and shrinkage drops of up to 50% within 90 days of switching from manual registers.",
          ],
        },
        {
          heading: "Retail sales that increase your bottom line",
          paragraphs: [
            "Selling retail products at billing time is one of the highest-margin opportunities in a salon. EaseMySalon prompts stylists to recommend the right product based on the client's service, and tracks retail attach rate by stylist so you can coach the team and celebrate top sellers.",
            "Plans start affordably per outlet. Pair inventory management with billing, CRM and reports for the full operational stack.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/salon-billing-software", label: "Discover Salon Billing Features" },
        { href: "/reports-analytics", label: "View Salon Reports & Analytics" },
        { href: "/staff-management", label: "Explore Salon Staff Management" },
        { href: "/salon-crm", label: "Explore Salon CRM Software" },
      ]}
    />
  )
}
