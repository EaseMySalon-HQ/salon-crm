"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { AccountSuspended } from "@/components/auth/account-suspended"

export default function AccountSuspendedPage() {
  const { user, isLoading, logout } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login")
    }
  }, [isLoading, user, router])

  useEffect(() => {
    if (!isLoading && user && !user.businessSuspended) {
      router.replace("/dashboard")
    }
  }, [isLoading, user, router])

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3" />
          <p className="text-slate-600 text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  if (!user.businessSuspended) {
    return null
  }

  return (
    <AccountSuspended
      nextBillingDate={user.nextBillingDate}
      supportEmail={user.suspensionSupportEmail}
      supportPhone={user.suspensionSupportPhone}
      onLogout={() => logout()}
    />
  )
}
