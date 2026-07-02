"use client"

import { useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { AuthAPI } from "@/lib/api"
import { buildLoginRedirectHref } from "@/lib/auth-utils"
import { AccountSuspended } from "@/components/auth/account-suspended"
import { setCsrfTokenPersisted } from "@/lib/csrf"

export default function AccountSuspendedPage() {
  const { user, isLoading, logout, updateUser } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(buildLoginRedirectHref())
    }
  }, [isLoading, user, router])

  useEffect(() => {
    if (!isLoading && user && !user.businessSuspended) {
      router.replace("/dashboard")
    }
  }, [isLoading, user, router])

  const handleExtendSubscription = useCallback(async (): Promise<boolean> => {
    try {
      const response = await AuthAPI.extendBillingOneDay()
      if (!response.success || !response.data) {
        return false
      }

      if (response.csrfToken && typeof response.csrfToken === "string") {
        setCsrfTokenPersisted(response.csrfToken)
      }

      updateUser({
        businessSuspended: response.data.businessSuspended,
        nextBillingDate: response.data.nextBillingDate,
        billingOneDayExtensionAvailable: response.data.billingOneDayExtensionAvailable,
      })

      if (!response.data.businessSuspended) {
        router.replace("/dashboard")
      }

      return true
    } catch {
      return false
    }
  }, [router, updateUser])

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
      billingOneDayExtensionAvailable={user.billingOneDayExtensionAvailable}
      onExtendSubscription={handleExtendSubscription}
      onLogout={() => logout()}
    />
  )
}
