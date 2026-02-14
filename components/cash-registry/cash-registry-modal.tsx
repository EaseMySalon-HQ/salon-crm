"use client"

import { useState, useEffect } from "react"
import { Calendar, X, RefreshCw } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
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
import { SalesAPI, CashRegistryAPI } from "@/lib/api"

interface CashRegistryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveSuccess?: () => void
  onlineSalesAmount?: number // Add this prop to receive the amount from stats card
  onPosCashChange?: (amount: number) => void // Add this prop to send POS cash amount back to parent
}

interface CurrencyDenomination {
  value: number
  count: number
  total: number
}

export function CashRegistryModal({ open, onOpenChange, onSaveSuccess, onlineSalesAmount = 0, onPosCashChange }: CashRegistryModalProps) {
  const { user } = useAuth()
  const [date, setDate] = useState(new Date())
  const [shift, setShift] = useState<"opening" | "closing">("opening")
  const [denominations, setDenominations] = useState<CurrencyDenomination[]>([
    { value: 500, count: 0, total: 0 },
    { value: 200, count: 0, total: 0 },
    { value: 100, count: 0, total: 0 },
    { value: 50, count: 0, total: 0 },
    { value: 20, count: 0, total: 0 },
    { value: 10, count: 0, total: 0 },
    { value: 5, count: 0, total: 0 },
    { value: 2, count: 0, total: 0 },
    { value: 1, count: 0, total: 0 },
  ])
  const [cashCollectedOnline, setCashCollectedOnline] = useState(onlineSalesAmount)
  const [cashInPosMachine, setCashInPosMachine] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const totalBalance = denominations.reduce((sum, denom) => sum + denom.total, 0)
  const displayTotal = totalBalance

  // Use the online sales amount from props (stats card) instead of fetching separately
  useEffect(() => {
    console.log("🔄 CashRegistryModal useEffect:", {
      shift,
      open,
      onlineSalesAmount,
      currentCashCollectedOnline: cashCollectedOnline
    })
    
    if (shift === "closing" && open) {
      setCashCollectedOnline(onlineSalesAmount)
      console.log("✅ Set Cash Collected Online to:", onlineSalesAmount)
    }
  }, [shift, open, onlineSalesAmount])



  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}
    
    if (shift === "closing") {
      // Validate Cash in POS Machine cannot be negative
      if (cashInPosMachine < 0) {
        newErrors.cashInPosMachine = "Cash in POS Machine cannot be negative"
      }
      
      // Validate Cash in POS Machine is mandatory when Cash Collected Online > 0
      if (cashCollectedOnline > 0 && cashInPosMachine === 0) {
        newErrors.cashInPosMachine = "Cash in POS Machine is mandatory when Cash Collected Online has value"
      }
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleCountChange = (index: number, count: string) => {
    // Handle empty string or invalid input
    if (count === '' || count === null || count === undefined) {
      const newDenominations = [...denominations]
      newDenominations[index] = {
        ...newDenominations[index],
        count: 0,
        total: 0
      }
      setDenominations(newDenominations)
      return
    }
    
    const newCount = parseInt(count) || 0
    if (newCount < 0) return // Prevent negative counts
    
    const newDenominations = [...denominations]
    newDenominations[index] = {
      ...newDenominations[index],
      count: newCount,
      total: newCount * newDenominations[index].value
    }
    setDenominations(newDenominations)
  }

  const handlePosCashChange = (amount: number) => {
    // Handle NaN or invalid amounts
    if (isNaN(amount) || amount < 0) {
      setCashInPosMachine(0)
      if (onPosCashChange) {
        onPosCashChange(0)
      }
      return
    }
    
    setCashInPosMachine(amount)
    // Notify parent component about POS cash change
    if (onPosCashChange) {
      onPosCashChange(amount)
    }
  }

  const handleSave = async () => {
    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    try {
      // Get auth token from localStorage
      const authToken = localStorage.getItem('salon-auth-token')
      
      if (!authToken) {
        toast({
          title: "Authentication Error",
          description: "Please log in to save cash registry data.",
          variant: "destructive",
        })
        setIsLoading(false)
        return
      }

      // Clean and validate denominations data
      const cleanDenominations = denominations
        .filter(d => d.count > 0 && d.value > 0 && d.total > 0)
        .map(d => ({
          value: Number(d.value),
          count: Number(d.count),
          total: Number(d.total)
        }))
      
      // Recalculate total balance from cleaned denominations
      const calculatedTotalBalance = cleanDenominations.reduce((sum, d) => sum + d.total, 0)
      
      const cashRegistryData = {
        date: date, // Send the Date object as is
        shiftType: shift,
        createdBy: user?.name || user?.email || "Unknown User", // Add required createdBy field
        denominations: cleanDenominations, // Use cleaned denominations
        openingBalance: shift === "opening" ? calculatedTotalBalance : 0, // Send opening balance for opening shifts
        closingBalance: shift === "closing" ? calculatedTotalBalance : 0, // Send closing balance for closing shifts
        onlineCash: shift === "closing" ? cashCollectedOnline : 0,
        posCash: shift === "closing" ? cashInPosMachine : 0,
        notes: `Cash registry entry for ${shift} shift`
      }

      console.log("Saving cash registry data:", cashRegistryData)
      console.log("User info:", { name: user?.name, email: user?.email })
      console.log("User object:", user)
      console.log("Token starts with 'mock':", authToken?.startsWith('mock-token-'))
      console.log("Denominations structure:", denominations.filter(d => d.count > 0).map(d => ({ value: d.value, count: d.count, total: d.total })))

            console.log("Making API call to /cash-registry...")
      console.log("Request data being sent:", cashRegistryData)
      
      // Check if backend is reachable
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
        const healthCheck = await fetch(`${API_URL}/health`)
        if (!healthCheck.ok) {
          throw new Error(`Backend health check failed: ${healthCheck.status}`)
        }
        console.log("✅ Backend is reachable")
      } catch (healthError) {
        console.error("❌ Backend health check failed:", healthError)
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
        console.log("✅ API call successful!")
        console.log("API Response:", response)
        console.log("Response type:", typeof response)
        console.log("Response keys:", Object.keys(response))
        
        // Check if response has success property (API wrapper) or is direct data
        if (response.success === false) {
          console.error("❌ API returned error:", response)
          throw new Error(response.error || response.message || "API returned error")
        }
        
        // If response has data property, use it; otherwise use response directly
        const responseData = response.data || response
        console.log("Cash registry response data:", responseData)
        
      } catch (apiError: any) {
        console.error("❌ API Call Failed:", apiError)
        console.error("API Error details:", {
          message: apiError.message || 'Unknown error',
          response: apiError.response?.data || 'No response data',
          status: apiError.response?.status || 'No status',
          statusText: apiError.response?.statusText || 'No status text',
          url: apiError.config?.url || 'No URL',
          method: apiError.config?.method || 'No method',
          code: apiError.code || 'No error code',
          name: apiError.name || 'Unknown error type'
        })
        
        // Check if it's a network error
        if (apiError.code === 'ECONNREFUSED' || apiError.message.includes('Network Error')) {
          toast({
            title: "Connection Error",
            description: "Cannot connect to backend server. Please check if the server is running.",
            variant: "destructive",
          })
          return
        }
        
        // Check if it's an authentication error
        if (apiError.response?.status === 401 || apiError.response?.status === 403) {
          toast({
            title: "Authentication Error",
            description: "Authentication failed. Please log in again.",
            variant: "destructive",
          })
          return
        }
        
        throw apiError // Re-throw to be caught by outer catch block
      }

      // Check if response exists and has content
      if (!response || Object.keys(response).length === 0) {
        console.error("❌ Empty response received from backend")
        toast({
          title: "Error",
          description: "Backend returned empty response. Please try again.",
          variant: "destructive",
        })
        return
      }

      // Check if response indicates success (either has success: true or is a valid cash registry object)
      const isSuccess = response.success === true || (response._id && response.shiftType)
      
      if (isSuccess) {
        const action = shift === "opening" ? "Opening balance" : "Closing balance"
        toast({
          title: "Success",
          description: `${action} saved successfully`,
        })
        
        // Call the success callback to refresh data in the parent component
        if (onSaveSuccess) {
          onSaveSuccess()
        }
        
        onOpenChange(false)
      } else {
        console.error("Backend error response:", response)
        
        // Show more specific error message
        let errorMessage = "Failed to save cash registry entry"
        if (response.error) {
          errorMessage = response.error
        } else if (response.message) {
          errorMessage = response.message
        } else if ((response as any).details) {
          errorMessage = `Error: ${JSON.stringify((response as any).details)}`
        }
        
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Error saving cash registry:", error)
      console.error("Error details:", {
        message: error.message || 'Unknown error',
        response: error.response?.data || 'No response data',
        status: error.response?.status || 'No status',
        name: error.name || 'Unknown error type',
        stack: error.stack || 'No stack trace'
      })
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-xl font-semibold text-center">
            {shift === "opening" ? "Set Opening Balance" : "Set Closing Balance"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground text-center mt-2">
            {shift === "opening" 
              ? "This will create a new cash registry entry for today. The closing balance can be set later."
              : "This will update today's cash registry entry with closing balance and calculations."
            }
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {/* Date and Shift Selection */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="date" className="text-sm font-medium text-foreground">Date</Label>
              <div className="relative">
                <Input
                  id="date"
                  type="date"
                  value={format(date, "yyyy-MM-dd")}
                  onChange={handleDateChange}
                  className="pr-10 h-10 border-border focus:ring-2 focus:ring-primary/20"
                />
                <Calendar className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Shift</Label>
              <RadioGroup
                value={shift}
                onValueChange={(value: "opening" | "closing") => setShift(value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="opening" id="opening" className="border-border" />
                  <Label htmlFor="opening" className="text-sm font-normal cursor-pointer">Opening Shift</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="closing" id="closing" className="border-border" />
                  <Label htmlFor="closing" className="text-sm font-normal cursor-pointer">Closing Shift</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {/* Currency Value Count Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold text-foreground">Enter currency value count</Label>
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <div className="grid grid-cols-3 bg-muted/30 border-b">
                <div className="px-4 py-3 font-semibold text-sm text-foreground">Currency Value (₹)</div>
                <div className="px-4 py-3 font-semibold text-sm text-foreground">Count</div>
                <div className="px-4 py-3 font-semibold text-sm text-foreground">Total (₹)</div>
              </div>
              {denominations.map((denom, index) => (
                <div key={denom.value} className={`grid grid-cols-3 border-b last:border-b-0 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                  <div className="px-4 py-3 flex items-center">
                    <span className="font-medium text-foreground">₹{denom.value}</span>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm">×</span>
                      <Input
                        type="number"
                        min="0"
                        value={denom.count}
                        onChange={(e) => handleCountChange(index, e.target.value)}
                        className="w-20 h-9 border-border focus:ring-2 focus:ring-primary/20 text-center"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="px-4 py-3 flex items-center">
                    <span className="font-medium text-foreground">₹{denom.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Closing Shift Additional Fields */}
          {shift === "closing" && (
            <div className="space-y-3 border-t pt-4">
              <Label className="text-base font-semibold text-foreground">Additional Cash Sources</Label>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="cashCollectedOnline" className="text-sm font-medium text-foreground">
                    Cash Collected Online
                    {cashCollectedOnline > 0 && (
                      <span className="text-blue-600 ml-1">⚠️</span>
                    )}
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
                    {shift === "closing" 
                      ? `Today's online sales: Card + Online payments (₹${cashCollectedOnline.toFixed(2)})`
                      : "Will be 0 for opening shifts (no online payments yet)"
                    }
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
                    {cashCollectedOnline > 0 && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input
                      id="cashInPosMachine"
                      type="number"
                      min="0"
                      step="0.01"
                      value={cashInPosMachine}
                      onChange={(e) => handlePosCashChange(parseFloat(e.target.value) || 0)}
                      className={`pl-8 h-10 border-border focus:ring-2 focus:ring-primary/20 ${errors.cashInPosMachine ? 'border-red-500 focus:ring-red-500/20' : ''}`}
                      placeholder="0.00"
                      required={cashCollectedOnline > 0}
                    />
                  </div>
                  {errors.cashInPosMachine && (
                    <p className="text-xs text-red-500">{errors.cashInPosMachine}</p>
                  )}
                  {cashCollectedOnline > 0 && !errors.cashInPosMachine && (
                    <p className="text-xs text-muted-foreground">
                      Required when Cash Collected Online has value
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Total Balance and Action Buttons */}
          <div className="flex justify-between items-center border-t pt-4">
            <div className="space-y-1">
              <Label className="text-lg font-semibold text-foreground">Total Balance</Label>
              <div className="text-2xl font-bold text-primary">₹{displayTotal.toFixed(2)}</div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-10 px-6 border-border hover:bg-muted"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                disabled={isLoading || (shift === "closing" && cashCollectedOnline > 0 && cashInPosMachine === 0)}
                className="h-10 px-6 bg-primary hover:bg-primary/90"
              >
                {isLoading ? "Saving..." : "Save"}
              </Button>
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
