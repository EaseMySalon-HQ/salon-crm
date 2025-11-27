"use client"

import { ReactNode } from "react"
import { useFeature } from "@/hooks/use-entitlements"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Lock, ArrowUpRight } from "lucide-react"
import Link from "next/link"

interface FeatureGateProps {
  featureId: string
  children: ReactNode
  fallback?: ReactNode
  showUpgrade?: boolean
  upgradeMessage?: string
  compact?: boolean // New prop for compact display
}

export function FeatureGate({ 
  featureId, 
  children, 
  fallback,
  showUpgrade = true,
  upgradeMessage,
  compact = false
}: FeatureGateProps) {
  const { hasAccess, isLoading } = useFeature(featureId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>
    }

    if (showUpgrade) {
      // Compact version - smaller, less obtrusive
      if (compact) {
        return (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <div className="flex items-start gap-2">
              <Lock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-amber-800">
                  {upgradeMessage || "This feature requires an upgrade."}
                </p>
                <Button 
                  asChild 
                  variant="link" 
                  className="h-auto p-0 text-amber-700 hover:text-amber-800 text-xs mt-1"
                >
                  <Link href="/settings">
                    View Plans <ArrowUpRight className="h-3 w-3 ml-1 inline" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )
      }

      // Full version - original card design
      return (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-amber-900">Feature Not Available</CardTitle>
            </div>
            <CardDescription className="text-amber-700">
              {upgradeMessage || "This feature is not available in your current plan. Upgrade to access this feature."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="bg-amber-600 hover:bg-amber-700">
              <Link href="/settings">
                View Plans
                <ArrowUpRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )
    }

    return null
  }

  return <>{children}</>
}

