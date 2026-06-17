import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "Salon CRM Software | Build Better Client Relationships",
  description:
    "Track client visits, preferences and purchase history to improve retention and increase repeat business.",
  keywords: [
    "salon CRM software",
    "salon client management",
    "salon loyalty software",
    "salon retention software",
    "salon customer database",
    "salon membership software",
  ],
  alternates: { canonical: "/salon-crm" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/salon-crm",
    siteName: "EaseMySalon",
    title: "Salon CRM Software | Build Better Client Relationships",
    description:
      "Track client visits, preferences and purchase history to improve retention and increase repeat business.",
    images: [
      { url: "/images/dashboard.png", width: 1200, height: 630, alt: "EaseMySalon salon CRM software" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon CRM Software | Build Better Client Relationships",
    description:
      "Track client visits, preferences and purchase history to improve retention and increase repeat business.",
    images: ["/images/dashboard.png"],
  },
}

export default function SalonCrmPage() {
  return (
    <FeatureLandingPage
      slug="salon-crm"
      eyebrow="EaseMySalon · Salon CRM software"
      h1="Know Every Client Better"
      intro="Capture every visit, every preference and every spend so your team treats each client like a regular — and your retention rate keeps climbing month after month."
      breadcrumbs={[
        { name: "Home", url: "/" },
        { name: "Salon CRM", url: "/salon-crm" },
      ]}
      benefits={[
        "Single 360° profile per client with visits, services, preferences and spend",
        "Auto-segment clients into VIPs, regulars, at-risk and new",
        "Personalised offers via WhatsApp for birthdays and anniversaries",
        "Memberships, packages and loyalty points in one place",
        "Win-back campaigns for clients who haven't visited in 60+ days",
        "GDPR / DPDP friendly consent and data controls",
      ]}
      sections={[
        {
          heading: "Why salon CRM is the difference between busy and growing",
          paragraphs: [
            "Most Indian salons rely on memory and WhatsApp scrolls to remember a client's last service. That works at 50 clients. It fails at 500. The hidden cost is silent — a regular who quietly switches to a competitor because no one followed up after a colour service.",
            "A proper salon CRM captures every interaction automatically — bookings, services delivered, products bought, feedback given. Your stylist opens a client's profile and knows their last colour formula, allergies, preferred stylist and average ticket size before they even sit in the chair.",
          ],
        },
        {
          heading: "One 360° view of every client",
          paragraphs: [
            "EaseMySalon's salon CRM software unifies appointments, billing, packages, memberships, loyalty points and feedback into one client profile. No more flipping between tabs or WhatsApp threads.",
            "See total spend, average bill value, favourite services, last visit date, and the next predicted visit. The system flags clients who are due back, clients who haven't visited in a while, and high-value VIPs your team should never miss.",
          ],
        },
        {
          heading: "Smart segments that actually drive revenue",
          paragraphs: [
            "Instead of dumping every client into one list, EaseMySalon auto-builds segments: New (first 2 visits), Regular, VIP (top spenders), At-Risk (no visit in 45+ days), and Win-Back targets. Each segment can receive its own WhatsApp campaign or offer.",
            "A Mumbai salon owner using EaseMySalon reactivated 38% of her At-Risk segment in one quarter by sending a personalised WhatsApp message — that's pure incremental revenue from data she already had but couldn't act on before.",
          ],
        },
        {
          heading: "Memberships, packages and loyalty in one CRM",
          paragraphs: [
            "Sell prepaid memberships and packages directly from the CRM. Track exactly which credits a client has left, when they expire, and which stylist sold them. Apply loyalty points automatically at checkout.",
            "Birthday and anniversary offers run on autopilot — the system queues WhatsApp messages a week ahead, your front desk approves them in bulk, and clients walk in feeling remembered.",
          ],
        },
        {
          heading: "Privacy, consent and trust",
          paragraphs: [
            "Indian salons handle phone numbers, photos and personal preferences. EaseMySalon stores this data securely with role-based access — only authorised staff see full client records.",
            "Clients can opt out of marketing messages with one click. Consent is logged, exports are available on request, and the platform follows India's DPDP guidance so your salon stays on the right side of privacy rules.",
            "Start with a 7-day free trial. Pair the CRM with WhatsApp marketing and appointment management for a complete growth stack.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/whatsapp-marketing", label: "Discover WhatsApp Marketing for Salons" },
        { href: "/appointment-management", label: "Learn About Appointment Management" },
        { href: "/salon-billing-software", label: "Discover Salon Billing Features" },
        { href: "/reports-analytics", label: "View Salon Reports & Analytics" },
      ]}
    />
  )
}
