import { useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  formatCurrency,
  formatAmountWithSymbol,
  getCurrencySymbol,
  getCurrencyDisplay,
  type CurrencySettings,
} from "@/lib/currency"
import {
  PAYMENT_SETTINGS_QUERY_KEY,
  usePaymentSettingsQuery,
} from "@/lib/queries/payment-settings"

export function useCurrency() {
  const queryClient = useQueryClient()
  const { data: response, isPending } = usePaymentSettingsQuery()

  const currencySettings = useMemo((): CurrencySettings => {
    if (response?.success && response.data) {
      return {
        currency: response.data.currency || "INR",
        enableCurrency: response.data.enableCurrency !== false,
      }
    }
    return {
      currency: "INR",
      enableCurrency: true,
    }
  }, [response])

  const formatAmount = (amount: number) => {
    return formatCurrency(amount, currencySettings)
  }

  const formatAmountWithSymbolOnly = (amount: number) => {
    return formatAmountWithSymbol(amount, currencySettings)
  }

  const getSymbol = () => {
    return getCurrencySymbol(currencySettings.currency)
  }

  const getDisplay = () => {
    return getCurrencyDisplay(currencySettings.currency)
  }

  const refreshSettings = () => {
    void queryClient.invalidateQueries({ queryKey: PAYMENT_SETTINGS_QUERY_KEY })
  }

  return {
    currencySettings,
    isLoading: isPending,
    formatAmount,
    formatAmountWithSymbolOnly,
    getSymbol,
    getDisplay,
    refreshSettings,
  }
}
