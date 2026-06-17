"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, TrendingUp } from "lucide-react"
import { GmbAPI } from "@/lib/api"

export function GoogleBusinessInsightsPanel({ addonEnabled }: { addonEnabled?: boolean }) {
  const mountedRef = useRef(true)
  const [insights, setInsights] = useState<any>(null)
  const [triggers, setTriggers] = useState<any[]>([])
  const [conversion, setConversion] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    mountedRef.current = true
    if (!addonEnabled) {
      setLoading(false)
      return () => {
        mountedRef.current = false
      }
    }
    Promise.all([
      GmbAPI.getInsights().catch(() => null),
      GmbAPI.getAdTriggers().catch(() => null),
      GmbAPI.getConversionReport().catch(() => null),
    ])
      .then(([ins, trig, conv]) => {
        if (!mountedRef.current) return
        if (ins?.success) setInsights(ins.data)
        if (trig?.success) setTriggers(trig.data?.triggers || [])
        if (conv?.success) setConversion(conv.data)
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })
    return () => {
      mountedRef.current = false
    }
  }, [addonEnabled])

  if (!addonEnabled) {
    return (
      <p className="text-sm text-slate-500">
        Enable the GMB Booster add-on to view Local SEO insights and AI ad triggers.
      </p>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Local SEO insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">{insights?.summary || "No insights data yet."}</p>
        </CardContent>
      </Card>

      {conversion && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">GMB conversion ({conversion.month})</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-6">
            <div>
              <p className="text-2xl font-semibold">{conversion.bookings}</p>
              <p className="text-xs text-slate-500">Bookings</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">₹{conversion.revenue || 0}</p>
              <p className="text-xs text-slate-500">Revenue</p>
            </div>
          </CardContent>
        </Card>
      )}

      {triggers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI ad triggers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {triggers.map((t) => (
              <div key={t._id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t.signalType}</Badge>
                  {t.suggestedBudgetInr && <span className="text-xs">₹{t.suggestedBudgetInr} suggested</span>}
                </div>
                <p className="text-sm">{t.suggestion}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => GmbAPI.approveAdTrigger(t._id).then(() => window.location.reload())}
                >
                  Approve suggestion
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
