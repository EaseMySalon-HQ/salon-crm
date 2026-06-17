import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "Multi-Branch Salon Management Software",
  description:
    "Manage multiple salon branches from one login. Branch-level staff, services, pricing, inventory, and centralized reporting for Indian salon chains.",
  alternates: { canonical: "/features/multi-branch" },
}

export default function MultiBranchFeaturePage() {
  return (
    <FeatureLandingPage
      slug="multi-branch"
      eyebrow="EaseMySalon · Multi-outlet management"
      h1="Multi-Branch Salon Management Software"
      intro="Scale from one outlet to a chain without losing control. Branch-level operations, owner-level visibility — built for Indian salon networks."
      sections={[
        {
          heading: "One login, every branch",
          paragraphs: [
            "Salon owners expanding to second and third locations face a familiar problem: spreadsheets per outlet, inconsistent pricing, and no single view of business health. EaseMySalon multi-branch management lets owners switch between outlets instantly while staff see only their branch.",
            "Configure services, pricing, and staff per location. A haircut may be ₹400 in your Indiranagar branch and ₹550 in Koramangala — each outlet keeps local pricing while headquarters sees consolidated numbers.",
          ],
        },
        {
          heading: "Centralized reporting for chains and franchises",
          paragraphs: [
            "Compare revenue, utilisation, and retail attach rates across Mumbai, Delhi, Bangalore, or any city. Identify top-performing stylists and underperforming locations with branch-wise dashboards. Export data for franchise reviews or investor updates.",
            "Pro includes advanced analytics and custom reports. Inventory transfers between branches track stock movement — no more phone calls asking \"do you have this colour?\"",
          ],
        },
        {
          heading: "Staff and permissions by branch",
          paragraphs: [
            "Receptionists in Branch A cannot see Branch B payroll. Area managers get read access across assigned outlets. Owners retain full control. Role-based permissions scale as your team grows from 5 to 50+ staff.",
            "Commission rules can differ per branch — percentage on services, tiered targets, or product upsell bonuses — all calculated automatically at billing.",
          ],
        },
        {
          heading: "Built for Indian salon chains",
          paragraphs: [
            "Whether you run 2 neighbourhood parlours or 6+ premium spas, EaseMySalon pricing is per outlet (from ₹199/month on Starter, ₹999/month on Pro with WhatsApp included). Volume discounts available for larger rollouts.",
            "Free data migration and onboarding per branch get new locations live within 48 hours. Pair multi-branch management with WhatsApp marketing and appointment booking for a complete growth stack.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/features/billing", label: "Salon billing & GST invoice software" },
        { href: "/features/whatsapp-marketing", label: "WhatsApp marketing for salons" },
      ]}
    />
  )
}
