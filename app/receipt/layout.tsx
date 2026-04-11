import type { Metadata } from "next"
import type { ReactNode } from "react"

/** Receipt views use a distinct favicon (not the app monogram). */
export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/images/logo-no-background.png", type: "image/png" }],
    apple: "/images/logo-no-background.png",
  },
}

export default function ReceiptLayout({ children }: { children: ReactNode }) {
  return children
}
