"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Calendar } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { LoadingButton } from "@/components/loading"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { format } from "date-fns"
import { CashRegistryAPI } from "@/lib/api"
import { getEndOfDayIST, getStartOfDayIST } from "@/lib/date-utils"

interface CashRegistryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveSuccess?: () => void
  onlineSalesAmount?: number
  onPosCashChange?: (amount: number) => void
}

interface CurrencyDenomination {
  value: number
  count: number
  total: number
}

interface DayRegistryEntry {
  date?: string
  openingBalance?: number
  closingBalance?: number
  shiftType?: string
  denominations?: CurrencyDenomination[]
  closingDenominations?: CurrencyDenomination[]
  posCash?: number
}

const DENOMINATION_VALUES = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const

function createEmptyDenominations(): CurrencyDenomination[] {
  return DENOMINATION_VALUES.map((value) => ({ value, count: 0, total: 0 }))
}

function mergeDenominations(saved?: CurrencyDenomination[]): CurrencyDenomination[] {
  const byValue = new Map((saved || []).map((d) => [d.value, d]))
  return DENOMINATION_VALUES.map((value) => {
    const existing = byValue.get(value)
    if (existing) {
      const count = Number(existing.count) || 0
      return { value, count, total: count * value }
    }
    return { value, count: 0, total: 0 }
  })
}

