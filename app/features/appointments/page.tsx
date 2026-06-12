import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "Salon Appointment & Booking Software | EaseMySalon",
  description:
    "Salon appointment booking software with WhatsApp reminders, waitlists, and staff calendars. Cut no-shows by 40% for Indian salons.",
  alternates: { canonical: "/features/appointments" },
}

export default function AppointmentsFeaturePage() {
  return (
    <FeatureLandingPage
      slug="appointments"
      eyebrow="EaseMySalon · Appointment booking"
      h1="Salon Appointment & Booking Software"
      intro="Fill chairs reliably with smart scheduling, automated WhatsApp reminders, and waitlists — designed for Indian salon operations."
      sections={[
        {
          heading: "The real cost of no-shows in Indian salons",
          paragraphs: [
            "An empty chair at 4 PM on a Saturday costs real money — especially in high-rent areas of Mumbai, Delhi, and Bangalore. Manual reminder calls don't scale, and clients forget bookings made weeks ago on WhatsApp.",
            "EaseMySalon appointment software sends automated reminders via WhatsApp before each visit. Salons using our reminder cadence report up to 40% fewer no-shows within the first 90 days.",
          ],
        },
        {
          heading: "Calendar built for salon workflows",
          paragraphs: [
            "Assign stylists, rooms, and equipment per booking. Block lunch breaks and maintenance windows. View day, week, and staff-level calendars from any device — desktop at reception or phone on the salon floor.",
            "Walk-ins slot in alongside pre-booked appointments without double-booking. Colour-coded status shows confirmed, in-progress, completed, and no-show at a glance.",
          ],
        },
        {
          heading: "Waitlists and last-minute fill-ins",
          paragraphs: [
            "When a client cancels, move waitlisted clients up automatically or notify them via WhatsApp. Turn cancelled slots into revenue instead of dead time. Peak-hour salons in Bengaluru and Pune use waitlists to keep utilisation above 85%.",
            "Online booking links let clients self-schedule within rules you set — minimum notice, deposit requirements, and service duration per stylist.",
          ],
        },
        {
          heading: "Connected to billing and CRM",
          paragraphs: [
            "Completed appointments flow straight into billing with services and products pre-loaded. Client history shows past visits, preferences, and spend — so stylists deliver personalised service every time.",
            "Appointment data feeds your analytics dashboard: utilisation by stylist, peak hours, and cancellation patterns. Start free for 7 days; plans from ₹199/month per outlet.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/features/whatsapp-marketing", label: "WhatsApp marketing & reminders for salons" },
        { href: "/features/billing", label: "Salon billing & GST invoice software" },
      ]}
    />
  )
}
