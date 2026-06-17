import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "Salon Billing & GST Invoice Software for Indian Salons",
  description:
    "GST-ready salon billing software for India. Fast checkout, split payments, memberships, UPI, and compliant invoices for salons in Mumbai, Delhi, Bangalore, and beyond.",
  alternates: { canonical: "/features/billing" },
}

export default function BillingFeaturePage() {
  return (
    <FeatureLandingPage
      slug="billing"
      eyebrow="EaseMySalon · Salon billing for India"
      h1="Salon Billing & GST Invoice Software for Indian Salons"
      intro="Issue GST-compliant invoices in under 30 seconds. Accept cash, UPI, cards, and split payments — built for how Indian salons actually bill."
      sections={[
        {
          heading: "Why Indian salons need dedicated billing software",
          paragraphs: [
            "Generic retail POS systems miss salon-specific workflows: service + product combos, stylist attribution, membership redemptions, and package deductions. EaseMySalon billing is built for beauty and wellness outlets across India — from single-chair parlours in Pune to multi-stylist studios in Hyderabad.",
            "Every bill captures GST details correctly, prints or WhatsApps a branded receipt, and syncs revenue to your dashboard in real time. No more end-of-day Excel reconciliation or mismatched cash drawer totals.",
          ],
        },
        {
          heading: "GST-compliant invoicing without the headache",
          paragraphs: [
            "Configure GST rates per service and product category. EaseMySalon generates tax invoices with HSN/SAC codes, customer GSTIN when needed, and itemised breakdowns auditors expect. Whether you bill at 5% or 18% depending on service type, the system applies the right rate automatically.",
            "Export billing data for your CA at month-end, or connect to Tally on the Pro plan. Salons in Chennai, Kolkata, and Ahmedabad use EaseMySalon to stay compliant without slowing down the front desk.",
          ],
        },
        {
          heading: "Split payments, memberships, and packages",
          paragraphs: [
            "Clients rarely pay one way. Split a ₹2,400 bill across UPI and cash. Redeem loyalty points or prepaid package credits mid-checkout. Apply membership discounts without manual calculation. Staff commissions attach to each line item so payroll stays accurate.",
            "Walk-in queues stay moving because billing takes seconds, not minutes. Reception teams in Mumbai report cutting checkout time by 70% after switching from manual registers.",
          ],
        },
        {
          heading: "Digital receipts and client trust",
          paragraphs: [
            "Send receipts via WhatsApp or email instantly. Clients in India increasingly expect digital proof of payment — especially for GST claims and expense reimbursements. Branded receipts reinforce professionalism and make rebooking easier.",
            "Start with a 7-day free trial on any plan. Starter is ₹199/month per outlet (GST exclusive). See full pricing or book a demo to watch billing live.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/features/appointments", label: "Salon appointment & booking software" },
        { href: "/features/whatsapp-marketing", label: "WhatsApp marketing for salons" },
      ]}
    />
  )
}
