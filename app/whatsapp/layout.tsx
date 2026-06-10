"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useFeature } from "@/hooks/use-entitlements"

export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { hasAccess, isLoading } = useFeature("whatsapp_integration")

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      router.replace("/dashboard")
    }
  }, [hasAccess, isLoading, router])

  if (isLoading || !hasAccess) {
    return null
  }

  return children
}
