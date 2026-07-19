"use client"

import { useCallback, useEffect, useState } from "react"
import { useEntitlements } from "@/hooks/use-entitlements"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { 
  CreditCard,
  Calendar, 
  Building2, 
  MapPin, 
  RefreshCw, 
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Receipt,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Zap,
  Clock,
  X,
  Wallet,
  Ticket,
} from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import {
  PlanCheckoutAPI,
  WalletAPI,
  type PlanBillingPeriod,
  type PlanPromoPreview,
  type PlanSubscriptionId,
  type PlanTransaction,
} from "@/lib/api"
import { planBadgeClass, tierOf } from "@/lib/plan-ids"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, History } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

interface BusinessInfo {
  _id: string
  code: string
  name: string
  address: {
    street: string
    city: string
    state: string
    zipCode: string
    country: string
  }
  contact: {
    phone: string
    email: string
  }
  createdAt: string
}

interface Plan {
  id: string
  name: string
  description: string
  monthlyPrice: number | null
  yearlyPrice: number | null
  features: string[]
  limits: {
    locations: number
    staff: number
    whatsappMessages: number
    smsMessages: number
  }
}

export function PlanBilling() {
  const { planInfo, isLoading: planLoading, error: planError, refetch: refetchPlan } = useEntitlements()
  const { user } = useAuth()
  const { toast } = useToast()
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null)
  const [isLoadingBusiness, setIsLoadingBusiness] = useState(true)
  const [isRenewing, setIsRenewing] = useState(false)
  const [isCancellingDowngrade, setIsCancellingDowngrade] = useState(false)
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([])
  const [isLoadingPlans, setIsLoadingPlans] = useState(true)
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [showChangePlan, setShowChangePlan] = useState(false)
  const [walletBalanceRupees, setWalletBalanceRupees] = useState<number | null>(null)
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(true)
  // Bumped after a successful checkout so the Billing History card refetches.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false)
  const [promoCodeInput, setPromoCodeInput] = useState("")
  const [appliedPromo, setAppliedPromo] = useState<PlanPromoPreview | null>(null)
  const [promoApplying, setPromoApplying] = useState(false)

  const loadWalletBalance = useCallback(async () => {
    setWalletBalanceLoading(true)
    try {
      const res = await WalletAPI.getBalance()
      if (res?.success && res.data) {
        setWalletBalanceRupees(res.data.balanceRupees)
      }
    } catch {
      setWalletBalanceRupees(null)
    } finally {
      setWalletBalanceLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWalletBalance()
  }, [loadWalletBalance])

  useEffect(() => {
    fetchBusinessInfo()
    fetchAvailablePlans()
    // Set initial billing period from plan info
    if (planInfo?.billingPeriod) {
      setSelectedBillingPeriod(planInfo.billingPeriod as 'monthly' | 'yearly')
    }
    // Set initial selected plan to current plan
    if (planInfo?.planId) {
      setSelectedPlanId(planInfo.planId)
    }
  }, [planInfo])

  const fetchBusinessInfo = async () => {
    try {
      setIsLoadingBusiness(true)
      const response = await fetch(`${API_URL}/business/info`, {
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setBusinessInfo(data.data)
        }
      }
    } catch (error) {
      console.error('Error fetching business info:', error)
    } finally {
      setIsLoadingBusiness(false)
    }
  }

  const fetchAvailablePlans = async () => {
    try {
      setIsLoadingPlans(true)
      const response = await fetch(`${API_URL}/business/plans`, {
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setAvailablePlans(data.data)
        }
      } else {
        throw new Error('Failed to fetch plans')
      }
    } catch (error) {
      console.error('Error fetching available plans:', error)
      toast({
        title: "Error",
        description: "Failed to load available plans. Please refresh the page.",
        variant: "destructive",
      })
    } finally {
      setIsLoadingPlans(false)
    }
  }

  useEffect(() => {
    setAppliedPromo(null)
    setPromoCodeInput("")
  }, [selectedPlanId, selectedBillingPeriod])

  const handleApplyPromo = async () => {
    const code = promoCodeInput.trim()
    if (!code) {
      setAppliedPromo(null)
      return
    }
    if (!selectedPlanId) return

    setPromoApplying(true)
    try {
      const res = await PlanCheckoutAPI.validatePromo(
        selectedPlanId as PlanSubscriptionId,
        selectedBillingPeriod as PlanBillingPeriod,
        code
      )
      if (!res?.success || !res.data?.promo) {
        throw new Error(res?.error || "Invalid promo code")
      }
      setAppliedPromo(res.data.promo)
      setPromoCodeInput(res.data.promo.code)
      toast({
        title: "Promo applied",
        description: `You save ${formatPrice(res.data.promo.discountRupees)} on this checkout.`,
      })
    } catch (err: unknown) {
      setAppliedPromo(null)
      toast({
        variant: "destructive",
        title: "Promo code",
        description: err instanceof Error ? err.message : "Could not apply promo code",
      })
    } finally {
      setPromoApplying(false)
    }
  }

  const clearPromo = () => {
    setAppliedPromo(null)
    setPromoCodeInput("")
  }

  // ── Checkout ─────────────────────────────────────────────────────────────

  const handleRenew = async () => {
    if (!planInfo) return

    const selectedPlan = availablePlans.find(p => p.id === selectedPlanId) || null
    const planName = selectedPlan?.name || selectedPlanId
    const planIdTyped = selectedPlanId as PlanSubscriptionId
    const periodTyped = selectedBillingPeriod as PlanBillingPeriod

    // ── Branch 1: Downgrade → schedule for next renewal, no charge ────────
    if (isDowngrade) {
      try {
        setIsRenewing(true)
        const res = await PlanCheckoutAPI.scheduleDowngrade(planIdTyped, periodTyped)
        if (!res?.success) {
          throw new Error(res?.error || "Could not schedule downgrade")
        }
        const effective = res.data?.pendingEffectiveAt
        toast({
          title: "Downgrade scheduled",
          description: effective
            ? `Your plan will switch to ${planName} on ${formatDate(effective)}.`
            : `Your plan will switch to ${planName} on your next renewal.`,
        })
        setShowChangePlan(false)
        setSelectedPlanId(planInfo.planId)
        await refetchPlan()
      } catch (err: any) {
        toast({
          variant: "destructive",
          title: "Could not schedule downgrade",
          description: err?.message || "Please try again",
        })
      } finally {
        setIsRenewing(false)
      }
      return
    }

    // ── Branch 2: Renewal / upgrade → debit messaging wallet ─────────────
    try {
      setIsRenewing(true)
      const payRes = await PlanCheckoutAPI.payWithWallet(
        planIdTyped,
        periodTyped,
        appliedPromo?.code || promoCodeInput.trim() || undefined
      )
      if (!payRes?.success) {
        throw new Error(payRes?.error || "Failed to complete checkout")
      }

      toast({
        title: "Payment successful",
        description: isPlanChange
          ? `You're now on the ${planName} plan (${selectedBillingPeriod}). The amount was debited from your wallet. A confirmation email has been sent.`
          : `${planName} subscription renewed. The amount was debited from your wallet. A confirmation email has been sent.`,
      })
      await refetchPlan()
      await loadWalletBalance()
      setHistoryRefreshKey(k => k + 1)
      clearPromo()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: err?.message || "Please try again",
      })
    } finally {
      setIsRenewing(false)
    }
  }

  const handleCancelDowngrade = async () => {
    try {
      setIsCancellingDowngrade(true)
      const res = await PlanCheckoutAPI.cancelScheduledDowngrade()
      if (!res?.success) {
        throw new Error(res?.error || "Failed to cancel scheduled downgrade")
      }
      toast({
        title: "Downgrade cancelled",
        description: "Your plan will continue as-is after renewal.",
      })
      await refetchPlan()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not cancel downgrade",
        description: err?.message || "Please try again",
      })
    } finally {
      setIsCancellingDowngrade(false)
    }
  }

  const getPlanBadgeColor = (planId: string) => planBadgeClass(planId)

  const formatPrice = (price: number | null) => {
    if (price === 0) return 'Free'
    if (price === null || price === undefined) return 'Custom'
    return `₹${price.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`
  }

  const formatWalletAmount = (rupees: number) =>
    `₹${rupees.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  const confirmCheckout = async () => {
    setShowCheckoutConfirm(false)
    await handleRenew()
  }

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const calculateNextRenewalDate = (renewalDate: string | null, billingPeriod: string) => {
    if (!renewalDate) {
      // If no renewal date, calculate from now
      const now = new Date()
      if (billingPeriod === 'yearly') {
        now.setFullYear(now.getFullYear() + 1)
      } else {
        now.setMonth(now.getMonth() + 1)
      }
      return now
    }
    return new Date(renewalDate)
  }

  // Calculate what the renewal date will be AFTER payment
  const calculatePostPaymentRenewalDate = (currentRenewalDate: string | null, selectedBillingPeriod: string) => {
    const baseDate = currentRenewalDate ? new Date(currentRenewalDate) : new Date()
    const nextDate = new Date(baseDate)
    
    if (selectedBillingPeriod === 'yearly') {
      nextDate.setFullYear(nextDate.getFullYear() + 1)
    } else {
      nextDate.setMonth(nextDate.getMonth() + 1)
    }
    
    return nextDate
  }

  const isLoading = planLoading || isLoadingBusiness

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (planError || !planInfo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Plan & Billing</CardTitle>
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

  const nextRenewalDate = calculateNextRenewalDate(planInfo.renewalDate, planInfo.billingPeriod)
  const postPaymentRenewalDate = calculatePostPaymentRenewalDate(planInfo.renewalDate, selectedBillingPeriod)
  const planStartDate = businessInfo?.createdAt || new Date().toISOString()

  const catalogPlan = (planId: string) => availablePlans.find((p) => p.id === planId)
  const currentCatalogPlan = catalogPlan(planInfo.planId)
  
  // Get selected plan details
  const selectedPlan = availablePlans.find(p => p.id === selectedPlanId) || {
    id: planInfo.planId,
    name: planInfo.planName,
    monthlyPrice: planInfo.monthlyPrice,
    yearlyPrice: planInfo.yearlyPrice,
  } as Plan
  
  // Calculate prices based on selected plan and billing period
  const selectedMonthlyPrice = selectedPlan.monthlyPrice
  const selectedYearlyPrice = selectedPlan.yearlyPrice
  const monthlyEquivalent = selectedYearlyPrice ? selectedYearlyPrice / 12 : null
  
  // Calculate savings for yearly
  const calculateSavings = () => {
    if (!selectedMonthlyPrice || !selectedYearlyPrice) return null
    const monthlyTotal = selectedMonthlyPrice * 12
    const savings = monthlyTotal - selectedYearlyPrice
    const savingsPercent = ((savings / monthlyTotal) * 100).toFixed(0)
    return { amount: savings, percent: savingsPercent }
  }
  
  const savings = calculateSavings()
  
  const renewalAmount = selectedBillingPeriod === 'yearly' && selectedYearlyPrice
    ? selectedYearlyPrice
    : selectedMonthlyPrice
  
  // Calculate plan change status based on tier, not price
  const isPlanChange = selectedPlanId !== planInfo.planId
  const currentTier = tierOf(planInfo.planId)
  const selectedTier = tierOf(selectedPlanId)
  
  // Determine upgrade/downgrade based on tier comparison
  const isUpgrade = selectedTier > currentTier
  const isDowngrade = selectedTier < currentTier
  
  // Plan catalog prices (PlanTemplate via GET /business/plans) — not static config
  const currentMonthlyPrice = currentCatalogPlan?.monthlyPrice ?? planInfo.monthlyPrice ?? 0
  const currentYearlyPrice = currentCatalogPlan?.yearlyPrice ?? planInfo.yearlyPrice ?? 0
  const currentMonthlyEquivalent = currentYearlyPrice ? currentYearlyPrice / 12 : null

  // Calculate price difference for display (normalize to same billing period for comparison)
  const currentPriceForComparison = planInfo.billingPeriod === 'yearly'
    ? (currentYearlyPrice || currentMonthlyPrice * 12)
    : (currentMonthlyPrice || (currentYearlyPrice ? currentYearlyPrice / 12 : 0))
  
  const newPriceForComparison = selectedBillingPeriod === 'yearly'
    ? (selectedYearlyPrice || (selectedMonthlyPrice ? selectedMonthlyPrice * 12 : 0))
    : (selectedMonthlyPrice || (selectedYearlyPrice ? selectedYearlyPrice / 12 : 0))
  
  const priceDifference = newPriceForComparison - currentPriceForComparison
  
  // Calculate current and new prices for display (in their respective billing periods)
  const currentPrice = planInfo.billingPeriod === 'yearly' 
    ? (currentYearlyPrice || 0)
    : (currentMonthlyPrice || 0)
  const newPrice = renewalAmount || 0
  const checkoutAmount =
    appliedPromo && !isDowngrade ? appliedPromo.finalRupees : newPrice

  const renewalChargePaise = checkoutAmount ? Math.round(checkoutAmount * 100) : 0
  const walletBalanceInsufficient =
    !isDowngrade &&
    renewalChargePaise > 0 &&
    walletBalanceRupees !== null &&
    walletBalanceRupees * 100 < renewalChargePaise

  const walletBalanceAfter =
    !isDowngrade &&
    walletBalanceRupees !== null &&
    checkoutAmount != null
      ? walletBalanceRupees - checkoutAmount
      : null

  // Pending downgrade (scheduled, not yet applied) — only populated by the
  // /checkout/schedule-downgrade endpoint.
  const hasPendingDowngrade = !!(
    planInfo.pendingPlanId && planInfo.pendingEffectiveAt
  )
  const pendingPlanName =
    availablePlans.find(p => p.id === planInfo.pendingPlanId)?.name ||
    planInfo.pendingPlanId

  return (
    <div className="space-y-6">
      {/* Pending-downgrade banner */}
      {hasPendingDowngrade && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white rounded-lg border border-orange-200">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-semibold text-orange-900">
                    Downgrade to {pendingPlanName} scheduled
                  </p>
                  <p className="text-sm text-orange-800 mt-1">
                    Your plan will switch on{" "}
                    <span className="font-medium">
                      {formatDate(planInfo.pendingEffectiveAt || null)}
                    </span>
                    . You'll keep all current features until then.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelDowngrade}
                disabled={isCancellingDowngrade}
                className="border-orange-300 text-orange-900 hover:bg-orange-100"
              >
                {isCancellingDowngrade ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Details Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <CreditCard className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>Your subscription plan details</CardDescription>
              </div>
            </div>
            <Badge className={getPlanBadgeColor(planInfo.planId)}>
              {planInfo.planName || planInfo.name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Plan Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Building2 className="h-4 w-4" />
                  <span>Plan Type</span>
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  {planInfo.planName || planInfo.name}
                </p>
                <p className="text-sm text-gray-500">{planInfo.description}</p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Calendar className="h-4 w-4" />
                  <span>Billing Period</span>
                </div>
                <p className="text-lg font-semibold text-gray-900 capitalize">
                  {planInfo.billingPeriod}
                </p>
                <p className="text-sm text-gray-500">
                  {planInfo.billingPeriod === 'yearly' ? 'Billed annually' : 'Billed monthly'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Calendar className="h-4 w-4" />
                  <span>Plan Start Date</span>
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  {formatDate(planStartDate)}
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <Calendar className="h-4 w-4" />
                  <span>Next Renewal Date</span>
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  {formatDate(nextRenewalDate.toISOString())}
                </p>
                {planInfo.isTrial && (
                  <Badge variant="outline" className="mt-1 text-amber-600 border-amber-300">
                    Trial Period
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Business Information */}
          {businessInfo && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Business Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <Building2 className="h-4 w-4" />
                    <span>Business ID</span>
                  </div>
                  <p className="text-base font-medium text-gray-900">{businessInfo.code || businessInfo._id}</p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <MapPin className="h-4 w-4" />
                    <span>Address</span>
                  </div>
                  <p className="text-sm text-gray-900">
                    {businessInfo.address.street}<br />
                    {businessInfo.address.city}, {businessInfo.address.state} {businessInfo.address.zipCode}<br />
                    {businessInfo.address.country}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing Summary & Renewal Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <Receipt className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <CardTitle>Billing Summary</CardTitle>
              <CardDescription>Current billing cycle and renewal options</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Billing */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Current Plan</span>
              <span className="font-semibold text-gray-900">{planInfo.planName || planInfo.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Billing Period</span>
              <span className="font-semibold text-gray-900 capitalize">{planInfo.billingPeriod}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Monthly Cost</span>
              <span className="font-semibold text-gray-900">
                {planInfo.billingPeriod === 'yearly' && currentMonthlyEquivalent
                  ? `${formatPrice(currentMonthlyEquivalent)} / month`
                  : currentMonthlyPrice
                  ? `${formatPrice(currentMonthlyPrice)} / month`
                  : 'Custom'}
              </span>
            </div>
            {planInfo.billingPeriod === 'yearly' && currentYearlyPrice && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Annual Cost</span>
                <span className="font-semibold text-gray-900">
                  {formatPrice(currentYearlyPrice)} / year
                </span>
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-gray-900">Next Billing Date</span>
              <span className="text-base font-semibold text-blue-600">
                {formatDate(nextRenewalDate.toISOString())}
              </span>
            </div>
          </div>

          {/* Change Plan Section */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Change Plan</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Upgrade or downgrade your plan during renewal
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowChangePlan(!showChangePlan)}
              >
                {showChangePlan ? 'Keep Current Plan' : 'Change Plan'}
              </Button>
            </div>

            {showChangePlan && !isLoadingPlans && (
              <div className="mb-6 space-y-4">
                <RadioGroup
                  value={selectedPlanId}
                  onValueChange={setSelectedPlanId}
                  className="space-y-3"
                >
                  {availablePlans.map((plan) => {
                    const isCurrentPlan = plan.id === planInfo.planId
                    const isSelected = plan.id === selectedPlanId
                    const planTier = tierOf(plan.id)
                    const currentTierForPlan = tierOf(planInfo.planId)
                    const isPlanUpgrade = planTier > currentTierForPlan
                    const isPlanDowngrade = planTier < currentTierForPlan
                    
                    // Calculate price for display (normalize to selected billing period)
                    const planPrice = selectedBillingPeriod === 'yearly' 
                      ? (plan.yearlyPrice || (plan.monthlyPrice ? plan.monthlyPrice * 12 : null))
                      : plan.monthlyPrice
                    
                    // Normalize current plan price to selected billing period for comparison
                    const currentPlanPriceNormalized = selectedBillingPeriod === 'yearly'
                      ? (currentYearlyPrice || (currentMonthlyPrice ? currentMonthlyPrice * 12 : 0))
                      : (currentMonthlyPrice || (currentYearlyPrice ? currentYearlyPrice / 12 : 0))
                    
                    const diff = planPrice && currentPlanPriceNormalized ? planPrice - currentPlanPriceNormalized : 0

                    return (
                      <div
                        key={plan.id}
                        className={`relative flex items-start space-x-3 p-4 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <RadioGroupItem value={plan.id} id={plan.id} className="mt-1" />
                        <Label
                          htmlFor={plan.id}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-gray-900">{plan.name}</span>
                                {isCurrentPlan && (
                                  <Badge variant="outline" className="text-xs">
                                    Current
                                  </Badge>
                                )}
                                {isSelected && !isCurrentPlan && (
                                  <Badge className={`text-xs ${isPlanUpgrade ? 'bg-green-500' : isPlanDowngrade ? 'bg-orange-500' : 'bg-blue-500'}`}>
                                    {isPlanUpgrade ? (
                                      <>
                                        <ArrowUp className="h-3 w-3 mr-1" />
                                        Upgrade
                                      </>
                                    ) : isPlanDowngrade ? (
                                      <>
                                        <ArrowDown className="h-3 w-3 mr-1" />
                                        Downgrade
                                      </>
                                    ) : (
                                      'Selected'
                                    )}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{plan.description}</p>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-gray-700">
                                  {planPrice !== null ? formatPrice(planPrice) : 'Custom'}
                                  {selectedBillingPeriod === 'yearly' ? ' / year' : ' / month'}
                                </span>
                                {!isCurrentPlan && diff !== 0 && (
                                  <span className={`font-medium ${diff > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                                    {diff > 0 ? '+' : ''}{formatPrice(diff)} {diff > 0 ? 'more' : 'less'} per {selectedBillingPeriod === 'yearly' ? 'year' : 'month'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Label>
                      </div>
                    )
                  })}
                </RadioGroup>
                {isPlanChange && (
                  <div className={`p-4 rounded-lg border ${
                    isUpgrade 
                      ? 'bg-green-50 border-green-200' 
                      : isDowngrade 
                      ? 'bg-orange-50 border-orange-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="flex items-start gap-2">
                      {isUpgrade ? (
                        <ArrowUp className="h-5 w-5 text-green-600 mt-0.5" />
                      ) : isDowngrade ? (
                        <ArrowDown className="h-5 w-5 text-orange-600 mt-0.5" />
                      ) : (
                        <Zap className="h-5 w-5 text-blue-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className={`font-semibold ${
                          isUpgrade ? 'text-green-900' : isDowngrade ? 'text-orange-900' : 'text-blue-900'
                        }`}>
                          {isUpgrade ? 'Upgrading Plan' : isDowngrade ? 'Downgrading Plan' : 'Changing Plan'}
                        </p>
                        <p className={`text-sm mt-1 ${
                          isUpgrade ? 'text-green-700' : isDowngrade ? 'text-orange-700' : 'text-blue-700'
                        }`}>
                          {isUpgrade 
                            ? `You'll gain access to additional features with the ${selectedPlan.name} plan.`
                            : isDowngrade
                            ? `Some features may no longer be available with the ${selectedPlan.name} plan. Changes will take effect on your next billing cycle.`
                            : `You're switching to the ${selectedPlan.name} plan. Changes will take effect on your next billing cycle.`
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Renewal Section */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {isPlanChange ? 'Change Plan & Renew' : 'Renew Subscription'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {isPlanChange 
                    ? `Switch to ${selectedPlan.name} plan and choose your billing period`
                    : 'Choose your billing period and continue your subscription'
                  }
                </p>
              </div>
            </div>

            {/* Billing Period Toggle */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Label htmlFor="billing-period" className="text-base font-semibold text-gray-900 cursor-pointer">
                      Billing Period
                    </Label>
                    {selectedBillingPeriod === 'yearly' && savings && (
                      <Badge className="bg-green-500 text-white border-0">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Save {savings.percent}%
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="billing-period"
                        checked={selectedBillingPeriod === 'yearly'}
                        onCheckedChange={(checked) => setSelectedBillingPeriod(checked ? 'yearly' : 'monthly')}
                      />
                      <Label htmlFor="billing-period" className="cursor-pointer">
                        <span className={selectedBillingPeriod === 'monthly' ? 'font-semibold text-gray-900' : 'text-gray-600'}>
                          Monthly
                        </span>
                        <span className="mx-2 text-gray-400">/</span>
                        <span className={selectedBillingPeriod === 'yearly' ? 'font-semibold text-gray-900' : 'text-gray-600'}>
                          Annually
                        </span>
                      </Label>
                    </div>
                  </div>
                  {selectedBillingPeriod === 'yearly' && savings && (
                    <p className="text-sm text-green-700 mt-2 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      You'll save {formatPrice(savings.amount)} per year with annual billing
                    </p>
                  )}
                </div>
              </div>
            </div>

            {!isDowngrade && renewalAmount != null && renewalAmount > 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-4 mb-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <Ticket className="h-4 w-4 text-indigo-600" />
                  Promo code
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={promoCodeInput}
                    onChange={(e) => {
                      setPromoCodeInput(e.target.value.toUpperCase())
                      if (appliedPromo) setAppliedPromo(null)
                    }}
                    placeholder="Enter promo code"
                    className="font-mono uppercase bg-white"
                    disabled={promoApplying || isRenewing}
                  />
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleApplyPromo()}
                      disabled={promoApplying || isRenewing || !promoCodeInput.trim()}
                    >
                      {promoApplying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Apply"
                      )}
                    </Button>
                    {appliedPromo ? (
                      <Button type="button" variant="ghost" onClick={clearPromo} disabled={isRenewing}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                {appliedPromo ? (
                  <p className="text-xs text-green-700">
                    {appliedPromo.code} applied — you save {formatPrice(appliedPromo.discountRupees)}.
                    {appliedPromo.description ? ` ${appliedPromo.description}` : ""}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Have a code from EaseMySalon? Apply it before checkout.
                  </p>
                )}
              </div>
            ) : null}

            {/* Pricing Breakdown */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3 mb-4">
              {isPlanChange && (
                <div className="pb-3 border-b border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-700">Current Plan</span>
                    <span className="text-sm font-medium text-gray-900">
                      {planInfo.planName} ({currentPrice ? formatPrice(currentPrice) : 'Custom'} / {planInfo.billingPeriod === 'yearly' ? 'year' : 'month'})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">New Plan</span>
                    <span className="text-sm font-medium text-blue-600">
                      {selectedPlan.name} ({newPrice ? formatPrice(newPrice) : 'Custom'} / {selectedBillingPeriod === 'yearly' ? 'year' : 'month'})
                    </span>
                  </div>
                </div>
              )}
              {selectedBillingPeriod === 'yearly' && selectedYearlyPrice ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Annual Plan</span>
                    <span className="text-xl font-bold text-blue-600">
                      {formatPrice(selectedYearlyPrice)} / year
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Monthly equivalent</span>
                    <span className="text-gray-700 font-medium">
                      {monthlyEquivalent ? formatPrice(monthlyEquivalent) : 'N/A'} / month
                    </span>
                  </div>
                  {savings && (
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-blue-200">
                      <span className="text-green-700 font-medium">Total Savings</span>
                      <span className="text-green-700 font-bold">
                        {formatPrice(savings.amount)} ({savings.percent}% off)
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">Monthly Plan</span>
                    <span className="text-xl font-bold text-blue-600">
                      {selectedMonthlyPrice ? formatPrice(selectedMonthlyPrice) : 'Custom'} / month
                    </span>
                  </div>
                  {selectedYearlyPrice && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Annual total</span>
                      <span className="text-gray-700">
                        {selectedMonthlyPrice ? formatPrice(selectedMonthlyPrice * 12) : 'N/A'} / year
                      </span>
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-600 pt-2 border-t border-blue-200">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                <span>
                  {isDowngrade
                    ? `Downgrade will take effect on ${formatDate(nextRenewalDate.toISOString())}. No charge now — you keep your current features until then.`
                    : isPlanChange
                    ? `Plan change will take effect on payment. Next renewal date: ${formatDate(postPaymentRenewalDate.toISOString())}`
                    : `All current features will remain active. Next renewal date: ${formatDate(postPaymentRenewalDate.toISOString())}`
                  }
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {!isDowngrade && renewalChargePaise > 0 && (
                <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-gray-600 flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Wallet balance
                  </span>
                  <span className="font-medium tabular-nums text-gray-900">
                    {walletBalanceLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                    ) : walletBalanceRupees !== null ? (
                      `₹${walletBalanceRupees.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              )}
              {appliedPromo && !isDowngrade ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">List price</span>
                    <span className="text-gray-700 line-through">
                      {formatPrice(appliedPromo.baseRupees)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-green-700 font-medium">
                      Promo ({appliedPromo.code})
                    </span>
                    <span className="text-green-700 font-medium">
                      −{formatPrice(appliedPromo.discountRupees)}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <span className="text-base font-semibold text-gray-900">
                  {isDowngrade ? 'Amount Due Now' : 'Total Amount'}
                </span>
                <span className="text-2xl font-bold text-blue-600">
                  {isDowngrade
                    ? formatPrice(0)
                    : checkoutAmount
                    ? formatPrice(checkoutAmount)
                    : 'Custom'}
                </span>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setShowCheckoutConfirm(true)}
                  disabled={
                    isRenewing ||
                    (!isDowngrade && !checkoutAmount && !renewalAmount) ||
                    (!isDowngrade && hasPendingDowngrade && !isPlanChange) ||
                    walletBalanceInsufficient
                  }
                  className={isDowngrade ? "bg-orange-600 hover:bg-orange-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}
                  size="default"
                  title={
                    walletBalanceInsufficient
                      ? "Insufficient wallet balance — recharge your wallet first"
                      : !renewalAmount && !isDowngrade
                        ? "This plan has custom pricing — please contact sales."
                        : undefined
                  }
                >
                {isRenewing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : isDowngrade ? (
                  <>
                    <Clock className="h-4 w-4 mr-2" />
                    Schedule Downgrade
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    <Wallet className="h-4 w-4 mr-2" />
                    Proceed to Checkout
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
              </div>

              {walletBalanceInsufficient && (
                <p className="text-xs text-red-600 text-right">
                  Your wallet balance is too low for this checkout.{" "}
                  <Link
                    href="/settings?section=recharge"
                    className="font-medium underline underline-offset-2 hover:text-red-700"
                  >
                    Click here to Recharge
                  </Link>
                  .
                </p>
              )}

              <p className="text-xs text-gray-500 text-center">
                {isDowngrade
                  ? `Downgrades switch on your next renewal and don't carry a charge. Current features remain active until ${formatDate(nextRenewalDate.toISOString())}.`
                  : `By proceeding, you agree to ${isPlanChange ? 'change your plan and ' : ''}pay from your messaging wallet for ${selectedBillingPeriod === 'yearly' ? '1 year' : '1 month'} of the ${selectedPlan.name} plan. GST was collected when you recharged your wallet.`}
              </p>
              <div className="text-center mt-2">
                <Link href="/pricing" className="text-sm text-blue-600 hover:text-blue-700 underline">
                  View all plans and features →
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showCheckoutConfirm} onOpenChange={setShowCheckoutConfirm}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isDowngrade ? "Schedule plan downgrade?" : "Confirm checkout"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isDowngrade
                ? "Review the scheduled change below. No payment is taken now."
                : "Review the plan charge and wallet debit before you pay."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-lg border bg-slate-50 divide-y divide-slate-200 text-sm">
            {isPlanChange && (
              <>
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <span className="text-muted-foreground">Current plan</span>
                  <span className="font-medium text-right">
                    {planInfo.planName}
                    <span className="block text-xs font-normal text-muted-foreground capitalize">
                      {planInfo.billingPeriod} billing
                    </span>
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <span className="text-muted-foreground">New plan</span>
                  <span className="font-medium text-right text-blue-700">
                    {selectedPlan.name}
                    <span className="block text-xs font-normal text-blue-600/80 capitalize">
                      {selectedBillingPeriod} billing
                    </span>
                  </span>
                </div>
              </>
            )}
            {!isPlanChange && (
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium text-right">
                  {selectedPlan.name}
                  <span className="block text-xs font-normal text-muted-foreground capitalize">
                    {selectedBillingPeriod} billing
                  </span>
                </span>
              </div>
            )}
            {!isDowngrade && (
              <>
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <span className="text-muted-foreground">
                    {selectedBillingPeriod === "yearly" ? "Annual plan fee" : "Monthly plan fee"}
                  </span>
                  <span className="font-medium tabular-nums">
                    {renewalAmount ? formatPrice(renewalAmount) : "Custom"}
                  </span>
                </div>
                {appliedPromo ? (
                  <div className="flex items-start justify-between gap-4 px-4 py-3">
                    <span className="text-muted-foreground">Promo ({appliedPromo.code})</span>
                    <span className="font-medium tabular-nums text-green-700">
                      −{formatPrice(appliedPromo.discountRupees)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <span className="text-muted-foreground">GST</span>
                  <span className="text-right text-muted-foreground">
                    Included in wallet balance
                    <span className="block text-xs">Collected when you recharged</span>
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <span className="text-muted-foreground">Wallet debit</span>
                  <span className="font-semibold tabular-nums text-blue-700">
                    {checkoutAmount ? formatPrice(checkoutAmount) : "Custom"}
                  </span>
                </div>
                {walletBalanceRupees !== null && (
                  <div className="flex items-start justify-between gap-4 px-4 py-3">
                    <span className="text-muted-foreground">Wallet balance</span>
                    <span className="font-medium tabular-nums text-right">
                      {formatWalletAmount(walletBalanceRupees)}
                      {walletBalanceAfter !== null && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          → {formatWalletAmount(walletBalanceAfter)} after payment
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-4 px-4 py-3 bg-white">
                  <span className="font-semibold text-gray-900">Total due now</span>
                  <span className="text-lg font-bold tabular-nums text-blue-700">
                    {checkoutAmount ? formatPrice(checkoutAmount) : "Custom"}
                  </span>
                </div>
              </>
            )}
            {isDowngrade && (
              <>
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <span className="text-muted-foreground">Switch to</span>
                  <span className="font-medium text-right">{selectedPlan.name}</span>
                </div>
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <span className="text-muted-foreground">Amount due now</span>
                  <span className="font-semibold text-green-700">{formatPrice(0)}</span>
                </div>
              </>
            )}
            <div className="flex items-start justify-between gap-4 px-4 py-3">
              <span className="text-muted-foreground">
                {isDowngrade ? "Effective on" : "Next renewal after payment"}
              </span>
              <span className="font-medium text-right">
                {formatDate(
                  (isDowngrade
                    ? nextRenewalDate
                    : postPaymentRenewalDate
                  ).toISOString()
                )}
              </span>
            </div>
          </div>

          {!isDowngrade && (
            <p className="text-xs text-muted-foreground">
              A confirmation email will be sent after payment. No tax invoice is issued for plan billing.
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRenewing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRenewing}
              className={
                isDowngrade
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }
              onClick={(e) => {
                e.preventDefault()
                void confirmCheckout()
              }}
            >
              {isRenewing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : isDowngrade ? (
                "Schedule downgrade"
              ) : (
                "Confirm & pay from wallet"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BillingHistory refreshKey={historyRefreshKey} />
    </div>
  )
}

// ── Billing history ───────────────────────────────────────────────────────
// Lists past plan-checkout payments (renewals, upgrades, plan changes).
function BillingHistory({ refreshKey }: { refreshKey: number }) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PlanTransaction[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const load = useCallback(async (targetPage: number) => {
    setLoading(true)
    try {
      const res = await PlanCheckoutAPI.listTransactions({
        page: targetPage,
        limit: 10,
      })
      if (res?.success && res.data) {
        setItems(res.data.items)
        setTotalPages(res.data.pagination.totalPages)
        setPage(res.data.pagination.page)
      } else {
        setItems([])
      }
    } catch (err: any) {
      console.error("Failed to load plan transactions:", err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(1)
  }, [load, refreshKey])

  const formatRupees = (paise: number) =>
    `₹${(Math.round(Number(paise) || 0) / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  const formatDateTime = (iso: string | null | undefined) => {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const kindLabel = (kind: PlanTransaction["kind"]) => {
    switch (kind) {
      case "new":
        return "New"
      case "renewal":
        return "Renewal"
      case "upgrade":
        return "Upgrade"
      case "change":
        return "Plan change"
      default:
        return kind
    }
  }

  const planLabel = (planId: string) =>
    planId
      ? planId.charAt(0).toUpperCase() + planId.slice(1)
      : "—"

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-lg">
            <History className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <CardTitle>Billing History</CardTitle>
            <CardDescription>
              Past subscription payments from your messaging wallet
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="text-right">Amount (incl. GST)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                  No subscription payments yet. Your first renewal or upgrade will appear here.
                </TableCell>
              </TableRow>
            ) : (
              items.map(t => (
                <TableRow key={t._id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDateTime(t.timestamp)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {kindLabel(t.kind)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {planLabel(t.planId)}{" "}
                    <span className="text-muted-foreground">
                      ({t.billingPeriod === "yearly" ? "annual" : "monthly"})
                    </span>
                  </TableCell>
                  <TableCell className="text-sm capitalize">{t.provider}</TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">
                    {formatRupees(t.totalChargedPaise || t.amountPaise + t.gstPaise)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 p-3 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => load(Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page >= totalPages}
              onClick={() => load(Math.min(totalPages, page + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

