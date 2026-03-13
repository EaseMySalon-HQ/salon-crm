import { Metadata } from "next"
import { TermsAndConditionsContent } from "@/components/gdpr/terms-and-conditions-content"

export const metadata: Metadata = {
  title: "Terms & Conditions | EaseMySalon",
  description: "EaseMySalon's Terms and Conditions. Read our terms of use for the salon management platform including subscription, acceptable use, and data responsibility.",
  keywords: [
    "salon software terms",
    "EaseMySalon terms",
    "terms and conditions",
    "salon platform terms",
  ],
  openGraph: {
    title: "Terms & Conditions | EaseMySalon",
    description: "Our terms and conditions for using the EaseMySalon salon management platform.",
  },
  alternates: {
    canonical: '/terms-and-conditions',
  },
}

export default function TermsAndConditionsPage() {
  return <TermsAndConditionsContent />
}
