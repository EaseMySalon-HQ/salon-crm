"use client"

import type React from "react"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

interface ProtectedRouteProps {
  children: React.ReactNode
  /** Permission module to check. Access granted only when user has view permission. */
  requiredModule?: string
}

export function ProtectedRoute({ children, requiredModule }: ProtectedRouteProps) {
  const { user, isLoading, hasPermission } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace("/login")
        return
      }
      if (requiredModule && !hasPermission(requiredModule, "view")) {
        router.replace("/unauthorized")
        return
      }
    }
  }, [user, isLoading, router, requiredModule, hasPermission])

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render anything if not authenticated - let the redirect happen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  // Permission check in render - if we have permission, render immediately (avoids effect race)
  if (requiredModule && !hasPermission(requiredModule, "view")) {
    return null // Effect will redirect to /unauthorized
  }

  return <>{children}</>
}
