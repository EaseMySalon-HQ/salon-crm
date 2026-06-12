import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "Salon Appointment Management Software | EaseMySalon",
  description:
    "Reduce no-shows, manage bookings and keep your calendar organized with smart appointment management software.",
  keywords: [
    "salon appointment management software",
    "salon appointment booking",
    "salon scheduling software",
    "salon calendar software",
    "reduce salon no-shows",
    "online salon booking India",
  ],
  alternates: { canonical: "/appointment-management" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/appointment-management",
    siteName: "EaseMySalon",
    title: "Salon Appointment Management Software | EaseMySalon",
    description:
      "Reduce no-shows, manage bookings and keep your calendar organized with smart appointment management software.",
    images: [
      { url: "/images/dashboard.png", width: 1200, height: 630, alt: "Salon appointment management software" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon Appointment Management Software | EaseMySalon",
    description:
      "Reduce no-shows, manage bookings and keep your calendar organized with smart appointment management software.",
    images: ["/images/dashboard.png"],
  },
}

export default function AppointmentManagementPage() {
  return (
    <FeatureLandingPage
      slug="appointment-management"
      eyebrow="EaseMySalon · Appointment management"
      h1="Appointment Management Made Easy"
      intro="A smart, conflict-free calendar with WhatsApp reminders, online booking, waitlists and rebook prompts — so your chairs stay full and your clients stay loyal."
      breadcrumbs={[
        { name: "Home", url: "/" },
        { name: "Appointment Management", url: "/appointment-management" },
      ]}
      benefits={[
        "Cut no-shows by up to 40% with WhatsApp reminders",
        "Online booking link clients can use 24/7",
        "Stylist-wise, branch-wise and service-wise calendars",
        "Waitlist auto-fills cancelled slots",
        "Block lunch, training and maintenance windows",
        "Sync confirmed bookings straight to billing and CRM",
      ]}
      sections={[
        {
          heading: "The real cost of no-shows in Indian salons",
          paragraphs: [
            "An empty chair at 5 PM on a Saturday in Bandra or Indiranagar isn't just a slow hour — it's lost revenue you cannot recover. Manual reminder calls don't scale, and clients forget bookings made days ago over WhatsApp.",
            "EaseMySalon's appointment management software sends automated reminders before every visit. Salons using our reminder cadence report up to 40% fewer no-shows within the first 90 days. That alone can pay for the software many times over.",
          ],
        },
        {
          heading: "A salon calendar that actually understands salons",
          paragraphs: [
            "Generic calendar apps don't know that a hair colour needs the stylist for 90 minutes but the wash station only for 20. EaseMySalon does. Assign stylists, rooms, equipment and even shampoo stations per booking so two services never collide.",
            "View the schedule by day, week, stylist, branch or service. Drag-and-drop reschedules update everything — billing, CRM, and the client's WhatsApp confirmation — in one move.",
          ],
        },
        {
          heading: "Online booking that fills slow days",
          paragraphs: [
            "Share a booking link on Instagram, Google Business, your website or WhatsApp status. Clients pick a service, stylist and slot 24/7 — no phone calls needed. Set buffers, minimum notice and deposit rules per service so online bookings work for your salon, not against it.",
            "Walk-ins and online bookings live in the same calendar without double-bookings. Front-desk staff see exactly who is coming, who is overdue, and which slots can still be filled today.",
          ],
        },
        {
          heading: "Waitlists turn cancellations into revenue",
          paragraphs: [
            "When a client cancels last minute, EaseMySalon offers the slot to waitlisted clients automatically over WhatsApp. The first to confirm gets the chair. Salons in Bengaluru and Pune use waitlists to keep utilisation above 85% even on slow weekday afternoons.",
            "Recurring clients can be put on a smart rebook nudge — the system reminds them when they're due for their next colour or facial, with a one-tap WhatsApp confirmation.",
          ],
        },
        {
          heading: "Connected to billing, CRM and analytics",
          paragraphs: [
            "Once a booking is complete, the services and stylist are pre-loaded into the bill — no re-keying. The client's CRM profile updates with the visit, and your dashboards refresh with utilisation, peak hour and no-show data in real time.",
            "Plans start affordably per outlet. Start a 7-day free trial today and see how much revenue a tighter calendar can unlock.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/whatsapp-marketing", label: "Discover WhatsApp Marketing for Salons" },
        { href: "/salon-crm", label: "Explore Salon CRM Software" },
        { href: "/salon-billing-software", label: "Discover Salon Billing Features" },
        { href: "/staff-management", label: "Explore Salon Staff Management" },
      ]}
    />
  )
}
