/**
 * Pricing & feature matrix aligned with EaseMySalon Pricing & Feature Matrix · v2026.04
 * (per-outlet, GST exclusive). Used by the public /pricing page.
 */

export type PlanTier = "starter" | "growth" | "professional"

export type FeatureCell = "yes" | "no" | "addon" | "free"

export interface PricingPlan {
  id: PlanTier
  name: string
  tagline: string
  monthlyInr: number
  annualInr: number
  /** Annual vs paying monthly × 12 */
  annualSavingsInr: number
  popular?: boolean
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Essentials for a single outlet",
    monthlyInr: 899,
    annualInr: 9588,
    annualSavingsInr: 1200,
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For salons scaling operations",
    monthlyInr: 2099,
    annualInr: 19788,
    annualSavingsInr: 5400,
    popular: true,
  },
  {
    id: "professional",
    name: "Professional",
    tagline: "Full power for multi-outlet chains",
    monthlyInr: 3999,
    annualInr: 35988,
    annualSavingsInr: 12000,
  },
]

export interface FeatureRow {
  feature: string
  starter: FeatureCell
  growth: FeatureCell
  professional: FeatureCell
}

export interface FeatureCategory {
  title: string
  rows: FeatureRow[]
}

/** Legend: yes = in tier, no = not included, addon = paid add-on, free = complimentary */
export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    title: "Dashboard",
    rows: [
      {
        feature: "Fixed dashboard with essential KPIs",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Customizable dashboard (widgets, layout)",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
    ],
  },
  {
    title: "Analytics",
    rows: [
      {
        feature: "Basic sales & revenue dashboards",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Advanced revenue dashboards & comparisons",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Service & product performance trends",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Deep trends, drill-down & decline alerts",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
      {
        feature: "Staff performance analytics",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
      {
        feature: "Client retention, LTV & frequency",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
    ],
  },
  {
    title: "Appointment management",
    rows: [
      {
        feature: "Schedule appointments & staff",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Color-coded slots & drag-and-drop",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Day / week views & staff availability",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Recurring appointments & automated reminders",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "SMS / email notifications for bookings",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
    ],
  },
  {
    title: "Billing & invoicing",
    rows: [
      {
        feature: "Unlimited invoices & multiple payment methods",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Partial payments & outstanding balances",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Digital delivery (SMS, email, WhatsApp)",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Invoice edit restrictions & delete alerts",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
    ],
  },
  {
    title: "Client management & marketing",
    rows: [
      {
        feature: "Client history, preferences & notes",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Targeted offers & discovery tracking",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Hide client phone numbers (privacy)",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
      {
        feature: "Promotional campaigns with filters",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
    ],
  },
  {
    title: "Memberships, packages & commission",
    rows: [
      {
        feature: "Commission rules (service, product, targets)",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
      {
        feature: "Memberships & packages",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
      {
        feature: "Multi-session packages & flexible bundles",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
    ],
  },
  {
    title: "Inventory & operations",
    rows: [
      {
        feature: "Retail inventory, barcode & stock history",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Low-stock alerts & inter-outlet transfers",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Product usage in services & auto consumption",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
      {
        feature: "Expense tracking & petty cash",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Lead management (capture, follow-ups)",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
    ],
  },
  {
    title: "Staff, attendance & incentives",
    rows: [
      {
        feature: "Shifts, leave & recurring work hours",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Target & item-level incentives",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
      {
        feature: "Staff logins & multi-location access",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
    ],
  },
  {
    title: "Cash register & locations",
    rows: [
      {
        feature: "Daily cash ledger & summaries",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Cash by denomination",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Per-location data & centralized dashboards",
        starter: "no",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Consolidated reports across outlets",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
    ],
  },
  {
    title: "Reports, integrations & platform",
    rows: [
      {
        feature: "Sales, appointments, services & tax reports",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Payment & accounting integrations",
        starter: "addon",
        growth: "addon",
        professional: "addon",
      },
      {
        feature: "WhatsApp Business (setup + credits)",
        starter: "addon",
        growth: "addon",
        professional: "addon",
      },
      {
        feature: "Third-party SMS gateways",
        starter: "addon",
        growth: "addon",
        professional: "free",
      },
      {
        feature: "99.99% uptime SLA & no data sharing",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Free setup, training & data migration",
        starter: "yes",
        growth: "yes",
        professional: "yes",
      },
      {
        feature: "Premium support & dedicated account manager",
        starter: "no",
        growth: "no",
        professional: "yes",
      },
    ],
  },
]
