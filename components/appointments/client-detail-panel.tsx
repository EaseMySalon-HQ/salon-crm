"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { User, Phone, TrendingUp, Receipt, FileText, AlertCircle, Loader2, ChevronDown, ChevronUp, Scissors, Package, MessageSquare } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ClientsAPI, SalesAPI, MembershipAPI, AppointmentsAPI } from "@/lib/api"
import type { Client } from "@/lib/client-store"
import { useCurrency } from "@/hooks/use-currency"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

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
}

export function ClientDetailPanel({ client }: ClientDetailPanelProps) {
  const { formatAmount } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [totalVisits, setTotalVisits] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [bills, setBills] = useState<any[]>([])
  const [duesUnpaid, setDuesUnpaid] = useState(0)
  const [clientDetails, setClientDetails] = useState<Client | null>(null)
  const [membershipData, setMembershipData] = useState<{ subscription: any; plan: any } | null>(null)
  const [showAllBills, setShowAllBills] = useState(false)
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null)
  const [billActivityOpen, setBillActivityOpen] = useState(false)
  const [customerNotes, setCustomerNotes] = useState<CustomerNote[]>([])
  const [customerNotesOpen, setCustomerNotesOpen] = useState(false)

  const BILLS_VISIBLE_DEFAULT = 5
  const visibleBills = showAllBills ? bills : bills.slice(0, BILLS_VISIBLE_DEFAULT)
  const hasMoreBills = bills.length > BILLS_VISIBLE_DEFAULT

  const clientId = client._id || client.id

  useEffect(() => {
    if (!clientId) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchStats() {
      setLoading(true)
      try {
        const [salesRes, appointmentsRes, clientRes, membershipRes] = await Promise.all([
          client.name ? SalesAPI.getByClient(client.name) : Promise.resolve({ success: false, data: [] as any[] }),
          AppointmentsAPI.getAll({ clientId, limit: 200 }).catch(() => ({ success: false, data: [] as any[] })),
          ClientsAPI.getById(clientId).catch(() => ({ success: false, data: null })),
          MembershipAPI.getByCustomer(clientId).catch(() => ({ success: false, data: null })),
        ])

        if (cancelled) return

        if (clientRes?.success && clientRes.data) {
          setClientDetails(clientRes.data)
        }

        if (membershipRes?.success && membershipRes.data) {
          setMembershipData(membershipRes.data as any)
        } else {
          setMembershipData(null)
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

        // Build customer notes from appointments and sales
        const appointmentsList = Array.isArray(appointmentsRes?.data) ? appointmentsRes.data : []
        const notes: CustomerNote[] = []

        appointmentsList.forEach((apt: any) => {
          const content = (apt.notes || "").trim()
          if (!content) return
          const staffName =
            apt.staffId?.name ||
            apt.staffAssignments?.[0]?.staffId?.name ||
            apt.staffAssignments?.[0]?.staffId
          const aptId = apt._id || apt.id
          notes.push({
            id: `apt-${aptId}`,
            source: "appointment",
            content,
            createdAt: apt.createdAt || apt.date || new Date().toISOString(),
            staffName: typeof staffName === "string" ? staffName : staffName?.name,
            recordId: aptId,
            href: `/appointments/new?edit=${aptId}`,
          })
        })

        salesList.forEach((s: any) => {
          const content = (s.notes || "").trim()
          if (!content) return
          const billNo = s.billNo || s._id || s.id
          notes.push({
            id: `sale-${billNo}`,
            source: "quicksale",
            content,
            createdAt: s.createdAt || s.date || new Date().toISOString(),
            staffName: s.staffName,
            recordId: billNo,
            href: `/receipt/${encodeURIComponent(billNo)}?returnTo=${encodeURIComponent(`/clients/${clientId}`)}`,
          })
        })

        notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setCustomerNotes(notes)
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
  }, [clientId, client.name])

  const displayName = clientDetails?.name ?? client.name
  const displayPhone = clientDetails?.phone ?? client.phone
  const initial = (displayName?.charAt(0) || "?").toUpperCase()

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
    <Card className={panelClass}>
      <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-slate-100 py-3 px-4 sm:py-4 sm:px-5 lg:py-5 lg:px-6 shrink-0">
        <CardTitle className="text-base sm:text-lg font-semibold text-slate-800 flex items-center gap-2">
          <User className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
          Client Details
        </CardTitle>
      </CardHeader>
      <CardContent className="relative p-4 sm:p-5 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-5 flex-1 flex flex-col min-h-0">
        {membershipData?.subscription?.expiryDate && (
          <span className="absolute top-4 right-4 sm:top-5 sm:right-5 lg:top-6 lg:right-6 text-xs text-slate-500">
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
          <div className="flex items-center justify-between text-sm sm:text-base">
            <span className="text-slate-600 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 shrink-0" />
              Dues / Unpaid
            </span>
            <span className={`font-semibold ${duesUnpaid > 0 ? "text-amber-600" : "text-slate-700"}`}>
              {formatAmount(duesUnpaid)}
            </span>
          </div>
        </div>

        <Separator className="shrink-0" />

        {/* Customer Notes */}
        <Collapsible open={customerNotesOpen} onOpenChange={setCustomerNotesOpen} className="flex flex-col min-h-0 shrink-0">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full text-left text-xs sm:text-sm font-semibold text-slate-600 mb-2 sm:mb-3 flex items-center justify-between gap-1.5 shrink-0 hover:bg-slate-50 rounded-lg px-1 py-0.5 -mx-1 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                Customer Notes
                {customerNotes.length > 0 && (
                  <span className="font-normal text-slate-500">({customerNotes.length})</span>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform shrink-0 ${customerNotesOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col min-h-0 data-[state=closed]:hidden">
            {customerNotes.length === 0 ? (
              <p className="text-xs sm:text-sm text-slate-500 shrink-0">No notes yet</p>
            ) : (
              <ul className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-0.5 sm:pr-1 max-h-40">
                {customerNotes.map((note) => (
                  <li key={note.id}>
                    <Link
                      href={note.href}
                      className="block rounded-lg border border-slate-200/80 bg-slate-50/60 hover:bg-slate-100/80 p-2.5 sm:p-3 transition-colors text-left"
                    >
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-[10px] sm:text-xs text-slate-500">
                          {format(new Date(note.createdAt), "dd MMM yyyy, HH:mm")}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 capitalize"
                        >
                          {note.source === "appointment" ? "Appointment" : "QuickSale"}
                        </Badge>
                        {note.staffName && (
                          <span className="text-[10px] sm:text-xs text-slate-600">• {note.staffName}</span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-800 line-clamp-3">{note.content}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>

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
      </CardContent>
    </Card>
  )
}
