import { Metadata } from "next"
import { PrivacyPolicyContent } from "@/components/gdpr/privacy-policy-content"

export const metadata: Metadata = {
  title: "Privacy Policy | Ease My Salon",
  description: "Our privacy policy and GDPR compliance information",
}

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyContent />
}

