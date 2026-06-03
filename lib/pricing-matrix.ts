/**
 * Pricing & feature matrix for the public /pricing page.
 */

export type PlanTier = "starter" | "growth" | "pro"

/** yes | no | addon | soon, or a display string (e.g. "Unlimited", "Email") */
export type FeatureCell = "yes" | "no" | "addon" | "soon" | string

export type PlanFeatureState = "included" | "locked" | "addon"

export interface PlanFeatureItem {
  label: string
  state: PlanFeatureState
}

export interface PlanFeatureSection {
  title: string
  items: PlanFeatureItem[]
}

export interface PricingPlan {
  id: PlanTier
  name: string
  description: string
  monthlyInr: number
  annualInr: number
  /** Annual vs paying monthly × 12 */
  annualSavingsInr: number
  popular?: boolean
  ctaLabel: string
  ctaStyle: "primary-blue" | "neutral"
  featureSections: PlanFeatureSection[]
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Everything you need to run your salon smoothly — no credit card required.",
    monthlyInr: 199,
    annualInr: 1990,
    annualSavingsInr: 398,
    ctaLabel: "Start 7 Day Trial",
    ctaStyle: "neutral",
    featureSections: [
      {
        title: "Core operations",
        items: [
          { label: "Appointment booking & scheduling", state: "included" },
          { label: "GST billing & invoicing", state: "included" },
          { label: "Staff & attendance management", state: "included" },
          { label: "Basic client records (CRM)", state: "included" },
          { label: "Inventory tracking", state: "included" },
          { label: "Walk-in management", state: "included" },
          { label: "Basic reports & dashboard", state: "included" },
        ],
      },
      {
        title: "Growth tools",
        items: [
          { label: "Feedback management", state: "locked" },
          { label: "Loyalty & rewards", state: "locked" },
          { label: "WhatsApp (WABA) integration", state: "locked" },
          { label: "Incentive management", state: "locked" },
        ],
      },
    ],
  },
  {
    id: "growth",
    name: "Growth",
    description: "Win back clients and build lasting loyalty with automated feedback and rewards.",
    monthlyInr: 699,
    annualInr: 6990,
    annualSavingsInr: 1398,
    popular: true,
    ctaLabel: "Start 7 Day Trial",
    ctaStyle: "primary-blue",
    featureSections: [
      {
        title: "Everything in Starter, plus",
        items: [
          { label: "Post-visit feedback via SMS/WhatsApp", state: "included" },
          { label: "Feedback management settings", state: "included" },
          { label: "Negative review alerts (instant)", state: "included" },
          { label: "Google review nudge automation", state: "included" },
          { label: "NPS dashboard & staff scoring", state: "included" },
          { label: "Points & rewards engine", state: "included" },
          { label: "Membership Program", state: "included" },
          { label: "Referral program", state: "included" },
          { label: "Incentive management (commission profiles)", state: "included" },
        ],
      },
      {
        title: "Add-on available",
        items: [{ label: "WhatsApp (WABA) integration", state: "addon" }],
      },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "The full growth stack — loyalty, feedback, and WhatsApp automation in one plan.",
    monthlyInr: 999,
    annualInr: 9990,
    annualSavingsInr: 1998,
    ctaLabel: "Start 7 Day Trial",
    ctaStyle: "neutral",
    featureSections: [
      {
        title: "Everything in Growth, plus",
        items: [
          { label: "WABA — automated appointment reminders", state: "included" },
          { label: "Broadcast promotions to client list", state: "included" },
          { label: "Booking directly via WhatsApp", state: "included" },
          { label: "Two-way chat from dashboard", state: "included" },
          { label: "Campaign analytics (open rate, CTR)", state: "included" },
          { label: "Priority customer support", state: "included" },
          { label: "Custom Features", state: "included" },
        ],
      },
      {
        title: "Coming soon",
        items: [
          { label: "Multi-branch management", state: "included" },
          { label: "Advanced analytics & custom reports", state: "included" },
        ],
      },
    ],
  },
]

export interface FeatureRow {
  feature: string
  hint?: string
  starter: FeatureCell
  growth: FeatureCell
  pro: FeatureCell
}

