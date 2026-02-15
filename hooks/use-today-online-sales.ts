"use client"

import { useState, useEffect, useCallback } from "react"
import { SalesAPI } from "@/lib/api"
import { toDateStringIST } from "@/lib/date-utils"

/**
 * Fetches today's online sales (Card + Online payments) for use in Cash Registry modal.
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
      const response = await SalesAPI.getAll({
        dateFrom: todayString,
        dateTo: todayString,
        limit: 1000,
      })
      const sales = response?.data ?? []
      const result = sales.reduce((sum: number, sale: any) => {
        const saleDate = toDateStringIST(sale.date)
        if (saleDate === todayString) {
          if (sale.payments && sale.payments.length > 0) {
            return (
              sum +
              sale.payments
                .filter(
                  (payment: any) =>
                    payment.mode === "Card" || payment.mode === "Online"
                )
                .reduce(
                  (paymentSum: number, payment: any) =>
                    paymentSum + payment.amount,
                  0
                )
            )
          }
          return (
            sum +
            (sale.paymentMode === "Card" || sale.paymentMode === "Online"
              ? sale.netTotal ?? 0
              : 0)
          )
        }
        return sum
      }, 0)
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
