"use client"

import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { toast } from '@/components/ui/use-toast'
import { SESSION_CONFIG } from '@/lib/session-config'

interface UseSessionTimeoutOptions {
  timeoutMinutes?: number // Default 3 hours = 180 minutes
  warningMinutes?: number // Show warning 5 minutes before logout
  onTimeout?: () => void
  onWarning?: () => void
}

export function useSessionTimeout({
  timeoutMinutes = SESSION_CONFIG.TIMEOUT_MINUTES,
  warningMinutes = SESSION_CONFIG.WARNING_MINUTES,
  onTimeout,
  onWarning
}: UseSessionTimeoutOptions = {}) {
  const { logout } = useAuth()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const isWarningShownRef = useRef<boolean>(false)

  // Reset timers on user activity
  const resetTimers = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now
    isWarningShownRef.current = false

    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current)
    }

    // Set warning timer (5 minutes before logout)
    const warningTime = (timeoutMinutes - warningMinutes) * 60 * 1000
    warningTimeoutRef.current = setTimeout(() => {
      if (!isWarningShownRef.current) {
        isWarningShownRef.current = true
        
        toast({
          title: "Session Timeout Warning",
          description: `Your session will expire in ${warningMinutes} minutes due to inactivity. Click anywhere to continue.`,
          variant: "destructive",
          duration: SESSION_CONFIG.TOAST_DURATION,
        })

        // Call custom warning handler
        onWarning?.()
      }
    }, warningTime)

    // Set logout timer
    const logoutTime = timeoutMinutes * 60 * 1000
    timeoutRef.current = setTimeout(() => {
      toast({
        title: "Session Expired",
        description: "You have been automatically logged out due to inactivity.",
        variant: "destructive",
      })

      // Call custom timeout handler
      onTimeout?.()
      
      // Logout user — tag source so backend audit log can distinguish inactivity from button click
      logout('session_timeout')
    }, logoutTime)
  }, [timeoutMinutes, warningMinutes, logout, onTimeout, onWarning])

  // Handle user activity
  const handleActivity = useCallback(() => {
    resetTimers()
  }, [resetTimers])

  // Set up activity listeners
  useEffect(() => {
    // Add event listeners
    SESSION_CONFIG.ACTIVITY_EVENTS.forEach(event => {
      document.addEventListener(event, handleActivity, true)
    })

    // Initialize timers
    resetTimers()

    // Cleanup function
    return () => {
      SESSION_CONFIG.ACTIVITY_EVENTS.forEach(event => {
        document.removeEventListener(event, handleActivity, true)
      })
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current)
      }
    }
  }, [handleActivity, resetTimers])

  // Return utility functions
  return {
    resetTimers,
    getLastActivity: () => lastActivityRef.current,
    getTimeUntilTimeout: () => {
      const now = Date.now()
      const timeSinceActivity = now - lastActivityRef.current
      const timeoutMs = timeoutMinutes * 60 * 1000
      return Math.max(0, timeoutMs - timeSinceActivity)
    },
    isWarningShown: () => isWarningShownRef.current
  }
}
