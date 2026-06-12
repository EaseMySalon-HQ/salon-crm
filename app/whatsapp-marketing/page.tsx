import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "WhatsApp Marketing for Salons | EaseMySalon",
  description:
    "Send promotions, reminders and personalized offers through WhatsApp to boost customer engagement.",
  keywords: [
    "WhatsApp marketing for salons",
    "salon WhatsApp campaigns",
    "salon WhatsApp reminders",
    "WhatsApp business API salons",
    "salon WhatsApp booking",
    "salon WhatsApp inbox",
  ],
  alternates: { canonical: "/whatsapp-marketing" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/whatsapp-marketing",
    siteName: "EaseMySalon",
    title: "WhatsApp Marketing for Salons | EaseMySalon",
    description:
      "Send promotions, reminders and personalized offers through WhatsApp to boost customer engagement.",
    images: [
      { url: "/images/dashboard.png", width: 1200, height: 630, alt: "WhatsApp marketing for salons" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WhatsApp Marketing for Salons | EaseMySalon",
    description:
      "Send promotions, reminders and personalized offers through WhatsApp to boost customer engagement.",
    images: ["/images/dashboard.png"],
  },
}

export default function WhatsappMarketingPage() {
  return (
    <FeatureLandingPage
      slug="whatsapp-marketing"
      eyebrow="EaseMySalon · WhatsApp marketing"
      h1="Grow Through WhatsApp Marketing"
      intro="Use the official WhatsApp Business API to send appointment reminders, run campaigns and chat with clients — all from one shared salon inbox."
      breadcrumbs={[
        { name: "Home", url: "/" },
        { name: "WhatsApp Marketing", url: "/whatsapp-marketing" },
      ]}
      benefits={[
        "Official WhatsApp Business API integration",
        "Automated appointment reminders cut no-shows by 40%",
        "Broadcast campaigns to targeted client segments",
        "Two-way shared inbox for the whole salon team",
        "WhatsApp booking links your clients already trust",
        "Compliant, opt-out friendly, Meta-approved templates",
      ]}
      sections={[
        {
          heading: "Why WhatsApp is non-negotiable for Indian salons",
          paragraphs: [
            "Your clients already live on WhatsApp. They book, reschedule, ask for product recommendations, and share inspiration photos — all in chat. The problem is that most of this happens on personal phone numbers, creating chaos: missed bookings, no audit trail, and the very real risk of a stylist leaving with the salon's client list.",
            "EaseMySalon plugs your salon into the official Meta WhatsApp Business API. Your salon number sends approved templates, receives replies, tracks delivery, and keeps every conversation in a shared dashboard the whole team can access.",
          ],
        },
        {
          heading: "Automated reminders that recover real revenue",
          paragraphs: [
            "Set up reminder cadences once: a confirmation immediately after booking, a nudge 24 hours before, and a final reminder 2 hours before. Each message picks the right approved template automatically.",
            "Salons in Mumbai, Delhi and Bangalore report recovering ₹1–2.5 lakh per month after switching on WhatsApp reminders. That's pure incremental revenue from chairs that would otherwise sit empty.",
          ],
        },
        {
          heading: "Campaigns that fill slow days, not inboxes",
          paragraphs: [
            "Promote Tuesday slots, festival packages, or a new colour service to segmented client lists from your CRM. Birthday and anniversary offers run automatically. Track open rates, click-throughs and bookings driven per campaign.",
            "Because EaseMySalon is connected to billing and the CRM, every campaign is targeted. You can send the new keratin offer only to clients who got a smoothening last quarter — not to every contact in your phone, which is how WhatsApp bans happen.",
          ],
        },
        {
          heading: "Shared inbox and WhatsApp booking",
          paragraphs: [
            "Replies land in a shared inbox in EaseMySalon. Assign conversations to specific staff, use quick replies for common questions, and never lose context when shifts change at the front desk.",
            "On the Pro plan, clients can book appointments through WhatsApp itself. They ask \"do you have a slot tomorrow?\" and a guided flow walks them through services and times — no phone calls, no app downloads.",
          ],
        },
        {
          heading: "Compliant, predictable and ready for scale",
          paragraphs: [
            "All marketing messages use Meta-approved templates so your number stays in good standing. Clients can opt out with one tap; their preference is logged automatically.",
            "Costs are predictable on a prepaid wallet model with per-message rates published upfront. Combine WhatsApp marketing with appointment management and CRM for India's most complete salon growth stack. Start with a free trial today.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/appointment-management", label: "Learn About Appointment Management" },
        { href: "/salon-crm", label: "Explore Salon CRM Software" },
        { href: "/reports-analytics", label: "View Salon Reports & Analytics" },
        { href: "/salon-billing-software", label: "Discover Salon Billing Features" },
      ]}
    />
  )
}
