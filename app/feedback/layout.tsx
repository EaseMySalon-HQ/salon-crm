import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Rate your visit | EaseMySalon",
  description: "Share feedback about your salon visit",
}

export default function FeedbackLayout({ children }: { children: ReactNode }) {
  return children
}
