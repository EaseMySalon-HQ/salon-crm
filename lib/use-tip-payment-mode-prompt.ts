"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { TipPaymentBucket } from "@/lib/tip-payment-allocation"
import {
  getActiveCheckoutPaymentModes,
  getTipEligiblePaymentModes,
  getTipPaymentModeBlockReason,
  isTipPaymentModeValidForCheckout,
  needsTipPaymentModeSelection,
} from "@/lib/tip-payment-mode-prompt"

function activeModesKey(modes: TipPaymentBucket[]): string {
  return [...modes].sort().join("|")
}

export function useTipPaymentModePrompt(
  tipAmount: number,
  cash: number,
  card: number,
  online: number
) {
  const [tipPaymentMode, setTipPaymentMode] = useState<TipPaymentBucket | null>(null)
  const [showTipPaymentModeDialog, setShowTipPaymentModeDialog] = useState(false)
  const [dialogSelection, setDialogSelection] = useState<TipPaymentBucket | null>(null)
  const pendingContinueRef = useRef<(() => void) | null>(null)
  const resolvedTipPaymentModeRef = useRef<TipPaymentBucket | null>(null)
  const userConfirmedMixedRef = useRef(false)
  const lastActiveKeyRef = useRef("")

  useEffect(() => {
    if (tipAmount <= 0.01) {
      setTipPaymentMode(null)
      resolvedTipPaymentModeRef.current = null
      userConfirmedMixedRef.current = false
      lastActiveKeyRef.current = ""
      setShowTipPaymentModeDialog(false)
      setDialogSelection(null)
      return
    }

    const active = getActiveCheckoutPaymentModes(cash, card, online)
    const activeKey = activeModesKey(active)

    if (activeKey !== lastActiveKeyRef.current) {
      userConfirmedMixedRef.current = false
      lastActiveKeyRef.current = activeKey
    }

    if (active.length === 1) {
      const mode = active[0]!
      setTipPaymentMode(mode)
      resolvedTipPaymentModeRef.current = mode
      userConfirmedMixedRef.current = true
      setShowTipPaymentModeDialog(false)
      return
    }

    if (active.length >= 2) {
      const resolved = resolvedTipPaymentModeRef.current
      const eligible = getTipEligiblePaymentModes(tipAmount, cash, card, online)
      if (
        userConfirmedMixedRef.current &&
        resolved &&
        isTipPaymentModeValidForCheckout(resolved, tipAmount, cash, card, online)
      ) {
        setTipPaymentMode(resolved)
        return
      }
      userConfirmedMixedRef.current = false
      setTipPaymentMode(null)
      resolvedTipPaymentModeRef.current = null
      setShowTipPaymentModeDialog(false)
      return
    }

    setTipPaymentMode(null)
    resolvedTipPaymentModeRef.current = null
    userConfirmedMixedRef.current = false
    setShowTipPaymentModeDialog(false)
  }, [tipAmount, cash, card, online])

  const getResolvedTipPaymentMode = useCallback((): TipPaymentBucket | null => {
    return resolvedTipPaymentModeRef.current ?? tipPaymentMode
  }, [tipPaymentMode])

  const getBlockReason = useCallback((): string | null => {
    return getTipPaymentModeBlockReason(tipAmount, cash, card, online)
  }, [tipAmount, cash, card, online])

  const requireTipPaymentModeOrPrompt = useCallback(
    (onContinue: () => void): boolean => {
      if (!needsTipPaymentModeSelection(tipAmount, cash, card, online)) {
        return true
      }

      const blockReason = getTipPaymentModeBlockReason(tipAmount, cash, card, online)
      if (blockReason) {
        return false
      }

      const resolved = resolvedTipPaymentModeRef.current ?? tipPaymentMode
      if (
        userConfirmedMixedRef.current &&
        isTipPaymentModeValidForCheckout(resolved, tipAmount, cash, card, online)
      ) {
        return true
      }

      const eligible = getTipEligiblePaymentModes(tipAmount, cash, card, online)
      setDialogSelection((sel) =>
        sel && eligible.includes(sel) ? sel : eligible[0] ?? null
      )
      pendingContinueRef.current = onContinue
      setShowTipPaymentModeDialog(true)
      return false
    },
    [tipAmount, cash, card, online, tipPaymentMode]
  )

  const confirmTipPaymentModeDialog = useCallback(() => {
    if (!dialogSelection) return
    userConfirmedMixedRef.current = true
    resolvedTipPaymentModeRef.current = dialogSelection
    setTipPaymentMode(dialogSelection)
    setShowTipPaymentModeDialog(false)
    const cont = pendingContinueRef.current
    pendingContinueRef.current = null
    cont?.()
  }, [dialogSelection])

  const cancelTipPaymentModeDialog = useCallback(() => {
    setShowTipPaymentModeDialog(false)
    pendingContinueRef.current = null
  }, [])

  return {
    tipPaymentMode,
    setTipPaymentMode,
    getResolvedTipPaymentMode,
    getBlockReason,
    showTipPaymentModeDialog,
    setShowTipPaymentModeDialog,
    dialogSelection,
    setDialogSelection,
    requireTipPaymentModeOrPrompt,
    confirmTipPaymentModeDialog,
    cancelTipPaymentModeDialog,
  }
}
