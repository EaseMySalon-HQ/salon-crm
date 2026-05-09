"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { User, Phone, TrendingUp, Receipt, FileText, AlertCircle, Loader2, ChevronDown, ChevronUp, Scissors, Package, MessageSquare, CreditCard, Wallet, Gift, X } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { SalesAPI, MembershipAPI, AppointmentsAPI, PackagesAPI, ClientWalletAPI, RewardPointsAPI } from "@/lib/api"
import { isClientPackageRedeemable } from "@/lib/client-package-utils"
import type { Client } from "@/lib/client-store"
import { useCurrency } from "@/hooks/use-currency"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { flattenClientWalletLedger, walletActivityStatusDisplay, type ClientWalletLedgerRow } from "@/lib/client-wallet-ledger"
import { billNotesForCustomerDisplay } from "@/lib/quick-sale-helpers"
import { PaymentCollectionModal } from "@/components/reports/payment-collection-modal"
import { useToast } from "@/hooks/use-toast"

interface CustomerNote {
  id: string
  source: "appointment" | "quicksale"
  content: string
  createdAt: string
  staffName?: string
  recordId: string
  href: string
}

interface ClientDetailPanelProps {
  client: Client
  /** When set, shows "View Profile" on the right side of the panel header (e.g. clients drawer). */
  onViewProfile?: () => void
}

/** Active = status ACTIVE and not past expiry; otherwise show NA. */
function getActiveMembershipPlanName(data: { subscription?: any; plan?: any } | null): string {
  if (!data?.subscription) return "NA"
  const sub = data.subscription
  const plan = data.plan ?? sub.planId
  const isActive = sub.status === "ACTIVE"
  const isExpired =
    sub.status === "EXPIRED" || (sub.expiryDate && new Date(sub.expiryDate) < new Date())
  if (!isActive || isExpired) return "NA"
  if (plan && typeof plan === "object") {
    const name = (plan.planName || plan.name || "").trim()
    if (name) return name
  }
  return "NA"
}

function getPackageServiceRowId(row: any): string {
  const sid = row?.service_id?._id || row?.service_id
  return sid ? String(sid) : ""
}

function getPrepaidPlanDisplayName(wallet: any): string {
  const snap = wallet?.planSnapshot
  if (snap && typeof snap === "object") {
    if (snap.openedFromBillChangeCredit === true || snap.billChangeCashCreditNonExpiring === true) {
      return "Bill change credit"
    }
    const n = String(snap.planName || snap.name || "").trim()
    if (n) return n
  }
  const p = wallet?.planId
  if (p && typeof p === "object") {
    const n = String(p.name || "").trim()
    if (n) return n
  }
  return "Prepaid plan"
}

function getPrepaidWalletPurchaseDate(wallet: any): Date | null {
  const raw = wallet?.purchasedAt || wallet?.createdAt
  if (!raw) return null
  const t = new Date(raw)
  return Number.isNaN(t.getTime()) ? null : t
}

/** One Past note per booking: multi-staff / multi-service rows share bookingGroupId. */
function appointmentNotesDedupeKey(apt: any): string {
  const bg = apt?.bookingGroupId
  if (bg != null && String(bg).trim() !== "") return `bg:${String(bg)}`
  return `id:${String(apt?._id || apt?.id || "")}`
}

/** Unpaid/partial rows for Settle Dues list — aligned with Quick Sale `fetchUnpaidBills` mapping. */
function mapSalesToUnpaidBillRows(sales: any[]): any[] {
  const unpaid = sales.filter((sale: any) => {
    const remainingAmount = Number(sale.paymentStatus?.remainingAmount) || 0
    return remainingAmount > 0
  })
  const rows = unpaid.map((sale: any) => ({
    _id: sale._id || sale.id,
    id: sale._id || sale.id,
    billNo: sale.billNo,
    date: sale.date,
    time: sale.time || "00:00",
    grossTotal: sale.grossTotal || sale.netTotal || 0,
    totalAmount: sale.grossTotal || sale.netTotal || 0,
    paidAmount: sale.paymentStatus?.paidAmount || 0,
    remainingAmount: sale.paymentStatus?.remainingAmount || 0,
    dueDate: sale.paymentStatus?.dueDate,
    items: sale.items || [],
    customerName: sale.customerName,
    staffName: sale.staffName || "Unassigned Staff",
    status: sale.paymentStatus?.status || sale.status || "partial",
    paymentStatus: sale.paymentStatus,
    paymentHistory: sale.paymentHistory || [],
  }))
  rows.sort((a, b) => {
    const ta = new Date(a.date || 0).getTime()
    const tb = new Date(b.date || 0).getTime()
    return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb)
  })
  return rows
}

