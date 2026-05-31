"use client"

import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { CreditCard, Loader2 } from "lucide-react"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PaymentCollectionModal } from "@/components/reports/payment-collection-modal"
import { SalesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useCurrency } from "@/hooks/use-currency"
import { cn } from "@/lib/utils"

/** Unpaid/partial rows for Settle Dues list — aligned with Quick Sale `fetchUnpaidBills` mapping. */
export function mapSalesToUnpaidBillRows(sales: any[]): any[] {
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

export type SettleDuesDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientName: string
  clientPhone: string
  /** Raise overlay/panel above nested checkout shells (e.g. service checkout at z-100). */
  stackAboveAncestorChrome?: boolean
  onPaymentCollected?: () => void
}

export function SettleDuesDrawer({
  open,
  onOpenChange,
  clientName,
  clientPhone,
  stackAboveAncestorChrome = false,
  onPaymentCollected,
}: SettleDuesDrawerProps) {
  const { formatAmount } = useCurrency()
  const { toast } = useToast()
  const [bills, setBills] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)
  const [collectSale, setCollectSale] = useState<any>(null)

  const phone = String(clientPhone || "").trim()
  const displayName = String(clientName || "Client").trim() || "Client"
  const sheetZ = stackAboveAncestorChrome ? "z-[135]" : undefined
  /** Payment sheet must sit above the Settle Dues list when both are open. */
  const collectSheetZ = stackAboveAncestorChrome ? "z-[140]" : sheetZ

  const loadUnpaidBills = useCallback(async () => {
    if (!phone) return []
    const res = await SalesAPI.getByClient(phone)
    const sales = Array.isArray(res?.data) ? res.data : []
    return mapSalesToUnpaidBillRows(sales)
  }, [phone])

  useEffect(() => {
    if (!open) {
      setBills([])
      setLoading(false)
      setCollectOpen(false)
      setCollectSale(null)
      return
    }
    if (!phone) {
      toast({
        title: "Phone required",
        description: "This client needs a phone number on file to open bills and collect payment.",
        variant: "destructive",
      })
      onOpenChange(false)
      return
    }

    let cancelled = false
    setLoading(true)
    void loadUnpaidBills()
      .then((unpaid) => {
        if (cancelled) return
        setBills(unpaid)
        if (unpaid.length === 0) {
          toast({
            title: "Nothing to collect",
            description: "No unpaid bills were found. Try refreshing.",
          })
          onOpenChange(false)
        }
      })
      .catch(() => {
        if (cancelled) return
        toast({
          title: "Error",
          description: "Failed to load unpaid bills. Please try again.",
          variant: "destructive",
        })
        onOpenChange(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, phone, loadUnpaidBills, onOpenChange, toast])

  const closeCollectSheet = useCallback(() => {
    setCollectOpen(false)
    setCollectSale(null)
  }, [])

  const handleCollectPayment = useCallback(
    async (bill: any) => {
      const sid = String(bill._id || bill.id || "").trim()
      if (!sid) return
      setLoading(true)
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
          const unpaid = await loadUnpaidBills()
          setBills(unpaid)
          return
        }
        setCollectSale(res.data)
        setCollectOpen(true)
      } catch {
        toast({
          title: "Error",
          description: "Could not load the bill. Try again.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    },
    [loadUnpaidBills, toast]
  )

  const handlePaymentCollected = useCallback(async () => {
    onPaymentCollected?.()
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("appointments-refresh"))
    }
    closeCollectSheet()
    if (!phone) return
    try {
      const unpaid = await loadUnpaidBills()
      setBills(unpaid)
      if (unpaid.length === 0) {
        onOpenChange(false)
      }
    } catch {
      /* list refresh is best-effort */
    }
  }, [closeCollectSheet, loadUnpaidBills, onOpenChange, onPaymentCollected, phone])

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          overlayClassName={sheetZ}
          className={cn(
            "flex h-full max-h-[100dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl",
            sheetZ
          )}
        >
          <div className="shrink-0 border-b px-6 pb-4 pt-6 pr-14">
            <SheetHeader className="space-y-1.5 p-0 text-left">
              <SheetTitle className="text-xl font-bold text-slate-900">
                Settle Dues — {displayName}
              </SheetTitle>
              <SheetDescription className="text-sm text-slate-600">
                Unpaid and partially paid invoices. Choose one to collect payment.
              </SheetDescription>
            </SheetHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {loading && bills.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-slate-600">
                <Loader2 className="h-8 w-8 shrink-0 animate-spin text-indigo-500" aria-hidden />
                Loading bills…
              </div>
            ) : bills.length === 0 ? (
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
                        bills.reduce((sum, bill) => sum + (Number(bill.remainingAmount) || 0), 0)
                      )}
                    </span>
                  </div>
                </div>
                {bills.map((bill) => {
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
                        disabled={loading}
                        onClick={() => void handleCollectPayment(bill)}
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
        isOpen={collectOpen}
        presentation="sheet"
        onClose={closeCollectSheet}
        sale={collectSale}
        onPaymentCollected={handlePaymentCollected}
        exitAfterPaymentSuccess={false}
        nestedChromeZClassName={collectSheetZ}
      />
    </>
  )
}
