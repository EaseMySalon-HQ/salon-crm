import { Metadata } from "next"
import { PrivacyPolicyContent } from "@/components/gdpr/privacy-policy-content"

export const metadata: Metadata = {
  title: "Privacy Policy | GDPR & DPDP Compliant Salon Software",
  description: "Ease My Salon's privacy policy and GDPR compliance information. Learn how we protect your salon data and client information. DPDP compliant salon management software.",
  keywords: [
    "salon software privacy",
    "GDPR compliant salon software",
    "DPDP compliant salon software",
    "salon data privacy",
    "salon software security",
    "salon client data protection",
    "salon software privacy policy",
    "salon management data security"
  ],
  openGraph: {
    title: "Privacy Policy | Ease My Salon",
    description: "Our privacy policy and GDPR/DPDP compliance information. Learn how we protect your salon data.",
  },
  alternates: {
    canonical: '/privacy-policy',
  },
}

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyContent />
}

