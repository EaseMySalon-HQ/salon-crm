import { Metadata } from "next"
import { RefundPolicyContent } from "@/components/gdpr/refund-policy-content"

export const metadata: Metadata = {
  title: "Refund Policy | EaseMySalon",
  description: "EaseMySalon's Refund Policy. Learn about subscription refunds, cancellation terms, add-on charges, and refund processing for our salon management software.",
  keywords: [
    "salon software refund",
    "EaseMySalon refund policy",
    "subscription cancellation",
    "salon software refund policy",
  ],
  openGraph: {
    title: "Refund Policy | EaseMySalon",
    description: "Our refund and cancellation policy for salon management software subscriptions.",
  },
  alternates: {
    canonical: '/refund-policy',
  },
}

export default function RefundPolicyPage() {
  return <RefundPolicyContent />
}
