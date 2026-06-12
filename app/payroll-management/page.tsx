import type { Metadata } from "next"

import { FeatureLandingPage } from "@/components/marketing/feature-landing-page"

export const metadata: Metadata = {
  title: "Salon Payroll Software | Automated Salary Management",
  description:
    "Calculate salaries, commissions and incentives accurately while reducing manual work.",
  keywords: [
    "salon payroll software",
    "stylist commission software",
    "salon salary calculator",
    "salon HR payroll",
    "salon staff payouts",
    "salon incentive software",
  ],
  alternates: { canonical: "/payroll-management" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/payroll-management",
    siteName: "EaseMySalon",
    title: "Salon Payroll Software | Automated Salary Management",
    description:
      "Calculate salaries, commissions and incentives accurately while reducing manual work.",
    images: [
      { url: "/images/dashboard.png", width: 1200, height: 630, alt: "Salon payroll software" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Salon Payroll Software | Automated Salary Management",
    description:
      "Calculate salaries, commissions and incentives accurately while reducing manual work.",
    images: ["/images/dashboard.png"],
  },
}

export default function PayrollManagementPage() {
  return (
    <FeatureLandingPage
      slug="payroll-management"
      eyebrow="EaseMySalon · Payroll management"
      h1="Payroll Made Simple"
      intro="Stop spending the last weekend of every month in spreadsheets. EaseMySalon turns attendance, commissions and incentives into a fair, accurate, ready-to-pay payroll in minutes."
      breadcrumbs={[
        { name: "Home", url: "/" },
        { name: "Payroll Management", url: "/payroll-management" },
      ]}
      benefits={[
        "Auto-calculate base salary + commissions + incentives",
        "Attendance-based deductions and overtime",
        "Branch-wise and role-wise payroll views",
        "Generate payslips and share over WhatsApp",
        "Audit trail for every payroll line item",
        "Stylist-visible commission breakdowns build trust",
      ]}
      sections={[
        {
          heading: "Why payroll breaks at scale in Indian salons",
          paragraphs: [
            "When a salon has 5 staff, payroll fits on a notebook. At 15 staff across 2 branches, payroll is the most stressful task of the month. Commission disputes alone can take days to resolve, and one error in a top stylist's payout can damage trust for months.",
            "EaseMySalon's payroll management software automates the entire month-end cycle. Every bill, every shift, every commission rule, every incentive — all flowing into a clean, audit-ready payroll that owners can approve in minutes.",
          ],
        },
        {
          heading: "Salary, commission, incentive — all in one calculation",
          paragraphs: [
            "Configure each staff member's compensation once: base salary, commission slabs, retail bonus, target incentives, and any fixed allowances. The system computes the rest automatically.",
            "Commissions feed straight from billing — there's no manual matching of bills to stylists. Incentives unlock when targets are hit. Deductions apply for unpaid leave, late marks or advances. The result is a single, defensible number for each staff member.",
          ],
        },
        {
          heading: "Transparent payslips that build team trust",
          paragraphs: [
            "Each staff member gets a payslip showing exactly how their pay was calculated: services billed, retail sold, attendance, deductions, and net payout. They can drill down into the underlying bills if they want — which they almost never do, because everything is already correct.",
            "Salons that move to transparent commission payouts report measurable improvements in attrition, stylist satisfaction and the productivity of their best staff.",
          ],
        },
        {
          heading: "Branch, role and chain-ready payroll",
          paragraphs: [
            "Run payroll per branch or for the whole chain. Compare staff costs across branches to spot outliers. Filter by role to see total spend on stylists vs. front desk vs. cleaning staff.",
            "Export payroll data for your accountant or bank salary upload. Pro plan includes deeper exports and integration paths for accounting tools.",
          ],
        },
        {
          heading: "Built to grow with your salon",
          paragraphs: [
            "Whether you have 5 staff in one outlet or 50 across a chain, EaseMySalon payroll scales with you. Audit trails preserve every change so payroll history is always defensible, even years later.",
            "Combine payroll with staff management, attendance and CRM for a complete picture of your people. Plans start affordably per outlet with a 7-day free trial.",
          ],
        },
      ]}
      relatedLinks={[
        { href: "/staff-management", label: "Explore Salon Staff Management" },
        { href: "/reports-analytics", label: "View Salon Reports & Analytics" },
        { href: "/salon-billing-software", label: "Discover Salon Billing Features" },
        { href: "/salon-crm", label: "Explore Salon CRM Software" },
      ]}
    />
  )
}
