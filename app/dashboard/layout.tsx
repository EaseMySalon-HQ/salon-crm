import type { Metadata } from "next"

import { NOINDEX_ROBOTS } from "@/lib/seo/noindex-metadata"

export const metadata: Metadata = NOINDEX_ROBOTS

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
