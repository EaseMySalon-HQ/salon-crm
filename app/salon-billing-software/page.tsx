import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "Salon Billing Software | Fast GST Billing & POS",
  description:
    "Create GST invoices, accept payments and manage daily sales with easy-to-use salon billing software.",
  keywords: [
    "salon billing software",
    "salon POS software",
    "salon GST billing",
    "salon invoice software",
    "salon point of sale India",
    "salon billing app",
  ],
  alternates: { canonical: "/salon-billing-software" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/salon-billing-software",
    siteName: "EaseMySalon",
    title: "Salon Billing Software | Fast GST Billing & POS",
    description:
      "Create GST invoices, accept payments and manage daily sales with easy-to-use salon billing software.",
    images: [
      {
        url: "/images/dashboard.png",
        width: 1200,
        height: 630,
        alt: "EaseMySalon salon billing software",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon Billing Software | Fast GST Billing & POS",
    description:
      "Create GST invoices, accept payments and manage daily sales with easy-to-use salon billing software.",
    images: ["/images/dashboard.png"],
  },
}

export default function SalonBillingSoftwarePage() {
  return (
    <FeatureLandingPage
      slug="salon-billing-software"
      eyebrow="EaseMySalon · Salon billing software"
      h1="Fast and Accurate Salon Billing"
      intro="Generate GST-compliant invoices in seconds, accept UPI, cards and cash, and close every day with clean, reconciled sales — all from one screen."
      breadcrumbs={[
        { name: "Home", url: "/" },
        { name: "Salon Billing Software", url: "/salon-billing-software" },
      ]}
      benefits={[
        "Issue GST-ready bills in under 30 seconds at the front desk",
        "Accept UPI, cards, cash and wallets in a single split-payment flow",
        "Auto-apply membership, package and loyalty redemptions",
        "Send WhatsApp receipts so clients never lose proof of purchase",
        "Daily, weekly and monthly sales reports without spreadsheets",
        "Branch-wise GST returns export for your CA",
      ]}
      sections={[
        {
          heading: "Why Indian salons need dedicated billing software",
          paragraphs: [
            "A regular retail POS is built for shops that sell SKUs. A salon is different. You sell services tied to a stylist, products tied to a brand, memberships that deduct credit, and packages that expire. Every bill mixes these in ways a generic till cannot handle without spreadsheet workarounds.",
            "EaseMySalon billing software is built for salons in India from the ground up. It understands services, stylists, retail, packages, memberships, loyalty, GST slabs and split payments — so your reception staff bills correctly the first time, every time.",
            "Whether you run a single boutique salon in Indore or a 12-branch chain across Mumbai, Delhi and Bangalore, fast billing is the difference between a smooth Saturday and a queue that walks away.",
          ],
        },
        {
          heading: "GST billing without the headache",
          paragraphs: [
            "Configure GST rates per service and product category once. Every invoice picks the right HSN/SAC code, applies CGST/SGST or IGST correctly, and prints a clean tax invoice that auditors and CAs accept.",
            "Capture customer GSTIN when needed for corporate clients. Export GSTR-1 ready data at month-end without manual re-entry. Salons on the Pro plan can sync data to Tally and accounting tools.",
            "If you bill some services at 5% and others at 18%, the system applies the right rate automatically based on category — so receptionists never have to remember tax math during a busy hour.",
          ],
        },
        {
          heading: "Split payments, memberships and packages in one bill",
          paragraphs: [
            "A real-world bill at an Indian salon often looks like this: ₹1,800 for hair colour + ₹650 for a treatment + ₹400 in product retail, paid as ₹2,000 UPI + ₹500 redeemed from a package + ₹350 cash. EaseMySalon handles that in one screen with no manual maths.",
            "Memberships, prepaid wallets, loyalty points and packages all redeem in the same flow. Discounts, taxes and stylist commissions update live as you build the bill. The total is always right — and so is the staff payout at month-end.",
          ],
        },
        {
          heading: "Digital receipts and faster client trust",
          paragraphs: [
            "Send the receipt instantly over WhatsApp or email with your salon branding. Clients increasingly expect digital proof, especially when they need a GST invoice for office reimbursement.",
            "Branded receipts double as marketing: they reinforce your salon's professionalism, list the next recommended service, and make rebooking one tap away.",
          ],
        },
        {
          heading: "Built to run on any device in your salon",
          paragraphs: [
            "EaseMySalon billing runs in the browser. Use it on a Windows reception PC, a Mac, an iPad at the styling chair, or an Android phone during peak hours. No expensive hardware, no installation, no IT team needed.",
            "Start free for 7 days. Plans begin at an affordable monthly price per outlet (GST exclusive). Switch on automated WhatsApp receipts, daily sales summaries and staff payouts from day one.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/appointment-management", label: "Learn About Appointment Management" },
        { href: "/salon-crm", label: "Explore Salon CRM Software" },
        { href: "/inventory-management", label: "See Inventory Management Tools" },
        { href: "/whatsapp-marketing", label: "Discover WhatsApp Marketing for Salons" },
      ]}
    />
  )
}
