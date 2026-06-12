import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "WhatsApp Marketing for Salons – Campaigns & Reminders",
  description:
    "WhatsApp marketing for Indian salons: appointment reminders, broadcast campaigns, two-way inbox, and booking via WhatsApp. Included on Pro; add-on on Growth.",
  alternates: { canonical: "/features/whatsapp-marketing" },
}

export default function WhatsAppMarketingFeaturePage() {
  return (
    <FeatureLandingPage
      slug="whatsapp-marketing"
      eyebrow="EaseMySalon · WhatsApp for salons"
      h1="WhatsApp Marketing for Salons"
      intro="India's salons run on WhatsApp. EaseMySalon connects your official Business API for reminders, campaigns, and two-way client chat — from one dashboard."
      sections={[
        {
          heading: "Why WhatsApp is non-negotiable for Indian salons",
          paragraphs: [
            "Your clients already live on WhatsApp. They book, reschedule, ask for recommendations, and share photos — all in chat. Scattered personal-phone messages create chaos: missed bookings, no audit trail, and staff leaving with client relationships.",
            "EaseMySalon integrates Meta WhatsApp Business API (WABA) so your salon number sends approved templates, tracks delivery, and keeps conversations in a shared inbox. Pro includes full WABA; Growth can add it as an optional add-on.",
          ],
        },
        {
          heading: "Automated appointment reminders",
          paragraphs: [
            "Send confirmation and reminder templates before each visit. Reduce no-shows without reception making dozens of calls daily. Customise timing — 24 hours before, 2 hours before — per service type.",
            "Salons in Mumbai and Delhi report recovering ₹1–2.5 lakh monthly revenue after implementing WhatsApp reminder cadences. Reminders link back to your calendar so reschedules stay organised.",
          ],
        },
        {
          heading: "Broadcast campaigns that fill slow days",
          paragraphs: [
            "Promote Tuesday slots, new services, or festival offers to segmented client lists. Track open rates and click-through on campaigns. Birthday and anniversary offers run automatically — no manual list exports.",
            "Use compliant Meta-approved templates for marketing messages. Prepaid wallet billing keeps message costs predictable with per-message rates published upfront.",
          ],
        },
        {
          heading: "Two-way inbox and WhatsApp booking",
          paragraphs: [
            "Reply to client queries from the dashboard — assign conversations to staff, use quick replies, and never lose context when shifts change. Clients can book appointments directly via WhatsApp on Pro.",
            "WhatsApp marketing works best alongside appointment scheduling and GST billing in one platform. Explore appointment software and pricing, or book a demo to see WABA setup live.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/features/appointments", label: "Salon appointment & booking software" },
        { href: "/features/multi-branch", label: "Multi-branch salon management" },
      ]}
    />
  )
}
