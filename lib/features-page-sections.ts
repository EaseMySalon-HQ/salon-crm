import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  MapPin,
  Package,
  Plug,
  Receipt,
  Users,
  Wallet,
} from "lucide-react"

export type FeaturePageSection = {
  id: string
  /** Short label for tabs / mobile chips */
  shortLabel: string
  title: string
  description: string
  bullets: string[]
  icon: LucideIcon
}

/** Mirrors pricing matrix groupings (v2026.04). */
export const FEATURE_PAGE_SECTIONS: FeaturePageSection[] = [
  {
    id: "dashboard",
    shortLabel: "Dashboard",
    title: "Dashboard & analytics",
    icon: LayoutDashboard,
    description:
      "Start with a fixed KPI dashboard on every tier; unlock customizable layouts and deep analytics as you move up. Revenue, services, staff, and retention — without exporting to spreadsheets.",
    bullets: [
      "Essential KPIs on Starter; customizable widgets on Professional",
      "Sales & revenue charts; filters and period comparisons on Growth+",
      "Drill-down trends, bestsellers, and staff productivity on Professional",
      "Client retention, repeat visits, and frequency insights where your plan includes them",
    ],
  },
  {
    id: "appointments",
    shortLabel: "Appointments",
    title: "Appointment management",
    icon: CalendarDays,
    description:
      "Colour-coded calendars, drag-and-drop rescheduling, and views that match how Indian salons actually run the floor — from single-chair studios to busy multi-stylist days.",
    bullets: [
      "Staff scheduling, internal notes, and 12h / 24h time formats",
      "Day and week views, availability, and break management on Growth+",
      "Automated reminders and recurring appointments with alerts",
      "SMS and email notifications for clients and staff where included in your plan",
    ],
  },
  {
    id: "billing",
    shortLabel: "Billing & GST",
    title: "Billing, POS & GST",
    icon: Receipt,
    description:
      "Unlimited invoices, multiple payment methods, discounts at line or bill level, and inclusive or exclusive tax — built for compliant, fast checkout.",
    bullets: [
      "Edit pricing at checkout, partial payments, and outstanding balances on higher tiers",
      "Digital invoice delivery over SMS, email, and WhatsApp where enabled",
      "Thermal and A4 formats, logo and signature, tips and invoice notes",
      "Controls for edits, deletes, and custom invoice prefixes on Professional",
    ],
  },
  {
    id: "clients",
    shortLabel: "Clients",
    title: "Client management & engagement",
    icon: Users,
    description:
      "Full client history, preferences, allergies, and notes — plus feedback after services and targeted outreach when your plan supports it.",
    bullets: [
      "Visit history, exports, and discovery tracking (e.g. how clients found you)",
      "Instant feedback collection and shareable feedback links",
      "Privacy options such as masking phone numbers on supported tiers",
      "Promotional campaigns with filters on Professional",
    ],
  },
  {
    id: "memberships",
    shortLabel: "Memberships",
    title: "Memberships, packages & commission",
    icon: Package,
    description:
      "Turn one-off visits into predictable revenue with memberships and multi-session packages — and align pay with performance using commission and incentive engines.",
    bullets: [
      "Membership programs for services and products",
      "Bundles, multi-session packages, and flexible redemption",
      "Commission rules for services, products, and targets (Professional)",
      "Target-based and multi-tier incentive models on Professional",
    ],
  },
  {
    id: "inventory",
    shortLabel: "Inventory",
    title: "Inventory, usage & expenses",
    icon: BarChart3,
    description:
      "Retail stock, barcode selling, audits, and — where included — product consumption tied to services so costing stays honest.",
    bullets: [
      "Categories, stock history, low-stock alerts, and supply workflows",
      "Inter-outlet or warehouse transfers on Growth+",
      "Product usage in services with history and auto-consumption on Professional",
      "Internal expenses and petty cash wallet tracking",
    ],
  },
  {
    id: "staff",
    shortLabel: "Staff & leads",
    title: "Leads, staff & attendance",
    icon: MapPin,
    description:
      "Capture leads with follow-ups, run shifts and leave cleanly, and give staff the right access — from a single branch to a chain.",
    bullets: [
      "Lead capture, status-based follow-ups, and activity history (Growth+)",
      "Recurring work hours, block times, shift schedules, and leave recording",
      "Staff logins, performance summaries, and multi-location access by plan",
      "Complete staff profiles and role-appropriate permissions",
    ],
  },
  {
    id: "cash",
    shortLabel: "Cash & outlets",
    title: "Cash register & multi-location",
    icon: Wallet,
    description:
      "Daily cash continuity, denomination tracking where available, and consolidated visibility when you operate more than one outlet.",
    bullets: [
      "Daily cash ledger and balance summaries",
      "Cash by denomination on Growth+",
      "Per-location reporting and centralized dashboards on Growth+",
      "Consolidated reporting across outlets on Professional",
    ],
  },
  {
    id: "reports",
    shortLabel: "Reports & more",
    title: "Reports, integrations & platform",
    icon: Plug,
    description:
      "Sales, appointment, service, and tax reports — plus payment, accounting, and messaging integrations as add-ons or included where noted. Every tier ships with serious platform guarantees.",
    bullets: [
      "Reports for all modules included in your subscription tier",
      "Payment gateways (e.g. Razorpay, Stripe, Juspay) and accounting tools as add-ons",
      "WhatsApp Business and SMS gateways — availability and pricing per your agreement",
      "99.99% uptime SLA, no data selling, free setup, training, and data migration on all plans",
    ],
  },
]
