"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Lottie from "lottie-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/loading"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { SalesAPI } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Receipt, CreditCard, DollarSign, Clock, AlertCircle, Loader2 } from "lucide-react"

interface PaymentCollectionModalProps {
  isOpen: boolean
  onClose: () => void
  sale: any
  onPaymentCollected: () => void
  /** Use a side sheet instead of a centered dialog (e.g. Pay Now from appointment). */
  presentation?: "dialog" | "sheet"
  /**
   * When true, dismiss the modal after the success step (including partial payments).
   * Default false keeps the modal open so another partial can be collected (reports / Quick Sale).
   */
  exitAfterPaymentSuccess?: boolean
  /** Overlay + sheet z-index when parent UI stacks above default z-[100] (e.g. client panel in another sheet). */
  nestedChromeZClassName?: string
}

export function PaymentCollectionModal({
  isOpen,
  onClose,
  sale,
  onPaymentCollected,
  presentation = "dialog",
  exitAfterPaymentSuccess = false,
  nestedChromeZClassName,
}: PaymentCollectionModalProps) {
  const { toast } = useToast()
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [notes, setNotes] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [paymentSummary, setPaymentSummary] = useState<any>(null)
  const [paymentSuccessLottie, setPaymentSuccessLottie] = useState<Record<string, unknown> | null>(null)
  const [paymentJustSucceeded, setPaymentJustSucceeded] = useState(false)
  const [successClosesSheet, setSuccessClosesSheet] = useState(false)
  const finishSuccessOnceRef = useRef(false)
  const closeAfterSuccessLottieRef = useRef(false)

  const loadPaymentSummary = useCallback(async () => {
    if (!sale?._id) return

    try {
      const response = await SalesAPI.getPaymentSummary(sale._id)
      if (response.success) {
        setPaymentSummary(response.data)
      }
    } catch (error) {
      console.error("Error loading payment summary:", error)
    }
  }, [sale])

  useEffect(() => {
    if (!isOpen) {
      setPaymentJustSucceeded(false)
      setSuccessClosesSheet(false)
      finishSuccessOnceRef.current = false
      closeAfterSuccessLottieRef.current = false
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    fetch("/lottie/payment-success.json")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPaymentSuccessLottie(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (sale && isOpen && !paymentJustSucceeded) {
      void loadPaymentSummary()
      // Set default payment amount to remaining balance
      if (sale.paymentStatus?.remainingAmount) {
        setPaymentAmount(sale.paymentStatus.remainingAmount.toString())
      }
    }
  }, [sale, isOpen, paymentJustSucceeded, loadPaymentSummary])

  const finishSuccessLottie = useCallback(() => {
    if (finishSuccessOnceRef.current) return
    finishSuccessOnceRef.current = true
    const shouldClose = closeAfterSuccessLottieRef.current
    closeAfterSuccessLottieRef.current = false
    setPaymentJustSucceeded(false)
    setSuccessClosesSheet(false)
    if (shouldClose || exitAfterPaymentSuccess) onClose()
    queueMicrotask(() => {
      finishSuccessOnceRef.current = false
    })
  }, [onClose, exitAfterPaymentSuccess])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!paymentAmount || !paymentMethod) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    const amount = parseFloat(paymentAmount)
    if (amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Payment amount must be greater than 0",
        variant: "destructive",
      })
      return
    }

    if (amount > (sale.paymentStatus?.remainingAmount || sale.grossTotal)) {
      toast({
        title: "Invalid Amount",
        description: "Payment amount cannot exceed remaining balance",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await SalesAPI.addPayment(sale._id, {
        amount,
        method: paymentMethod,
        notes,
        collectedBy: "Staff" // This could be enhanced to get actual staff name
      })

      if (response.success) {
        toast({
          title: "Payment Collected",
          description: response.message || `Payment of ₹${amount} collected successfully`,
        })

        setPaymentAmount("")
        setPaymentMethod("")
        setNotes("")

        await loadPaymentSummary()
        onPaymentCollected()

        const ps = (response as any).paymentSummary
        const priorRemaining = Number(sale.paymentStatus?.remainingAmount ?? sale.grossTotal ?? 0) || 0
        const hadFullPayment =
          (ps?.remainingAmount !== undefined && Number(ps.remainingAmount) === 0) ||
          amount >= priorRemaining

        closeAfterSuccessLottieRef.current = hadFullPayment
        setSuccessClosesSheet(hadFullPayment)
        setPaymentJustSucceeded(true)
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to collect payment",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error collecting payment:', error)
      toast({
        title: "Error",
        description: "Failed to collect payment. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Completed</Badge>
      case "partial":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Partial</Badge>
      case "unpaid":
        return <Badge className="bg-red-100 text-red-800 border-red-200">Unpaid</Badge>
      case "overdue":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Overdue</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-800 border-gray-200">{status}</Badge>
    }
  }

  const getPaymentMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case 'cash':
        return <DollarSign className="h-4 w-4" />
      case 'card':
        return <CreditCard className="h-4 w-4" />
      case 'online':
        return <Receipt className="h-4 w-4" />
      default:
        return <DollarSign className="h-4 w-4" />
    }
  }

  if (!sale) return null

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose()
  }

  const titleClass = "flex items-center gap-2"
  const titleInner = (
    <>
      <Receipt className="h-5 w-5 text-blue-600" />
      Collect Payment - {sale.billNo}
    </>
  )
  const descriptionText = `Collect payment for ${sale.customerName}'s bill`

  const successSections = (
    <div className="flex shrink-0 flex-col items-center justify-center gap-4 py-2">
      {paymentSuccessLottie ? (
        <div className="relative w-full max-w-[280px] shrink-0">
          <Lottie
            animationData={paymentSuccessLottie}
            loop={false}
            className="w-full"
            onComplete={() => {
              if (closeAfterSuccessLottieRef.current) finishSuccessLottie()
            }}
          />
        </div>
      ) : (
        <Loader2 className="h-10 w-10 shrink-0 animate-spin text-blue-600" aria-hidden />
      )}
      <p className="text-center text-sm font-semibold text-slate-800">Payment successful</p>
    </div>
  )

  const mainSections = (
    <div className="space-y-6">
          {/* Bill Summary */}
          <div className="bg-slate-50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Bill Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-600">Customer:</span>
                <span className="ml-2 font-medium">{sale.customerName}</span>
              </div>
              <div>
                <span className="text-slate-600">Date:</span>
                <span className="ml-2 font-medium">{new Date(sale.date).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-slate-600">Total Amount:</span>
                <span className="ml-2 font-medium text-green-700">₹{sale.grossTotal?.toFixed(2) || '0.00'}</span>
              </div>
              <div>
                <span className="text-slate-600">Status:</span>
                <span className="ml-2">{getStatusBadge(sale.status)}</span>
              </div>
            </div>
          </div>

          {/* Payment Status */}
          {paymentSummary && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Payment Status
              </h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-700">
                    ₹{paymentSummary.totalAmount?.toFixed(2) || '0.00'}
                  </div>
                  <div className="text-blue-600 text-xs">Total Amount</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700">
                    ₹{paymentSummary.paidAmount?.toFixed(2) || '0.00'}
                  </div>
                  <div className="text-green-600 text-xs">Paid Amount</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-700">
                    ₹{paymentSummary.remainingAmount?.toFixed(2) || '0.00'}
                  </div>
                  <div className="text-red-600 text-xs">Remaining</div>
                </div>
              </div>
              {paymentSummary.isOverdue && (
                <div className="mt-3 flex items-center gap-2 text-orange-700 bg-orange-100 p-2 rounded">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Payment is overdue</span>
                </div>
              )}
            </div>
          )}

          {/* Payment Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentAmount">Payment Amount *</Label>
                <Input
                  id="paymentAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={sale.paymentStatus?.remainingAmount || sale.grossTotal}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full"
                />
                <div className="text-xs text-slate-500">
                  Max: ₹{sale.paymentStatus?.remainingAmount?.toFixed(2) || sale.grossTotal?.toFixed(2) || '0.00'}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod} modal={false}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent className="z-[210]">
                    <SelectItem value="Cash">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Cash
                      </div>
                    </SelectItem>
                    <SelectItem value="Card">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Card
                      </div>
                    </SelectItem>
                    <SelectItem value="Online">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4" />
                        Online
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this payment..."
                rows={3}
              />
            </div>
          </form>

          {/* Payment History */}
          {sale.paymentHistory && sale.paymentHistory.length > 0 && (
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-800 mb-3">Payment History</h3>
              <div className="space-y-2">
                {sale.paymentHistory.map((payment: any, index: number) => (
                  <div key={index} className="flex items-center justify-between bg-white p-3 rounded border">
                    <div className="flex items-center gap-3">
                      {getPaymentMethodIcon(payment.method)}
                      <div>
                        <div className="font-medium text-slate-800">
                          ₹{payment.amount?.toFixed(2)} via {payment.method}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(payment.date).toLocaleDateString()} - {payment.collectedBy}
                        </div>
                      </div>
                    </div>
                    {payment.notes && (
                      <div className="text-xs text-slate-600 max-w-32 truncate" title={payment.notes}>
                        {payment.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
  )

  const scrollSections = paymentJustSucceeded ? successSections : mainSections

  const actionFooter = (
    <>
      <Button variant="outline" onClick={onClose} disabled={isLoading || paymentJustSucceeded}>
        Cancel
      </Button>
      <LoadingButton
        onClick={handleSubmit}
        loading={isLoading}
        loadingText="Collecting..."
        disabled={!paymentAmount || !paymentMethod || paymentJustSucceeded}
        className="bg-blue-600 hover:bg-blue-700"
      >
        Collect Payment
      </LoadingButton>
    </>
  )

  const successFooter = (
    <>
      {successClosesSheet ? (
        <Button type="button" variant="outline" className="sm:ml-auto" onClick={() => finishSuccessLottie()}>
          Close
        </Button>
      ) : (
        <Button type="button" className="bg-blue-600 hover:bg-blue-700 sm:ml-auto" onClick={() => finishSuccessLottie()}>
          Continue
        </Button>
      )}
    </>
  )

  const footerSection = paymentJustSucceeded ? successFooter : actionFooter

  if (presentation === "sheet") {
    const sheetZ = nestedChromeZClassName ?? "z-[100]"
    return (
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          overlayClassName={sheetZ}
          className={cn(
            sheetZ,
            "flex h-full w-full max-h-[100vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
          )}
        >
          <div className="shrink-0 border-b px-6 pb-4 pt-6">
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className={titleClass}>{titleInner}</SheetTitle>
              <SheetDescription>{descriptionText}</SheetDescription>
            </SheetHeader>
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 px-6 py-4",
              paymentJustSucceeded ? "flex flex-col justify-center overflow-y-auto" : "overflow-y-auto",
            )}
          >
            {scrollSections}
          </div>
          <SheetFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:justify-end">{footerSection}</SheetFooter>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] max-w-2xl",
          paymentJustSucceeded ? "flex flex-col gap-4 overflow-hidden" : "overflow-y-auto",
        )}
      >
        <DialogHeader className={paymentJustSucceeded ? "shrink-0" : undefined}>
          <DialogTitle className={titleClass}>{titleInner}</DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>

        {paymentJustSucceeded ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
            {scrollSections}
          </div>
        ) : (
          scrollSections
        )}

        <DialogFooter className={cn("flex gap-2", paymentJustSucceeded && "shrink-0")}>
          {footerSection}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