export interface FeatureCategory {
  title: string
  rows: FeatureRow[]
}

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    title: "Appointments & scheduling",
    rows: [
      { feature: "Appointment booking", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "Calendar management", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "Walk-in management", starter: "yes", growth: "yes", pro: "yes" },
      {
        feature: "Booking via WhatsApp",
        hint: "Clients book directly in chat",
        starter: "yes",
        growth: "yes",
        pro: "yes",
      },
    ],
  },
  {
    title: "Billing & payments",
    rows: [
      { feature: "GST billing & invoicing", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "Payment tracking", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "Expense management", starter: "yes", growth: "yes", pro: "yes" },
    ],
  },
  {
    title: "Staff & operations",
    rows: [
      { feature: "Staff management", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "Attendance & leaves", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "Incentive management", starter: "no", growth: "yes", pro: "yes" },
      { feature: "Inventory management", starter: "yes", growth: "yes", pro: "yes" },
    ],
  },
  {
    title: "Client management",
    rows: [
      { feature: "Client records (CRM)", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "Service history per client", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "Birthday & anniversary tracking", starter: "yes", growth: "yes", pro: "yes" },
      {
        feature: "Auto birthday/anniversary offers",
        hint: "Triggered promotions sent automatically",
        starter: "yes",
        growth: "yes",
        pro: "yes",
      },
    ],
  },
  {
    title: "Reports & analytics",
    rows: [
      { feature: "Basic dashboard", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "Sales & revenue reports", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "Staff performance scoring", starter: "yes", growth: "yes", pro: "yes" },
      { feature: "NPS & feedback analytics", starter: "no", growth: "yes", pro: "yes" },
      {
        feature: "Campaign analytics",
        hint: "Open rate, CTR, conversions",
        starter: "no",
        growth: "yes",
        pro: "yes",
      },
      { feature: "Advanced custom reports", starter: "no", growth: "no", pro: "soon" },
    ],
  },
  {
    title: "Feedback management",
    rows: [
      {
        feature: "Post-visit feedback collection",
        hint: "Auto-sent after each appointment",
        starter: "no",
        growth: "yes",
        pro: "yes",
      },
      { feature: "Feedback management settings", starter: "no", growth: "yes", pro: "yes" },
      {
        feature: "Negative reviewer alerts",
        hint: "Instant owner notification",
        starter: "no",
        growth: "yes",
        pro: "yes",
      },
      {
        feature: "Google review nudges",
        hint: "Auto-prompt happy clients to review",
        starter: "no",
        growth: "yes",
        pro: "yes",
      },
      { feature: "NPS dashboard", starter: "no", growth: "yes", pro: "yes" },
    ],
  },
  {
    title: "Loyalty management",
    rows: [
      { feature: "Points & rewards engine", starter: "no", growth: "yes", pro: "yes" },
      { feature: "Reward points settings", starter: "no", growth: "yes", pro: "yes" },
      {
        feature: "Tiered memberships",
        hint: "Silver / Gold / Platinum",
        starter: "no",
        growth: "yes",
        pro: "yes",
      },
      { feature: "Referral program", starter: "no", growth: "yes", pro: "yes" },
    ],
  },
  {
    title: "WhatsApp (WABA) integration",
    rows: [
      {
        feature: "Appointment reminders",
        hint: "Auto-sent before visits",
        starter: "no",
        growth: "addon",
        pro: "yes",
      },
      {
        feature: "Broadcast promotions",
        starter: "no",
        growth: "addon",
        pro: "yes",
      },
      {
        feature: "Two-way chat from dashboard",
        starter: "no",
        growth: "addon",
        pro: "yes",
      },
      {
        feature: "Booking via WhatsApp",
        starter: "no",
        growth: "addon",
        pro: "yes",
      },
    ],
  },
  {
    title: "Support & limits",
    rows: [
      { feature: "Appointments per month", starter: "Unlimited", growth: "Unlimited", pro: "Unlimited" },
      { feature: "Client records", starter: "Unlimited", growth: "Unlimited", pro: "Unlimited" },
      { feature: "Staff accounts", starter: "Unlimited", growth: "Unlimited", pro: "Unlimited" },
      { feature: "Multi-branch management", starter: "no", growth: "no", pro: "soon" },
      { feature: "Customer support", starter: "Email", growth: "Email + chat", pro: "Priority" },
    ],
  },
]
