import { useState, useEffect } from 'react'
import { formatCurrency, formatAmountWithSymbol, getCurrencySymbol, getCurrencyDisplay, type CurrencySettings } from '@/lib/currency'
import { SettingsAPI } from '@/lib/api'

export function useCurrency() {
  const [currencySettings, setCurrencySettings] = useState<CurrencySettings>({
    currency: 'INR',
    enableCurrency: true
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadCurrencySettings()
  }, [])

  const loadCurrencySettings = async () => {
    try {
      // Skip API call on public routes (like public receipt page)
      if (typeof window !== 'undefined') {
        const isPublicRoute = window.location.pathname.includes('/receipt/public/') ||
                             window.location.pathname.includes('/public/')
        if (isPublicRoute) {
          setIsLoading(false)
          return
        }
        
        // Skip if no auth token (not authenticated)
        const token = localStorage.getItem('salon-auth-token')
        if (!token) {
          setIsLoading(false)
          return
        }
      }
      
      const response = await SettingsAPI.getPaymentSettings()
      if (response.success) {
        setCurrencySettings({
          currency: response.data.currency || 'INR',
          enableCurrency: response.data.enableCurrency !== false
        })
      }
    } catch (error: any) {
      // Silently handle 401 errors (user not authenticated)
      if (error?.response?.status === 401) {
        // User is not authenticated, keep default values
      } else {
        console.error('Failed to load currency settings:', error)
      }
      // Keep default values
    } finally {
      setIsLoading(false)
    }
  }

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
    loadCurrencySettings()
  }

  return {
    currencySettings,
    isLoading,
    formatAmount,
    formatAmountWithSymbolOnly,
    getSymbol,
    getDisplay,
    refreshSettings
  }
}
