"use client"

import { useState, useEffect, useCallback } from "react"
import { SalesAPI } from "@/lib/api"
import { toDateStringIST } from "@/lib/date-utils"

/**
 * Fetches today's online sales (Card + Online): checkout payments + dues in paymentHistory for today.
 * Used when the modal is opened from top nav or other places without access to salesData.
 */
export function useTodayOnlineSales(enabled: boolean) {
  const [amount, setAmount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const fetchTodayOnlineSales = useCallback(async () => {
    if (!enabled) return
    setIsLoading(true)
    try {
      const today = new Date()
      const todayString = toDateStringIST(today)
      const sales = await SalesAPI.getAllMergePages({
        dateFrom: todayString,
        dateTo: todayString,
        batchSize: 400,
        includeDuePaymentDates: "1",
      })
      let result = 0
      for (const sale of sales) {
        const saleDate = toDateStringIST(sale.date)
        if (saleDate === todayString) {
          if (sale.payments && sale.payments.length > 0) {
            result += sale.payments
              .filter(
                (payment: any) =>
                  payment.mode === "Card" || payment.mode === "Online"
              )
              .reduce(
                (paymentSum: number, payment: any) =>
                  paymentSum + payment.amount,
                0
              )
          } else if (sale.paymentMode === "Card" || sale.paymentMode === "Online") {
            result += sale.netTotal ?? 0
          }
        }
        // Dues collected today via Card / Online (paymentHistory.date)
        for (const ph of sale.paymentHistory || []) {
          if (!ph) continue
          const method = String(ph.method || "").toLowerCase()
          if (method !== "card" && method !== "online") continue
          const phDay = ph.date ? toDateStringIST(ph.date) : ""
          if (phDay === todayString) {
            result += ph.amount || 0
          }
        }
      }
      setAmount(result)
    } catch (error) {
      console.error("Failed to fetch today's online sales:", error)
      setAmount(0)
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      fetchTodayOnlineSales()
    } else {
      setAmount(0)
    }
  }, [enabled, fetchTodayOnlineSales])

  return { amount, isLoading, refetch: fetchTodayOnlineSales }
}
