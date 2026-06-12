import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "Salon Staff Management Software | EaseMySalon",
  description:
    "Manage staff attendance, schedules, commissions and performance from a single dashboard.",
  keywords: [
    "salon staff management software",
    "salon attendance software",
    "salon shift scheduling",
    "salon commission tracking",
    "stylist performance tracking",
    "salon HR software",
  ],
  alternates: { canonical: "/staff-management" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/staff-management",
    siteName: "EaseMySalon",
    title: "Salon Staff Management Software | EaseMySalon",
    description:
      "Manage staff attendance, schedules, commissions and performance from a single dashboard.",
    images: [
      { url: "/images/dashboard.png", width: 1200, height: 630, alt: "Salon staff management software" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon Staff Management Software | EaseMySalon",
    description:
      "Manage staff attendance, schedules, commissions and performance from a single dashboard.",
    images: ["/images/dashboard.png"],
  },
}

export default function StaffManagementPage() {
  return (
    <FeatureLandingPage
      slug="staff-management"
      eyebrow="EaseMySalon · Staff management"
      h1="Manage Your Team with Confidence"
      intro="Attendance, schedules, commissions, targets and performance — every tool your salon needs to run a happy, productive and accountable team in one place."
      breadcrumbs={[
        { name: "Home", url: "/" },
        { name: "Staff Management", url: "/staff-management" },
      ]}
      benefits={[
        "Mobile clock-in and clock-out with GPS check",
        "Weekly and monthly shift rosters in minutes",
        "Auto-calculated commissions on services and retail",
        "Stylist-wise targets and live progress dashboards",
        "Role-based permissions so staff only see what they should",
        "Leave, weekly off and overtime tracking",
      ]}
      sections={[
        {
          heading: "Why most salons struggle with staff management",
          paragraphs: [
            "Stylists are the engine of any salon. But most Indian salons still run staff data on WhatsApp groups, paper attendance registers and end-of-month commission spreadsheets that nobody fully trusts. Small mistakes create big problems — a missed commission line is enough to lose a top stylist.",
            "EaseMySalon's staff management software replaces all of that with a single, fair, transparent system. Stylists see their own attendance, commission, and target progress. Owners see the whole team from one screen.",
          ],
        },
        {
          heading: "Attendance and scheduling without paper",
          paragraphs: [
            "Staff clock in and out from a mobile app or the front-desk tablet. GPS verification (optional) confirms they're at the branch. Late marks, half-days and overtime calculate automatically based on shift rules you define.",
            "Build weekly rosters in minutes by copying last week's schedule and tweaking. Drag-and-drop assignments make adjusting for leaves and peak days fast. Staff get their shifts on WhatsApp, so no one shows up on the wrong day.",
          ],
        },
        {
          heading: "Commission engine built for Indian salons",
          paragraphs: [
            "Commission rules in real salons are messy: 10% on services, 5% on retail, 15% if a stylist hits their monthly target, plus a flat bonus for chemical services. EaseMySalon's commission engine handles all of these without spreadsheets.",
            "Commissions calculate live as each bill closes. Stylists see their running total in their app — a powerful motivator. Owners review and approve payouts at month-end with one click. Disputes drop to near-zero because every commission is traceable back to a specific bill.",
          ],
        },
        {
          heading: "Targets, performance and recognition",
          paragraphs: [
            "Set monthly targets per stylist for revenue, retail attach, repeat clients or new clients. The dashboard shows who is on track and who needs help — early in the month, when there's still time to act.",
            "Compare stylist performance fairly across services and chairs. Run \"stylist of the month\" programs based on real numbers, not gut feel. Salons report up to 25% growth in stylist productivity within 6 months of switching to performance-led management.",
          ],
        },
        {
          heading: "Permissions, payroll and growth-ready foundations",
          paragraphs: [
            "Role-based permissions keep payroll data private. Receptionists can see schedules but not salaries. Area managers can see all branches they own. Stylists see only their own numbers.",
            "When you're ready to expand to a second or third branch, your staff workflows scale with you. EaseMySalon staff management is included in the Growth and Pro plans, with payroll automation as a natural next step.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/payroll-management", label: "Explore Salon Payroll Management" },
        { href: "/reports-analytics", label: "View Salon Reports & Analytics" },
        { href: "/salon-billing-software", label: "Discover Salon Billing Features" },
        { href: "/appointment-management", label: "Learn About Appointment Management" },
      ]}
    />
  )
}