export function CashRegistryModal({
  open,
  onOpenChange,
  onSaveSuccess,
  onlineSalesAmount = 0,
  onPosCashChange,
}: CashRegistryModalProps) {
  const { user } = useAuth()
  const [date, setDate] = useState(new Date())
  const [shift, setShift] = useState<"opening" | "closing">("opening")
  const [denominations, setDenominations] = useState<CurrencyDenomination[]>(createEmptyDenominations)
  const [savedOpeningDenominations, setSavedOpeningDenominations] = useState<CurrencyDenomination[] | null>(null)
  const [dayOpeningEntry, setDayOpeningEntry] = useState<DayRegistryEntry | null>(null)
  const [dayClosingEntry, setDayClosingEntry] = useState<DayRegistryEntry | null>(null)
  const [cashCollectedOnline, setCashCollectedOnline] = useState(onlineSalesAmount)
  const [cashInPosMachine, setCashInPosMachine] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isDayStateLoading, setIsDayStateLoading] = useState(false)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [focusedCountIndex, setFocusedCountIndex] = useState<number | null>(null)
  const [isPosCashFocused, setIsPosCashFocused] = useState(false)

  const pendingClosing = useMemo(
    () =>
      Boolean(
        (dayOpeningEntry?.openingBalance ?? 0) > 0 &&
          !((dayClosingEntry?.closingBalance ?? 0) > 0)
      ),
    [dayOpeningEntry, dayClosingEntry]
  )

  const hasSavedOpening = useMemo(
    () => Boolean((dayOpeningEntry?.openingBalance ?? 0) > 0 && savedOpeningDenominations),
    [dayOpeningEntry, savedOpeningDenominations]
  )

  const isViewingSavedOpening = shift === "opening" && hasSavedOpening && pendingClosing

  const savedOpeningTotal = useMemo(
    () => (savedOpeningDenominations || []).reduce((sum, denom) => sum + denom.total, 0),
    [savedOpeningDenominations]
  )

  const totalBalance = denominations.reduce((sum, denom) => sum + denom.total, 0)
  const displayedTotal = isViewingSavedOpening ? savedOpeningTotal : totalBalance

  const resetEditableFields = useCallback(() => {
    setDenominations(createEmptyDenominations())
    setCashInPosMachine(0)
    setErrors({})
    setFocusedCountIndex(null)
    setIsPosCashFocused(false)
  }, [])

  const applyShiftDefaults = useCallback(
    (nextShift: "opening" | "closing", openingEntry: DayRegistryEntry | null, closingEntry: DayRegistryEntry | null) => {
      if (nextShift === "closing" && closingEntry?.closingBalance && closingEntry.closingBalance > 0) {
        const savedClosing =
          closingEntry.closingDenominations?.length
            ? closingEntry.closingDenominations
            : closingEntry.denominations
        setDenominations(mergeDenominations(savedClosing))
        setCashInPosMachine(Number(closingEntry.posCash) || 0)
      } else {
        resetEditableFields()
      }
    },
    [resetEditableFields]
  )

  const loadDayState = useCallback(
    async (targetDate: Date, preserveShift?: "opening" | "closing") => {
      const dateString = format(targetDate, "yyyy-MM-dd")
      setIsDayStateLoading(true)
      try {
        const response = await CashRegistryAPI.getAll({
          page: 1,
          limit: 50,
          dateFrom: getStartOfDayIST(dateString),
          dateTo: getEndOfDayIST(dateString),
        })

        const entries: DayRegistryEntry[] = Array.isArray(response?.data) ? response.data : []
        const openingEntry =
          entries.find(
            (entry) => entry.shiftType === "opening" && (entry.openingBalance ?? 0) > 0
          ) || null
        const closingEntry =
          entries.find(
            (entry) => entry.shiftType === "closing" && (entry.closingBalance ?? 0) > 0
          ) || null

        setDayOpeningEntry(openingEntry)
        setDayClosingEntry(closingEntry)

        const needsClosing =
          Boolean((openingEntry?.openingBalance ?? 0) > 0) &&
          !((closingEntry?.closingBalance ?? 0) > 0)

        if (openingEntry?.openingBalance && openingEntry.openingBalance > 0) {
          setSavedOpeningDenominations(mergeDenominations(openingEntry.denominations))
        } else {
          setSavedOpeningDenominations(null)
        }

        const nextShift = preserveShift ?? (needsClosing ? "closing" : "opening")

        setShift(nextShift)
        applyShiftDefaults(nextShift, openingEntry, closingEntry)
      } catch (error) {
        console.error("Error loading cash registry day state:", error)
        setDayOpeningEntry(null)
        setDayClosingEntry(null)
        setSavedOpeningDenominations(null)
        setShift("opening")
        resetEditableFields()
      } finally {
        setIsDayStateLoading(false)
      }
    },
    [applyShiftDefaults, resetEditableFields]
  )

  useEffect(() => {
    if (!open) return
    loadDayState(date)
  }, [open, date, loadDayState])

  useEffect(() => {
    if (shift === "closing" && open) {
      setCashCollectedOnline(onlineSalesAmount)
    }
  }, [shift, open, onlineSalesAmount])

  const handleShiftChange = (value: "opening" | "closing") => {
    setShift(value)
    applyShiftDefaults(value, dayOpeningEntry, dayClosingEntry)
    setErrors({})
  }

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}

    if (shift === "closing") {
      if (cashInPosMachine < 0) {
        newErrors.cashInPosMachine = "Cash in POS Machine cannot be negative"
      }

      if (cashCollectedOnline > 0 && cashInPosMachine === 0) {
        newErrors.cashInPosMachine = "Cash in POS Machine is mandatory when Cash Collected Online has value"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleCountChange = (index: number, count: string) => {
    if (count === "" || count === null || count === undefined) {
      const newDenominations = [...denominations]
      newDenominations[index] = {
        ...newDenominations[index],
        count: 0,
        total: 0,
      }
      setDenominations(newDenominations)
      return
    }

    const newCount = parseInt(count) || 0
    if (newCount < 0) return

    const newDenominations = [...denominations]
    newDenominations[index] = {
      ...newDenominations[index],
      count: newCount,
      total: newCount * newDenominations[index].value,
    }
    setDenominations(newDenominations)
  }

  const handlePosCashChange = (amount: number) => {
    if (isNaN(amount) || amount < 0) {
      setCashInPosMachine(0)
      onPosCashChange?.(0)
      return
    }

    setCashInPosMachine(amount)
    onPosCashChange?.(amount)
  }

  const handleSave = async () => {
    if (isViewingSavedOpening) return
    if (!validateForm()) return

    setIsLoading(true)
    try {
      const cleanDenominations = denominations
        .filter((d) => d.count > 0 && d.value > 0 && d.total > 0)
        .map((d) => ({
          value: Number(d.value),
          count: Number(d.count),
          total: Number(d.total),
        }))

      const calculatedTotalBalance = cleanDenominations.reduce((sum, d) => sum + d.total, 0)
      const dateString = format(date, "yyyy-MM-dd")
      const cashRegistryData = {
        date: dateString,
        shiftType: shift,
        createdBy: user?.name || user?.email || "Unknown User",
        denominations: cleanDenominations,
        openingBalance: shift === "opening" ? calculatedTotalBalance : 0,
        closingBalance: shift === "closing" ? calculatedTotalBalance : 0,
        onlineCash: shift === "closing" ? cashCollectedOnline : 0,
        posCash: shift === "closing" ? cashInPosMachine : 0,
        notes: `Cash registry entry for ${shift} shift`,
      }

      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"
        const healthCheck = await fetch(`${API_URL}/health`)
        if (!healthCheck.ok) {
          throw new Error(`Backend health check failed: ${healthCheck.status}`)
        }
      } catch {
        toast({
          title: "Backend Unavailable",
          description: "Cannot connect to backend server. Please check if the server is running.",
          variant: "destructive",
        })
        return
      }

      let response
      try {
        response = await CashRegistryAPI.create(cashRegistryData)
        if (response.success === false) {
          throw new Error(response.error || response.message || "API returned error")
        }
      } catch (apiError: any) {
        if (apiError.code === "ECONNREFUSED" || apiError.message?.includes("Network Error")) {
          toast({
            title: "Connection Error",
            description: "Cannot connect to backend server. Please check if the server is running.",
            variant: "destructive",
          })
          return
        }

        if (apiError.response?.status === 401 || apiError.response?.status === 403) {
          toast({
            title: "Authentication Error",
            description: "Authentication failed. Please log in again.",
            variant: "destructive",
          })
          return
        }

        const apiMessage = apiError.response?.data?.message
        if (apiMessage) {
          toast({
            title: "Cannot save",
            description: apiMessage,
            variant: "destructive",
          })
          return
        }

        throw apiError
      }

      if (!response || Object.keys(response).length === 0) {
        toast({
          title: "Error",
          description: "Backend returned empty response. Please try again.",
          variant: "destructive",
        })
        return
      }

      const isSuccess = response.success === true || (response._id && response.shiftType)

      if (isSuccess) {
        const action = shift === "opening" ? "Opening balance" : "Closing balance"
        toast({
          title: "Success",
          description: `${action} saved successfully`,
        })
        onSaveSuccess?.()
        onOpenChange(false)
      } else {
        let errorMessage = "Failed to save cash registry entry"
        if (response.error) {
          errorMessage = response.error
        } else if (response.message) {
          errorMessage = response.message
        }

        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error saving cash registry:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred while saving",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value)
    setDate(newDate)
  }

  const renderDenominationGrid = (
    rows: CurrencyDenomination[],
    {
      readOnly = false,
      onCountChange,
    }: {
      readOnly?: boolean
      onCountChange?: (index: number, count: string) => void
    }
  ) => (
    <div className={`border border-border rounded-lg overflow-hidden bg-card ${readOnly ? "opacity-70" : ""}`}>
      <div className="grid grid-cols-3 bg-muted/30 border-b">
        <div className="px-4 py-3 font-semibold text-sm text-foreground">Currency Value (₹)</div>
        <div className="px-4 py-3 font-semibold text-sm text-foreground">Count</div>
        <div className="px-4 py-3 font-semibold text-sm text-foreground">Total (₹)</div>
      </div>
      {rows.map((denom, index) => (
        <div
          key={`${readOnly ? "saved" : "edit"}-${denom.value}`}
          className={`grid grid-cols-3 border-b last:border-b-0 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
        >
          <div className="px-4 py-3 flex items-center">
            <span className="font-medium text-foreground">₹{denom.value}</span>
          </div>
          <div className="px-4 py-3">
            {readOnly ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">×</span>
                <span className="w-20 text-center text-muted-foreground">{denom.count}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">×</span>
                <Input
                  type="number"
                  min="0"
                  value={focusedCountIndex === index && denom.count === 0 ? "" : denom.count}
                  onChange={(e) => onCountChange?.(index, e.target.value)}
                  onFocus={() => setFocusedCountIndex(index)}
                  onBlur={() => setFocusedCountIndex(null)}
                  className="w-20 h-9 border-border focus:ring-2 focus:ring-primary/20 text-center"
                  placeholder="0"
                  disabled={isDayStateLoading}
                />
              </div>
            )}
          </div>
          <div className="px-4 py-3 flex items-center">
            <span className={`font-medium ${readOnly ? "text-muted-foreground" : "text-foreground"}`}>
              ₹{denom.total.toFixed(2)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-xl font-semibold text-center">
            {isViewingSavedOpening
              ? "Opening Balance (saved)"
              : shift === "opening"
                ? "Set Opening Balance"
                : "Set Closing Balance"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground text-center mt-2">
            {isViewingSavedOpening
              ? "Review the opening balance already submitted for this date. Switch to Closing Shift to enter closing details."
              : pendingClosing && shift === "closing"
                ? "Opening balance is already saved for this date. Enter the closing shift details below."
                : shift === "opening"
                  ? "This will create a new cash registry entry for today. The closing balance can be set later."
                  : "This will update today's cash registry entry with closing balance and calculations."}
          </p>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="date" className="text-sm font-medium text-foreground">
                Date
              </Label>
              <div className="relative">
                <Input
                  id="date"
                  type="date"
                  value={format(date, "yyyy-MM-dd")}
                  onChange={handleDateChange}
                  className="pr-10 h-10 border-border focus:ring-2 focus:ring-primary/20"
                  disabled={isDayStateLoading}
                />
                <Calendar className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Shift</Label>
              <RadioGroup
                value={shift}
                onValueChange={(value: "opening" | "closing") => handleShiftChange(value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    value="opening"
                    id="opening"
                    className="border-border"
                    disabled={isDayStateLoading}
                  />
                  <Label htmlFor="opening" className="text-sm font-normal cursor-pointer">
                    Opening Shift
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    value="closing"
                    id="closing"
                    className="border-border"
                    disabled={isDayStateLoading}
                  />
                  <Label htmlFor="closing" className="text-sm font-normal cursor-pointer">
                    Closing Shift
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold text-foreground">
              {isViewingSavedOpening
                ? "Submitted opening currency count"
                : shift === "closing" && pendingClosing
                  ? "Enter closing currency value count"
                  : "Enter currency value count"}
            </Label>
            {isViewingSavedOpening && savedOpeningDenominations ? (
              renderDenominationGrid(savedOpeningDenominations, { readOnly: true })
            ) : (
              renderDenominationGrid(denominations, {
                onCountChange: handleCountChange,
              })
            )}
          </div>

          {shift === "closing" && (
            <div className="space-y-3 border-t pt-4">
              <Label className="text-base font-semibold text-foreground">Additional Cash Sources</Label>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="cashCollectedOnline" className="text-sm font-medium text-foreground">
                    Cash Collected Online
                    {cashCollectedOnline > 0 && <span className="text-blue-600 ml-1">⚠️</span>}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input
                      id="cashCollectedOnline"
                      type="number"
                      value={isLoading ? "..." : cashCollectedOnline}
                      className="pl-8 h-10 bg-muted/50 border-border cursor-not-allowed"
                      readOnly
                      disabled
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Today&apos;s online sales: Card + Online payments (₹{cashCollectedOnline.toFixed(2)})
                  </p>
                  {!isLoading && cashCollectedOnline > 0 && (
                    <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 p-2 rounded">
                      <p className="font-medium text-blue-800">⚠️ POS Cash Required</p>
                      <p className="text-blue-700">• Card payments: Included</p>
                      <p className="text-blue-700">• Online payments: Included</p>
                      <p className="text-blue-700">• Cash payments: Excluded</p>
                      <p className="text-blue-700 mt-1">• Cash in POS Machine field is now mandatory</p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cashInPosMachine" className="text-sm font-medium text-foreground">
                    Cash in POS Machine
                    {cashCollectedOnline > 0 && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input
                      id="cashInPosMachine"
                      type="number"
                      min="0"
                      step="0.01"
                      value={isPosCashFocused && cashInPosMachine === 0 ? "" : cashInPosMachine}
                      onChange={(e) => handlePosCashChange(parseFloat(e.target.value) || 0)}
                      onFocus={() => setIsPosCashFocused(true)}
                      onBlur={() => setIsPosCashFocused(false)}
                      className={`pl-8 h-10 border-border focus:ring-2 focus:ring-primary/20 ${errors.cashInPosMachine ? "border-red-500 focus:ring-red-500/20" : ""}`}
                      placeholder="0.00"
                      required={cashCollectedOnline > 0}
                      disabled={isDayStateLoading}
                    />
                  </div>
                  {errors.cashInPosMachine && <p className="text-xs text-red-500">{errors.cashInPosMachine}</p>}
                  {cashCollectedOnline > 0 && !errors.cashInPosMachine && (
                    <p className="text-xs text-muted-foreground">Required when Cash Collected Online has value</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center border-t pt-4">
            <div className="space-y-1">
              <Label className="text-lg font-semibold text-foreground">
                {isViewingSavedOpening
                  ? "Opening Total"
                  : shift === "closing" && pendingClosing
                    ? "Closing Total"
                    : "Total Balance"}
              </Label>
              <div className="text-2xl font-bold text-primary">₹{displayedTotal.toFixed(2)}</div>
              {isViewingSavedOpening && (
                <p className="text-xs text-muted-foreground">
                  This opening balance is already saved and cannot be edited here.
                </p>
              )}
              {shift === "closing" && pendingClosing && (
                <p className="text-xs text-muted-foreground">
                  Opening total (₹{savedOpeningTotal.toFixed(2)}) was recorded earlier. Select Opening Shift to review it.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-10 px-6 border-border hover:bg-muted"
              >
                Cancel
              </Button>
              <LoadingButton
                onClick={handleSave}
                loading={isLoading}
                loadingText="Saving..."
                disabled={
                  isDayStateLoading ||
                  isViewingSavedOpening ||
                  (shift === "closing" && cashCollectedOnline > 0 && cashInPosMachine === 0)
                }
                className="h-10 px-6 bg-primary hover:bg-primary/90"
              >
                {isViewingSavedOpening ? "Already Saved" : "Save"}
              </LoadingButton>
            </div>
            {shift === "closing" && cashCollectedOnline > 0 && cashInPosMachine === 0 && (
              <p className="text-xs text-red-500 mt-2 text-center">
                Please fill in Cash in POS Machine to continue
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