export function ClientDetailPanel({ client, onViewProfile }: ClientDetailPanelProps) {
  const router = useRouter()
  const { formatAmount } = useCurrency()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [statsVersion, setStatsVersion] = useState(0)
  const [totalVisits, setTotalVisits] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [bills, setBills] = useState<any[]>([])
  const [duesUnpaid, setDuesUnpaid] = useState(0)
  
  const [membershipData, setMembershipData] = useState<{ subscription: any; plan: any } | null>(null)
  const [showAllBills, setShowAllBills] = useState(false)
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null)
  const [billActivityOpen, setBillActivityOpen] = useState(false)
  const [customerNotes, setCustomerNotes] = useState<CustomerNote[]>([])
  const [customerNotesOpen, setCustomerNotesOpen] = useState(true)
  const [packagesOpen, setPackagesOpen] = useState(false)
  const [membershipsOpen, setMembershipsOpen] = useState(false)
  const [membershipCardOpen, setMembershipCardOpen] = useState(false)
  const [prepaidWalletOpen, setPrepaidWalletOpen] = useState(false)
  const [prepaidWallets, setPrepaidWallets] = useState<any[]>([])
  const [walletLedgerOpen, setWalletLedgerOpen] = useState(false)
  const [walletLedgerLoading, setWalletLedgerLoading] = useState(false)
  const [walletLedgerRows, setWalletLedgerRows] = useState<ClientWalletLedgerRow[]>([])
  const [rewardSummary, setRewardSummary] = useState<{
    balance: number
    lifetimeEarned: number
    lifetimeRedeemed: number
    lastBillEarnPoints: number
  } | null>(null)
  const [clientPackages, setClientPackages] = useState<any[]>([])
  const [expandedClientPkgId, setExpandedClientPkgId] = useState<string | null>(null)
  const [packageDetailByPackageId, setPackageDetailByPackageId] = useState<Record<string, any>>({})
  const [loadingPackageDetailId, setLoadingPackageDetailId] = useState<string | null>(null)
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false)
  const [redeemContext, setRedeemContext] = useState<{
    clientPackage: any
    packageDetail: any
    triggerServiceId: string
  } | null>(null)
  const [redeemSelectedIds, setRedeemSelectedIds] = useState<Set<string>>(new Set())
  /** Service IDs already used in a non-reversed redemption for this client package */
  const [redeemedServiceIdsByClientPackageId, setRedeemedServiceIdsByClientPackageId] = useState<
    Record<string, Set<string>>
  >({})
  const [loadingRedemptionHistoryCpId, setLoadingRedemptionHistoryCpId] = useState<string | null>(null)

  const redeemablePackages = useMemo(
    () => clientPackages.filter(isClientPackageRedeemable),
    [clientPackages]
  )

  const totalPrepaidWalletBalance = useMemo(() => {
    return prepaidWallets.reduce((acc, w) => {
      if (String(w.status || "").toLowerCase() !== "active") return acc
      return acc + (Number(w.remainingBalance) || 0)
    }, 0)
  }, [prepaidWallets])

  const BILLS_VISIBLE_DEFAULT = 5
  const visibleBills = showAllBills ? bills : bills.slice(0, BILLS_VISIBLE_DEFAULT)
  const hasMoreBills = bills.length > BILLS_VISIBLE_DEFAULT

  const rawClientId = client._id || client.id
  const clientId = rawClientId && !String(rawClientId).startsWith('new-') ? rawClientId : ''

  const refreshClientPackages = useCallback(async () => {
    if (!clientId) return
    try {
      const res = await PackagesAPI.getClientPackages(clientId)
      if (res.success && Array.isArray(res.data)) setClientPackages(res.data)
      else setClientPackages([])
    } catch {
      setClientPackages([])
    }
  }, [clientId])

  useEffect(() => {
    setMembershipCardOpen(false)
    setPrepaidWalletOpen(false)
    setWalletLedgerOpen(false)
    setWalletLedgerRows([])
    setPrepaidWallets([])
    setRewardSummary(null)
    setExpandedClientPkgId(null)
    setPackageDetailByPackageId({})
    setRedeemedServiceIdsByClientPackageId({})
    setRedeemDialogOpen(false)
    setRedeemContext(null)
    setDuesListDialogOpen(false)
    setDuesDialogBills([])
    setCollectDuesOpen(false)
    setCollectDuesSale(null)
  }, [clientId])

  const [loadingNotes, setLoadingNotes] = useState(false)
  const appointmentNotesFetched = useRef<string | null>(null)

  const [collectDuesOpen, setCollectDuesOpen] = useState(false)
  const [collectDuesSale, setCollectDuesSale] = useState<any>(null)
  const [duesListDialogOpen, setDuesListDialogOpen] = useState(false)
  const [duesDialogBills, setDuesDialogBills] = useState<any[]>([])
  const [duesDialogLoading, setDuesDialogLoading] = useState(false)

  useEffect(() => {
    if (!clientId) {
      setLoading(false)
      return
    }

    let cancelled = false
    appointmentNotesFetched.current = null

    async function fetchStats() {
      setLoading(true)
      try {
        const [salesRes, membershipRes, packagesRes, walletRes, rewardSumRes] = await Promise.all([
          client.phone ? SalesAPI.getByClient(client.phone) : Promise.resolve({ success: false, data: [] as any[] }),
          MembershipAPI.getByCustomer(clientId).catch(() => ({ success: false, data: null })),
          PackagesAPI.getClientPackages(clientId).catch(() => ({ success: false, data: [] as any[] })),
          ClientWalletAPI.getClientWallets(String(clientId)).catch(() => ({ success: false, data: null })),
          RewardPointsAPI.getSummary(String(clientId)).catch(() => ({ success: false, data: null })),
        ])

        if (cancelled) return

        if (membershipRes?.success && membershipRes.data) {
          setMembershipData(membershipRes.data as any)
        } else {
          setMembershipData(null)
        }

        if (packagesRes?.success && Array.isArray(packagesRes.data)) {
          setClientPackages(packagesRes.data)
        } else {
          setClientPackages([])
        }

        const walletPayload = walletRes?.success && walletRes.data ? (walletRes.data as { wallets?: any[] }) : null
        const wList = Array.isArray(walletPayload?.wallets) ? walletPayload.wallets : []
        setPrepaidWallets(wList)

        if (rewardSumRes?.success && rewardSumRes.data) {
          setRewardSummary(rewardSumRes.data as any)
        } else {
          setRewardSummary(null)
        }
        const salesList = Array.isArray(salesRes?.data) ? salesRes.data : []
        setBills(salesList)

        setTotalVisits(salesList.length)
        const revenueSum = salesList.reduce(
          (acc: number, s: any) => acc + (Number(s?.grossTotal) || Number(s?.netTotal) || 0),
          0
        )
        setTotalRevenue(revenueSum)

        const duesSum = salesList.reduce((acc: number, s: any) => {
          const remaining = Number(s?.paymentStatus?.remainingAmount) ?? 0
          return remaining > 0 ? acc + remaining : acc
        }, 0)
        setDuesUnpaid(duesSum)

        const saleNotes: CustomerNote[] = []
        salesList.forEach((s: any) => {
          const content = billNotesForCustomerDisplay(s.notes)
          if (!content) return
          const billNo = s.billNo || s._id || s.id
          saleNotes.push({
            id: `sale-${billNo}`,
            source: "quicksale",
            content,
            createdAt: s.createdAt || s.date || new Date().toISOString(),
            staffName: s.staffName,
            recordId: billNo,
            href: `/receipt/${encodeURIComponent(billNo)}?returnTo=${encodeURIComponent(`/clients/${clientId}`)}`,
          })
        })
        saleNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setCustomerNotes(saleNotes)
      } catch (e) {
        console.error("Error fetching client stats:", e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchStats()
    return () => {
      cancelled = true
    }
  }, [clientId, statsVersion])

  const fetchAppointmentNotes = useCallback(async () => {
    if (!clientId || appointmentNotesFetched.current === clientId) return
    appointmentNotesFetched.current = clientId
    setLoadingNotes(true)
    try {
      const res = await AppointmentsAPI.getAll({ clientId, limit: 200 })
      const list = Array.isArray(res?.data) ? res.data : []
      const withNotes = list.filter((apt: any) => (apt.notes || "").trim())
      const byBooking = new Map<string, any>()
      for (const apt of withNotes) {
        const key = appointmentNotesDedupeKey(apt)
        if (!byBooking.has(key)) byBooking.set(key, apt)
      }
      const aptNotes: CustomerNote[] = []
      for (const apt of byBooking.values()) {
        const content = (apt.notes || "").trim()
        if (!content) continue
        const staffName =
          apt.staffId?.name ||
          apt.staffAssignments?.[0]?.staffId?.name ||
          apt.staffAssignments?.[0]?.staffId
        const aptId = apt._id || apt.id
        aptNotes.push({
          id: `apt-${aptId}`,
          source: "appointment",
          content,
          createdAt: apt.createdAt || apt.date || new Date().toISOString(),
          staffName: typeof staffName === "string" ? staffName : staffName?.name,
          recordId: aptId,
          href: `/appointments/new?edit=${aptId}`,
        })
      }
      setCustomerNotes(prev => {
        const merged = [...prev, ...aptNotes]
        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        return merged
      })
    } catch {
      // keep existing sale notes
    } finally {
      setLoadingNotes(false)
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId || loading) return
    void fetchAppointmentNotes()
  }, [clientId, loading, fetchAppointmentNotes])

  const displayName = client.name
  const displayPhone = client.phone
  const initial = (displayName?.charAt(0) || "?").toUpperCase()
  const activeMembershipPlanName = getActiveMembershipPlanName(membershipData)

  const closeCollectDuesSheet = useCallback(() => {
    setCollectDuesOpen(false)
    setCollectDuesSale(null)
  }, [])

  const openDuesListDialog = useCallback(async () => {
    if (duesUnpaid <= 0) return
    const phone = String(displayPhone || "").trim()
    if (!phone) {
      toast({
        title: "Phone required",
        description: "This client needs a phone number on file to open bills and collect payment.",
        variant: "destructive",
      })
      return
    }
    setDuesListDialogOpen(true)
    setDuesDialogLoading(true)
    try {
      const res = await SalesAPI.getByClient(phone)
      const sales = Array.isArray(res?.data) ? res.data : []
      const unpaid = mapSalesToUnpaidBillRows(sales)
      setDuesDialogBills(unpaid)
      if (unpaid.length === 0) {
        toast({
          title: "Nothing to collect",
          description: "No unpaid bills were found. Try refreshing.",
        })
        setDuesListDialogOpen(false)
        setStatsVersion((v) => v + 1)
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to load unpaid bills. Please try again.",
        variant: "destructive",
      })
      setDuesListDialogOpen(false)
    } finally {
      setDuesDialogLoading(false)
    }
  }, [duesUnpaid, displayPhone, toast])

  const handleCollectPaymentFromDuesList = useCallback(
    async (bill: any) => {
      const sid = String(bill._id || bill.id || "").trim()
      if (!sid) return
      setDuesDialogLoading(true)
      try {
        const res = await SalesAPI.getById(sid)
        if (!res?.success || !res?.data) {
          toast({
            title: "Could not open payment",
            description: (res as { error?: string })?.error || "Failed to load the invoice.",
            variant: "destructive",
          })
          return
        }
        const remaining = Number(res.data?.paymentStatus?.remainingAmount ?? 0) || 0
        if (remaining <= 0.02) {
          toast({
            title: "Already paid",
            description: "This invoice has no remaining balance.",
          })
          const phone = String(displayPhone || "").trim()
          if (phone) {
            const r2 = await SalesAPI.getByClient(phone)
            const sales = Array.isArray(r2?.data) ? r2.data : []
            setDuesDialogBills(mapSalesToUnpaidBillRows(sales))
          }
          return
        }
        setCollectDuesSale(res.data)
        setDuesListDialogOpen(false)
        setCollectDuesOpen(true)
      } catch {
        toast({
          title: "Error",
          description: "Could not load the bill. Try again.",
          variant: "destructive",
        })
      } finally {
        setDuesDialogLoading(false)
      }
    },
    [displayPhone, toast]
  )

  const handleDuesPaymentCollected = useCallback(async () => {
    setStatsVersion((v) => v + 1)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("appointments-refresh"))
    }
    setCollectDuesOpen(false)
    setCollectDuesSale(null)
    const phone = String(displayPhone || "").trim()
    if (!phone) return
    try {
      const res = await SalesAPI.getByClient(phone)
      const sales = Array.isArray(res?.data) ? res.data : []
      const unpaid = mapSalesToUnpaidBillRows(sales)
      setDuesDialogBills(unpaid)
      if (unpaid.length > 0) {
        setDuesListDialogOpen(true)
      }
    } catch {
      /* list refresh is best-effort */
    }
  }, [displayPhone])

  const ensurePackageDetail = useCallback(
    async (packageId: string) => {
      const key = String(packageId)
      if (packageDetailByPackageId[key]) return packageDetailByPackageId[key]
      setLoadingPackageDetailId(key)
      try {
        const res = await PackagesAPI.getById(key)
        if (res.success && res.data) {
          setPackageDetailByPackageId(prev => ({ ...prev, [key]: res.data }))
          return res.data
        }
      } finally {
        setLoadingPackageDetailId(null)
      }
      return null
    },
    [packageDetailByPackageId]
  )

  const navigateQuickSalePackageRedeem = useCallback(
    (cp: any, _detail: any, serviceIds: string[]) => {
      if (!clientId) return
      const soldRaw = cp.sold_by_staff_id?._id || cp.sold_by_staff_id
      const staffId = soldRaw ? String(soldRaw) : null
      const payload = {
        clientId: String(clientId),
        clientPackageId: String(cp._id || cp.id),
        serviceIds: serviceIds.map(String),
        staffId,
        packageName: cp.package_id?.name || "Package",
      }
      const encoded = encodeURIComponent(btoa(JSON.stringify(payload)))
      router.push(`/quick-sale?packageRedeem=${encoded}`)
    },
    [clientId, router]
  )

  const loadRedemptionHistoryForClientPackage = useCallback(async (clientPackageId: string) => {
    const key = String(clientPackageId)
    setLoadingRedemptionHistoryCpId(key)
    try {
      const res = await PackagesAPI.getRedemptionHistory(key)
      if (res.success && Array.isArray(res.data?.history)) {
        const set = new Set<string>()
        for (const h of res.data.history) {
          if (h.is_reversed) continue
          for (const s of h.services_redeemed || []) {
            const sid = s.service_id?._id || s.service_id
            if (sid) set.add(String(sid))
          }
        }
        setRedeemedServiceIdsByClientPackageId(prev => ({ ...prev, [key]: set }))
      }
    } catch {
      // keep prior set if any
    } finally {
      setLoadingRedemptionHistoryCpId(null)
    }
  }, [])

  const openClientWalletLedger = useCallback(async () => {
    const cid = clientId ? String(clientId) : ""
    if (!cid || !/^([a-f\d]{24})$/i.test(cid)) {
      toast({
        title: "Client required",
        description: "Save this client to view prepaid wallet activity.",
        variant: "destructive",
      })
      return
    }
    setWalletLedgerOpen(true)
    setWalletLedgerLoading(true)
    setWalletLedgerRows([])
    try {
      const res = await ClientWalletAPI.getClientWallets(cid)
      if (!res.success || !res.data) {
        toast({ title: res.message || "Could not load wallet", variant: "destructive" })
        return
      }
      setWalletLedgerRows(flattenClientWalletLedger(res.data.wallets, res.data.transactionsByWallet))
    } catch {
      toast({ title: "Could not load wallet activity", variant: "destructive" })
    } finally {
      setWalletLedgerLoading(false)
    }
  }, [clientId, toast])

  const freeServicesRemainingDisplay = (() => {
    const d = membershipData as {
      freeServicesRemaining?: number
      usageSummary?: Array<{ remaining?: number }>
    } | null
    if (d?.freeServicesRemaining != null && !Number.isNaN(Number(d.freeServicesRemaining))) {
      return Number(d.freeServicesRemaining)
    }
    if (Array.isArray(d?.usageSummary)) {
      return d.usageSummary.reduce((sum, row) => sum + (Number(row?.remaining) || 0), 0)
    }
    return 0
  })()

  const openPackageRedeemDialog = (e: React.MouseEvent, cp: any, detail: any, serviceId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const cpKey = String(cp._id || cp.id)
    const redeemed = redeemedServiceIdsByClientPackageId[cpKey]
    if (redeemed?.has(serviceId)) return
    const min = Number(detail.min_service_count) || 1
    if (min <= 1) {
      navigateQuickSalePackageRedeem(cp, detail, [serviceId])
      return
    }
    setRedeemContext({ clientPackage: cp, packageDetail: detail, triggerServiceId: serviceId })
    setRedeemSelectedIds(new Set([serviceId]))
    setRedeemDialogOpen(true)
  }

  const toggleRedeemServiceId = (id: string) => {
    setRedeemSelectedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const continueToQuickSaleForPackage = () => {
    if (!redeemContext) return
    const min = Number(redeemContext.packageDetail.min_service_count) || 1
    if (redeemSelectedIds.size < min) {
      toast({
        title: `Select at least ${min} service${min !== 1 ? "s" : ""}`,
        description: "This package requires multiple services per sitting.",
        variant: "destructive",
      })
      return
    }
    navigateQuickSalePackageRedeem(
      redeemContext.clientPackage,
      redeemContext.packageDetail,
      Array.from(redeemSelectedIds)
    )
    setRedeemDialogOpen(false)
    setRedeemContext(null)
  }

  const panelClass =
    "w-full max-w-full border-slate-200 shadow-lg bg-white/90 backdrop-blur-sm flex flex-col overflow-hidden " +
    "min-h-[min(32rem,70vh)] lg:min-h-[min(32rem,75vh)] relative z-10"

  if (loading) {
    return (
      <Card className={panelClass}>
        <CardContent className="p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center flex-1 min-h-[min(24rem,60vh)]">
          <Loader2 className="h-7 w-7 sm:h-8 sm:w-8 animate-spin text-indigo-600 mb-3 sm:mb-4" />
          <p className="text-xs sm:text-sm text-slate-500">Loading client details...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={panelClass}>
      <CardContent className="relative p-4 sm:p-5 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-5 flex-1 flex flex-col min-h-0">
        {onViewProfile ? (
          <div className="flex justify-end shrink-0">
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={onViewProfile}>
              <User className="h-3.5 w-3.5 mr-1.5" />
              View Profile
            </Button>
          </div>
        ) : null}
        {membershipData?.subscription?.expiryDate && (
          <span
            className={cn(
              "absolute right-4 sm:right-5 lg:right-6 text-xs text-slate-500",
              onViewProfile ? "top-12 sm:top-14 lg:top-16" : "top-4 sm:top-5 lg:top-6"
            )}
          >
            Valid till {format(new Date(membershipData.subscription.expiryDate), "dd MMM yyyy")}
          </span>
        )}
        {/* Profile photo (avatar / initial) */}
        <div className="flex justify-center shrink-0">
          <Avatar
            className={cn(
              "h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24 rounded-full",
              membershipData?.plan?.planName?.toLowerCase().includes("gold")
                ? "border-0 bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-200 ring-4 ring-amber-200/70 shadow-[0_0_20px_rgba(251,191,36,0.3)]"
                : "border-2 sm:border-4 border-indigo-100 bg-gradient-to-br from-indigo-100 to-purple-100"
            )}
          >
            <AvatarFallback
              className={cn(
                "text-xl sm:text-2xl lg:text-3xl font-bold bg-transparent",
                membershipData?.plan?.planName?.toLowerCase().includes("gold")
                  ? "text-amber-700"
                  : "text-indigo-700"
              )}
            >
              {initial}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="text-center space-y-1 sm:space-y-1.5 shrink-0">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <p className="font-semibold text-slate-900 text-base sm:text-lg lg:text-xl truncate px-1">{displayName}</p>
            {membershipData?.subscription && membershipData?.plan && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-medium shrink-0",
                  membershipData?.plan?.planName?.toLowerCase().includes("gold")
                    ? "border-amber-300 bg-amber-50/80 text-amber-800"
                    : "border-emerald-300 bg-emerald-50/80 text-emerald-700"
                )}
              >
                {membershipData.plan.planName || "Membership"}
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-center gap-2 text-slate-600">
            <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-500 shrink-0" />
            <span className="text-sm sm:text-base font-medium truncate">{displayPhone}</span>
          </div>
        </div>

        <Separator className="shrink-0" />

        <div className="space-y-3 sm:space-y-4 shrink-0">
          <div className="flex items-center justify-between text-sm sm:text-base">
            <span className="text-slate-600 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              Total visits
            </span>
            <Badge variant="secondary" className="font-semibold text-xs sm:text-sm px-2 sm:px-2.5 py-0.5">
              {totalVisits}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-sm sm:text-base">
            <span className="text-slate-600 flex items-center gap-2">
              <Receipt className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-500 shrink-0" />
              Total revenue
            </span>
            <span className="font-semibold text-slate-900 truncate ml-2">{formatAmount(totalRevenue)}</span>
          </div>
          {duesUnpaid > 0 ? (
            <button
              type="button"
              onClick={() => {
                void openDuesListDialog()
              }}
              disabled={duesDialogLoading || !String(displayPhone || "").trim()}
              title={
                !String(displayPhone || "").trim()
                  ? "Add a phone number to this client to collect dues"
                  : "Collect payment toward unpaid bills"
              }
              className="flex w-full items-center justify-between rounded-lg text-sm sm:text-base text-left transition-colors hover:bg-amber-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 -mx-1 px-1 py-0.5 sm:-mx-1.5 sm:px-1.5 min-h-[2.25rem] disabled:opacity-50 disabled:pointer-events-none"
            >
              <span className="text-slate-600 flex items-center gap-2 min-w-0">
                <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 shrink-0" aria-hidden />
                <span className="min-w-0">Dues / Unpaid</span>
                {duesDialogLoading ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-600" aria-hidden />
                ) : null}
              </span>
              <span className="font-semibold text-amber-600 truncate ml-2 tabular-nums">{formatAmount(duesUnpaid)}</span>
            </button>
          ) : (
            <div className="flex items-center justify-between text-sm sm:text-base">
              <span className="text-slate-600 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 shrink-0" />
                Dues / Unpaid
              </span>
              <span className="font-semibold text-slate-700">{formatAmount(duesUnpaid)}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => void openClientWalletLedger()}
            title="View wallet activity"
            className="flex w-full items-center justify-between rounded-lg text-sm sm:text-base text-left transition-colors hover:bg-slate-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 -mx-1 px-1 py-0.5 sm:-mx-1.5 sm:px-1.5 min-h-[2.25rem]"
          >
            <span className="text-slate-600 flex items-center gap-2">
              <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-500 shrink-0" aria-hidden />
              Wallet balance
            </span>
            <span className="font-semibold text-slate-900 truncate ml-2 tabular-nums">
              {formatAmount(totalPrepaidWalletBalance)}
            </span>
          </button>
          <div className="flex items-center justify-between text-sm sm:text-base">
            <span className="text-slate-600 flex items-center gap-2">
              <Gift className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-500 shrink-0" aria-hidden />
              Reward points
            </span>
            <span className="font-semibold text-slate-900 tabular-nums shrink-0">
              {rewardSummary?.balance ?? client.rewardPointsBalance ?? 0}
              <span className="text-xs font-medium text-slate-500 ml-1">pts</span>
            </span>
          </div>
        </div>

        <Separator className="shrink-0" />

        <div
          className={cn(
            "rounded-xl border p-3 sm:p-4 shrink-0 transition-colors",
            customerNotes.length > 0
              ? "border-amber-400/60 bg-gradient-to-br from-amber-50/90 to-orange-50/40 shadow-sm ring-1 ring-amber-200/50"
              : "border-slate-200/70 bg-slate-50/40"
          )}
        >
          <Collapsible
            open={customerNotesOpen}
            onOpenChange={setCustomerNotesOpen}
            className="flex flex-col min-h-0"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "w-full text-left flex items-center justify-between gap-2 shrink-0 rounded-lg px-0.5 py-1 transition-colors",
                  customerNotes.length > 0 ? "hover:bg-amber-100/40" : "hover:bg-slate-100/60"
                )}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm sm:text-base font-semibold text-slate-900">
                    <MessageSquare
                      className={cn(
                        "h-4 w-4 sm:h-5 sm:w-5 shrink-0",
                        customerNotes.length > 0 ? "text-amber-700" : "text-slate-500"
                      )}
                    />
                    Past notes
                    {customerNotes.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="bg-amber-200/80 text-amber-950 text-[10px] sm:text-xs font-semibold border-amber-300/60"
                      >
                        {customerNotes.length}
                      </Badge>
                    )}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-600 shrink-0 transition-transform ${customerNotesOpen ? "rotate-180" : ""}`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col min-h-0 data-[state=closed]:hidden pt-2">
              {loadingNotes && (
                <div className="flex items-center gap-2 py-2 text-xs text-slate-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  Loading appointment notes…
                </div>
              )}
              {customerNotes.length === 0 && !loadingNotes ? (
                <p className="text-xs sm:text-sm text-slate-600 shrink-0">No notes yet.</p>
              ) : (
                <ul className="space-y-2.5 flex-1 min-h-0 overflow-y-auto pr-0.5 max-h-56 sm:max-h-72">
                  {customerNotes.map((note) => (
                    <li key={note.id}>
                      <Link
                        href={note.href}
                        className="block rounded-lg border border-white/80 bg-white/90 hover:bg-white p-2.5 sm:p-3 transition-colors text-left shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="text-[10px] sm:text-xs font-medium text-slate-500">
                            {format(new Date(note.createdAt), "dd MMM yyyy, HH:mm")}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                            {note.source === "appointment" ? "Appointment" : "Bill / sale"}
                          </Badge>
                          {note.staffName && (
                            <span className="text-[10px] sm:text-xs text-slate-600">• {note.staffName}</span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-slate-900 whitespace-pre-wrap break-words leading-relaxed">
                          {note.content}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>

        <Separator className="shrink-0" />

        <Collapsible open={membershipsOpen} onOpenChange={setMembershipsOpen} className="flex flex-col min-h-0 shrink-0">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full text-left text-xs sm:text-sm font-semibold text-slate-600 mb-2 sm:mb-3 flex items-center justify-between gap-1.5 shrink-0 hover:bg-slate-50 rounded-lg px-1 py-0.5 -mx-1 transition-colors"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-indigo-500" />
                Memberships
                <span className="font-normal text-slate-500">
                  ({activeMembershipPlanName !== "NA" ? 1 : 0})
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-500 transition-transform shrink-0 ${membershipsOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col min-h-0 data-[state=closed]:hidden">
            {activeMembershipPlanName === "NA" ? (
              <p className="text-xs sm:text-sm text-slate-500 mb-1">No active membership</p>
            ) : (
              <button
                type="button"
                onClick={() => setMembershipCardOpen(v => !v)}
                className={cn(
                  "w-full text-left rounded-lg border px-2.5 py-2 sm:px-3 sm:py-2.5 transition-colors",
                  membershipData?.plan?.planName?.toLowerCase().includes("gold")
                    ? "border-amber-200/80 bg-amber-50/50 hover:bg-amber-50/80"
                    : "border-slate-200/80 bg-slate-50/60 hover:bg-slate-50/90"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs sm:text-sm font-medium text-slate-900 truncate min-w-0">
                    {membershipData?.plan?.planName || activeMembershipPlanName}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] sm:text-xs",
                        membershipData?.plan?.planName?.toLowerCase().includes("gold")
                          ? "border-amber-300 bg-amber-50/80 text-amber-800"
                          : "border-emerald-300 bg-emerald-50/80 text-emerald-700"
                      )}
                    >
                      Active
                    </Badge>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-slate-500 transition-transform",
                        membershipCardOpen ? "rotate-180" : ""
                      )}
                    />
                  </div>
                </div>
                {membershipData?.subscription?.expiryDate && (
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-1">
                    Valid till {format(new Date(membershipData.subscription.expiryDate), "dd MMM yyyy")}
                  </p>
                )}
                {membershipCardOpen && (
                  <div
                    className={cn(
                      "mt-3 pt-3 space-y-2.5 border-t",
                      membershipData?.plan?.planName?.toLowerCase().includes("gold")
                        ? "border-amber-200/70"
                        : "border-slate-200/80"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                      <span className="text-slate-600">Free services remaining</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {freeServicesRemainingDisplay}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                      <span className="text-slate-600">Total saved via memberships</span>
                      <span className="font-semibold text-slate-900 tabular-nums truncate">
                        {formatAmount(Number((membershipData as { totalSavedViaMembership?: number })?.totalSavedViaMembership) || 0)}
                      </span>
                    </div>
                  </div>
                )}
              </button>
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator className="shrink-0" />

        <Collapsible
          open={prepaidWalletOpen}
          onOpenChange={setPrepaidWalletOpen}
          className="flex flex-col min-h-0 shrink-0"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full text-left text-xs sm:text-sm font-semibold text-slate-600 mb-2 sm:mb-3 flex items-center justify-between gap-1.5 shrink-0 hover:bg-slate-50 rounded-lg px-1 py-0.5 -mx-1 transition-colors"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-indigo-500" />
                Prepaid Wallet
                <span className="font-normal text-slate-500">({prepaidWallets.length})</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-500 transition-transform shrink-0 ${prepaidWalletOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col min-h-0 data-[state=closed]:hidden">
            {prepaidWallets.length === 0 ? (
              <p className="text-xs sm:text-sm text-slate-500 mb-1">No prepaid wallet</p>
            ) : (
              <ul className="space-y-2 mb-1">
                {prepaidWallets.map((w) => {
                  const wid = String(w._id || w.id)
                  const planName = getPrepaidPlanDisplayName(w)
                  const purchaseDate = getPrepaidWalletPurchaseDate(w)
                  const status = String(w.status || "").toLowerCase()
                  return (
                    <li
                      key={wid}
                      className="rounded-lg border border-slate-200/80 bg-slate-50/60 px-2.5 py-2 sm:px-3 sm:py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs sm:text-sm font-medium text-slate-900 truncate min-w-0">{planName}</p>
                        {status === "active" ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] sm:text-xs shrink-0 border-emerald-300 bg-emerald-50/80 text-emerald-700"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] sm:text-xs shrink-0 capitalize text-slate-600">
                            {status || "—"}
                          </Badge>
                        )}
                      </div>
                      {purchaseDate && (
                        <p className="text-[10px] sm:text-xs text-slate-500 mt-1">
                          Date: {format(purchaseDate, "dd MMM yyyy")}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>

        {redeemablePackages.length > 0 && (
          <>
            <Separator className="shrink-0" />
            <Collapsible open={packagesOpen} onOpenChange={setPackagesOpen} className="flex flex-col min-h-0 shrink-0">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full text-left text-xs sm:text-sm font-semibold text-slate-600 mb-2 sm:mb-3 flex items-center justify-between gap-1.5 shrink-0 hover:bg-slate-50 rounded-lg px-1 py-0.5 -mx-1 transition-colors"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-indigo-500" />
                    Packages
                    <span className="font-normal text-slate-500">({redeemablePackages.length})</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-500 transition-transform shrink-0 ${packagesOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col min-h-0 data-[state=closed]:hidden">
                <ul className="space-y-2 mb-1">
                  {redeemablePackages.map(cp => {
                    const cpKey = String(cp._id || cp.id)
                    const pkgRefId = cp.package_id?._id || cp.package_id
                    const pkgKey = pkgRefId ? String(pkgRefId) : ""
                    const detail = pkgKey ? packageDetailByPackageId[pkgKey] : null
                    const pkgLoading = Boolean(pkgKey && loadingPackageDetailId === pkgKey)
                    const historyLoading = loadingRedemptionHistoryCpId === cpKey
                    const sectionLoading = pkgLoading || historyLoading
                    const expanded = expandedClientPkgId === cpKey
                    return (
                      <li
                        key={cpKey}
                        className="rounded-lg border border-slate-200/80 bg-slate-50/60 overflow-hidden"
                      >
                        <button
                          type="button"
                          className="w-full text-left px-2.5 py-2 sm:px-3 sm:py-2.5 flex items-start justify-between gap-2 hover:bg-slate-100/80 transition-colors"
                          onClick={async () => {
                            if (expanded) {
                              setExpandedClientPkgId(null)
                              return
                            }
                            setExpandedClientPkgId(cpKey)
                            const cpMongoId = String(cp._id || cp.id)
                            const tasks: Promise<unknown>[] = [
                              loadRedemptionHistoryForClientPackage(cpMongoId),
                            ]
                            if (pkgRefId) tasks.push(ensurePackageDetail(String(pkgRefId)))
                            await Promise.all(tasks)
                          }}
                        >
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                              {cp.package_id?.name || "Package"}
                            </p>
                            {cp.expiry_date && (
                              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
                                Valid till {format(new Date(cp.expiry_date), "dd MMM yyyy")}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">
                              {cp.remaining_sittings ?? 0} left
                            </Badge>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 text-slate-500 transition-transform shrink-0",
                                expanded ? "rotate-180" : ""
                              )}
                            />
                          </div>
                        </button>
                        {expanded && (
                          <div className="border-t border-slate-200/80 px-2 pb-2 sm:px-3 bg-white/50">
                            {sectionLoading && (
                              <div className="flex items-center gap-2 py-3 text-xs text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                                Loading services…
                              </div>
                            )}
                            {!sectionLoading &&
                              detail &&
                              Array.isArray(detail.services) &&
                              detail.services.length > 0 && (
                                <ul className="space-y-1.5 pt-2">
                                  {detail.services.map((row: any, idx: number) => {
                                    const svcId = getPackageServiceRowId(row)
                                    const svcName = row.service_id?.name || "Service"
                                    if (!svcId) return null
                                    const redeemedIds =
                                      redeemedServiceIdsByClientPackageId[cpKey] || new Set<string>()
                                    const isRedeemed = redeemedIds.has(svcId)
                                    const noSittings = (cp.remaining_sittings ?? 0) <= 0
                                    return (
                                      <li
                                        key={`${svcId}-${idx}`}
                                        className={cn(
                                          "flex items-center justify-between gap-2 pl-0.5",
                                          isRedeemed && "opacity-60"
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "text-[11px] sm:text-xs truncate min-w-0",
                                            isRedeemed ? "text-slate-400" : "text-slate-800"
                                          )}
                                        >
                                          {svcName}
                                        </span>
                                        <Button
                                          type="button"
                                          variant={isRedeemed ? "secondary" : "outline"}
                                          size="sm"
                                          className={cn(
                                            "h-7 px-2 text-[10px] sm:text-xs shrink-0",
                                            isRedeemed && "text-slate-500"
                                          )}
                                          disabled={isRedeemed || noSittings}
                                          onClick={e =>
                                            detail && openPackageRedeemDialog(e, cp, detail, svcId)
                                          }
                                        >
                                          {isRedeemed ? "Redeemed" : "Redeem"}
                                        </Button>
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                            {!sectionLoading &&
                              detail &&
                              (!detail.services || detail.services.length === 0) && (
                                <p className="text-[11px] sm:text-xs text-slate-500 py-2">
                                  No services linked to this package.
                                </p>
                              )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        <Separator className="shrink-0" />

        <Collapsible open={billActivityOpen} onOpenChange={setBillActivityOpen} className="flex flex-col min-h-0 flex-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full text-left text-xs sm:text-sm font-semibold text-slate-600 mb-2 sm:mb-3 flex items-center justify-between gap-1.5 shrink-0 hover:bg-slate-50 rounded-lg px-1 py-0.5 -mx-1 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                Bill activity
                {bills.length > 0 && (
                  <span className="font-normal text-slate-500">({bills.length} bill{bills.length !== 1 ? "s" : ""})</span>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform shrink-0 ${billActivityOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col min-h-0 flex-1 data-[state=closed]:hidden">
          {bills.length === 0 ? (
            <p className="text-xs sm:text-sm text-slate-500 shrink-0">No bills yet</p>
          ) : (
            <>
              <ul className="space-y-1.5 sm:space-y-2 flex-1 min-h-0 overflow-y-auto pr-0.5 sm:pr-1">
                {visibleBills.map((s: any) => {
                  const billKey = (s._id || s.id) as string
                  const items: Array<{ name: string; type: string; quantity: number; price: number; total: number }> =
                    Array.isArray(s?.items) ? s.items : []
                  const isExpanded = expandedBillId === billKey
                  const ptsEarned = Math.floor(Number(s?.loyaltyPointsEarned) || 0)
                  const ptsRedeemed = Math.floor(Number(s?.loyaltyPointsRedeemed) || 0)
                  return (
                    <Collapsible
                      key={billKey}
                      open={isExpanded}
                      onOpenChange={(open) => setExpandedBillId(open ? billKey : null)}
                    >
                      <li className="bg-slate-50 rounded-lg overflow-hidden shrink-0">
                        <div className="flex items-center justify-between text-left text-xs sm:text-sm px-2.5 py-1.5 sm:px-3 sm:py-2">
                          <Link
                            href={`/receipt/${encodeURIComponent(s.billNo || "")}?returnTo=${encodeURIComponent(`/clients/${client?._id || client?.id || ""}`)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate font-medium text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none focus:underline"
                          >
                            {s.billNo || "—"}
                          </Link>
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center gap-1.5 shrink-0 ml-2 hover:bg-slate-100 rounded transition-colors px-1 -mx-1"
                            >
                              {ptsEarned > 0 && (
                                <span className="text-xs font-semibold text-emerald-700 tabular-nums">+{ptsEarned}</span>
                              )}
                              {ptsRedeemed > 0 && (
                                <span className="text-xs font-semibold text-rose-700 tabular-nums">−{ptsRedeemed}</span>
                              )}
                              <span className="font-medium text-slate-800">
                                {formatAmount(Number(s?.grossTotal) || Number(s?.netTotal) || 0)}
                              </span>
                              {items.length > 0 && (
                                <ChevronDown
                                  className={`h-3.5 w-3.5 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                />
                              )}
                            </button>
                          </CollapsibleTrigger>
                        </div>
                        {items.length > 0 && (
                          <CollapsibleContent>
                            <div className="border-t border-slate-200/80 bg-white/60 px-2.5 py-2 sm:px-3 sm:py-2.5">
                              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 sm:mb-2">
                                Services & products
                              </p>
                              <ul className="space-y-1 sm:space-y-1.5">
                                {items.map((item: any, idx: number) => (
                                  <li
                                    key={idx}
                                    className="flex items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-700"
                                  >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      {item.type === "service" ? (
                                        <Scissors className="h-3 w-3 text-indigo-500 shrink-0" />
                                      ) : (
                                        <Package className="h-3 w-3 text-emerald-500 shrink-0" />
                                      )}
                                      <span className="truncate">{item.name || "—"}</span>
                                      <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 capitalize">
                                        {item.type === "service" ? "Service" : "Product"}
                                      </Badge>
                                    </span>
                                    <span className="shrink-0 font-medium text-slate-800">
                                      {item.quantity > 1
                                        ? `${item.quantity} × ${formatAmount(Number(item.price) || 0)} = ${formatAmount(Number(item.total) || 0)}`
                                        : formatAmount(Number(item.total) || 0)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </CollapsibleContent>
                        )}
                      </li>
                    </Collapsible>
                  )
                })}
              </ul>
              {hasMoreBills ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 rounded-lg shrink-0 text-xs sm:text-sm"
                  onClick={() => setShowAllBills((v) => !v)}
                >
                  {showAllBills ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5 mr-1 shrink-0" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5 mr-1 shrink-0" />
                      Show Bill Activity
                    </>
                  )}
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm" className="w-full mt-2 rounded-lg shrink-0 text-xs sm:text-sm">
                  <Link href={`/clients/${clientId}`}>Show Bill Activity</Link>
                </Button>
              )}
            </>
          )}
          </CollapsibleContent>
        </Collapsible>

        <Dialog
          open={redeemDialogOpen}
          onOpenChange={o => {
            setRedeemDialogOpen(o)
            if (!o) setRedeemContext(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Choose services for Quick Sale</DialogTitle>
              <DialogDescription asChild>
                <div className="text-sm text-slate-600 pt-1 space-y-2">
                  {redeemContext && (
                    <>
                      <p>
                        Open Quick Sale with{" "}
                        <span className="font-medium text-slate-800">
                          {redeemContext.clientPackage.package_id?.name || "Package"}
                        </span>{" "}
                        for <span className="font-medium text-slate-800">{displayName}</span>. Services are
                        billed at ₹0 (prepaid). Staff defaults to whoever sold the package when available.
                      </p>
                      <p className="text-xs text-slate-500">
                        Select at least {redeemContext.packageDetail.min_service_count} services per sitting,
                        then continue to Quick Sale to complete the bill and redeem the sitting.
                      </p>
                    </>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            {redeemContext && (
              <div className="space-y-2 max-h-[min(50vh,16rem)] overflow-y-auto pr-1">
                {(() => {
                  const rows = redeemContext.packageDetail.services || []
                  const cpModalKey = String(
                    redeemContext.clientPackage._id || redeemContext.clientPackage.id
                  )
                  const redeemedModal =
                    redeemedServiceIdsByClientPackageId[cpModalKey] || new Set<string>()
                  return rows.map((row: any) => {
                    const id = getPackageServiceRowId(row)
                    if (!id) return null
                    const name = row.service_id?.name || "Service"
                    const isRedeemedRow = redeemedModal.has(id)
                    return (
                      <label
                        key={id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm",
                          isRedeemedRow
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer"
                        )}
                      >
                        <Checkbox
                          disabled={isRedeemedRow}
                          checked={redeemSelectedIds.has(id)}
                          onCheckedChange={() => toggleRedeemServiceId(id)}
                        />
                        <span
                          className={cn(
                            "flex-1",
                            isRedeemedRow ? "text-slate-400" : "text-slate-800"
                          )}
                        >
                          {name}
                        </span>
                      </label>
                    )
                  })
                })()}
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRedeemDialogOpen(false)
                  setRedeemContext(null)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={continueToQuickSaleForPackage}
                disabled={
                  !redeemContext ||
                  redeemSelectedIds.size < (Number(redeemContext?.packageDetail?.min_service_count) || 1)
                }
              >
                Continue to Quick Sale
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </CardContent>
    </Card>

      <Dialog open={walletLedgerOpen} onOpenChange={setWalletLedgerOpen}>
        <DialogContent
          overlayClassName="z-[109]"
          className="max-w-3xl gap-0 overflow-hidden p-0 z-[110] flex max-h-[min(85vh,48rem)] flex-col sm:max-w-3xl">
          <DialogHeader className="shrink-0 flex-row flex-wrap items-start justify-between gap-3 space-y-0 border-b px-5 py-4 text-left sm:text-left">
            <div className="min-w-0 space-y-1">
              <DialogTitle>Wallet activity</DialogTitle>
              <DialogDescription>{displayName}</DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setWalletLedgerOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {walletLedgerLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <span className="text-sm">Loading transactions…</span>
              </div>
            ) : walletLedgerRows.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">No wallet transactions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Bill / receipt</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {walletLedgerRows.map((row) => {
                    const st = walletActivityStatusDisplay(row.statusLabel)
                    return (
                    <TableRow key={row._id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(row.createdAt), "dd MMM yyyy, h:mm a")}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium text-gray-900">
                          {row.billNo ? `#${row.billNo}` : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">{row.walletPlan}</div>
                        {row.description ? (
                          <div className="text-xs text-muted-foreground mt-0.5">{row.description}</div>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-sm font-semibold tabular-nums",
                          st === "Debit" && "text-red-700",
                          st === "Credit" && "text-emerald-700"
                        )}
                      >
                        {st === "Debit"
                          ? `−${formatAmount(row.amount)}`
                          : `+${formatAmount(row.amount)}`}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-medium",
                            st === "Debit" &&
                              "border-red-200 bg-red-50 text-red-800",
                            st === "Credit" &&
                              "border-emerald-200 bg-emerald-50 text-emerald-800"
                          )}
                        >
                          {st}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={duesListDialogOpen} onOpenChange={setDuesListDialogOpen}>
        <SheetContent
          side="right"
          overlayClassName="z-[135]"
          className={cn(
            "z-[135] flex h-full max-h-[100dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl",
          )}
        >
          <div className="shrink-0 border-b px-6 pb-4 pt-6 pr-14">
            <SheetHeader className="space-y-1.5 p-0 text-left">
              <SheetTitle className="text-xl font-bold text-slate-900">Settle Dues — {displayName}</SheetTitle>
              <SheetDescription className="text-sm text-slate-600">
                Unpaid and partially paid invoices. Choose one to collect payment.
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {duesDialogLoading && duesDialogBills.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-slate-600">
                <Loader2 className="h-8 w-8 shrink-0 animate-spin text-indigo-500" aria-hidden />
                Loading bills…
              </div>
            ) : duesDialogBills.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-500">
                <CreditCard className="h-12 w-12 text-slate-300" aria-hidden />
                <p className="text-sm">No pending bills found.</p>
              </div>
            ) : (
              <div className="space-y-4 pb-2">
                <div className="rounded-lg border border-red-200 bg-red-50/90 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
                      <span className="font-semibold text-red-900">Total outstanding</span>
                    </div>
                    <span className="text-xl font-bold tabular-nums text-red-600 sm:text-2xl">
                      {formatAmount(
                        duesDialogBills.reduce((sum, bill) => sum + (Number(bill.remainingAmount) || 0), 0)
                      )}
                    </span>
                  </div>
                </div>
                {duesDialogBills.map((bill) => {
                  const paid = Number(bill.paidAmount) || 0
                  const isPartial = paid > 0.02
                  return (
                    <div
                      key={String(bill.id)}
                      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50/80"
                    >
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">Bill #{bill.billNo}</h3>
                          <p className="text-sm text-slate-600">
                            {bill.date
                              ? `${format(new Date(bill.date), "dd MMM yyyy")} at ${String(bill.time || "00:00")}`
                              : "—"}
                          </p>
                          <p className="text-sm text-slate-600">Staff: {bill.staffName}</p>
                        </div>
                        <Badge variant={isPartial ? "secondary" : "destructive"}>
                          {isPartial ? "Partial" : "Unpaid"}
                        </Badge>
                      </div>
                      <div className="mb-3 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-slate-600">Total amount</p>
                          <p className="text-lg font-semibold tabular-nums text-slate-900">
                            {formatAmount(Number(bill.totalAmount) || 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600">Paid amount</p>
                          <p className="text-lg font-semibold tabular-nums text-emerald-700">
                            {formatAmount(paid)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600">Remaining</p>
                          <p className="text-lg font-bold tabular-nums text-red-600">
                            {formatAmount(Number(bill.remainingAmount) || 0)}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={duesDialogLoading}
                        onClick={() => void handleCollectPaymentFromDuesList(bill)}
                      >
                        <CreditCard className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                        Collect payment
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <PaymentCollectionModal
        isOpen={collectDuesOpen}
        presentation="sheet"
        onClose={closeCollectDuesSheet}
        sale={collectDuesSale}
        onPaymentCollected={handleDuesPaymentCollected}
        exitAfterPaymentSuccess={false}
        nestedChromeZClassName="z-[135]"
      />
    </>
  )
}
