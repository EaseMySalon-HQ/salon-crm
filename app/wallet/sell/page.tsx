"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

/**
 * Legacy URL: wallet issuance now lives in Quick Sale → "Add Prepaid Plans".
 */
function RedirectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const clientId = searchParams.get("clientId")
    const qs = new URLSearchParams()
    qs.set("prepaidWallet", "1")
    if (clientId) qs.set("clientId", clientId)
    router.replace(`/quick-sale?${qs.toString()}`)
  }, [router, searchParams])

  return (
    <div className="p-6 text-center text-muted-foreground text-sm">
      Opening Quick Sale…
    </div>
  )
}

export default function WalletSellRedirectPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>}>
      <RedirectContent />
    </Suspense>
  )
}
