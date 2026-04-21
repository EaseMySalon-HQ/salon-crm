"use client"

import { useEntitlements } from "@/hooks/use-entitlements"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CreditCard, CheckCircle2, XCircle, Calendar, AlertCircle, ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"

export function PlanInfo() {
  const { planInfo, isLoading, error } = useEntitlements()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !planInfo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Unable to load plan information</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const getPlanBadgeColor = (planId: string) => {
    switch (planId) {
      case 'starter':
        return 'bg-blue-100 text-blue-800'
      case 'professional':
        return 'bg-purple-100 text-purple-800'
      case 'enterprise':
        return 'bg-amber-100 text-amber-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return 'Custom'
    return `₹${price.toLocaleString()}`
  }

  const getMonthlyEquivalent = (yearlyPrice: number) => {
    return Math.round(yearlyPrice / 12)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Current Plan
            </CardTitle>
            <CardDescription>Your subscription plan and feature access</CardDescription>
          </div>
          <Badge className={getPlanBadgeColor(planInfo.planId)}>
            {planInfo.planName || planInfo.name}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Plan Details */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Billing Period</p>
              <p className="text-sm text-gray-500 capitalize">{planInfo.billingPeriod}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">Price</p>
              <p className="text-lg font-semibold">
                {planInfo.billingPeriod === 'yearly' && planInfo.yearlyPrice
                  ? `${formatPrice(getMonthlyEquivalent(planInfo.yearlyPrice))}/mo`
                  : planInfo.monthlyPrice
                  ? `${formatPrice(planInfo.monthlyPrice)}/mo`
                  : 'Custom'}
              </p>
            </div>
          </div>

          {planInfo.renewalDate && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>Renews: {new Date(planInfo.renewalDate).toLocaleDateString()}</span>
            </div>
          )}

          {planInfo.isTrial && planInfo.trialEndsAt && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">Trial Period</p>
                <p className="text-xs text-amber-700">
                  Trial ends on {new Date(planInfo.trialEndsAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}

          {planInfo.hasOverrides && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">Promotional Features Active</p>
                <p className="text-xs text-blue-700">
                  You have access to additional promotional features
                  {planInfo.overridesExpiresAt && (
                    <span> until {new Date(planInfo.overridesExpiresAt).toLocaleDateString()}</span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Features Summary */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Included Features</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-gray-600">{planInfo.features.length} Features</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-gray-600">
                {planInfo.limits.locations === Infinity ? 'Unlimited' : planInfo.limits.locations} Location{planInfo.limits.locations !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-gray-600">
                {planInfo.limits.staff === Infinity ? 'Unlimited' : planInfo.limits.staff} Staff
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-gray-600">
                {planInfo.support.email ? 'Email' : ''} {planInfo.support.phone ? 'Phone' : ''} Support
              </span>
            </div>
          </div>
        </div>

        {/* Add-ons */}
        {(planInfo.addons?.whatsapp?.enabled || planInfo.addons?.sms?.enabled) && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Active Add-ons</p>
            <div className="space-y-2">
              {planInfo.addons.whatsapp?.enabled && (
                <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm text-gray-700">WhatsApp Receipts</span>
                  <span className="text-xs text-gray-500">
                    Billed per message from wallet
                  </span>
                </div>
              )}
              {planInfo.addons.sms?.enabled && (
                <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm text-gray-700">SMS Notifications</span>
                  <span className="text-xs text-gray-500">
                    Billed per message from wallet
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upgrade CTA */}
        {planInfo.planId !== 'enterprise' && (
          <div className="pt-4 border-t">
            <Button asChild variant="outline" className="w-full">
              <Link href="/pricing">
                View Plans & Upgrade
                <ArrowUpRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

