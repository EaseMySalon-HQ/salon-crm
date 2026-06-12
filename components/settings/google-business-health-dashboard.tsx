"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { GmbAPI } from "@/lib/api"

function scoreColor(score: number) {
  if (score < 50) return "text-red-600 border-red-200 bg-red-50"
  if (score < 75) return "text-amber-600 border-amber-200 bg-amber-50"
  return "text-green-600 border-green-200 bg-green-50"
}

export function GoogleBusinessHealthDashboard() {
  const mountedRef = useRef(true)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    mountedRef.current = true
    GmbAPI.getHealth()
      .then((res) => {
        if (!mountedRef.current) return
        if (res.success) setData(res.data)
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })
    return () => {
      mountedRef.current = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!data) return <p className="text-sm text-slate-500">Health data unavailable.</p>

  const components = data.components || {}

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex items-center gap-6">
          <div
            className={`flex h-24 w-24 items-center justify-center rounded-full border-4 text-2xl font-bold ${scoreColor(data.score)}`}
          >
            {data.score}
          </div>
          <div>
            <p className="font-medium">GMB Health Score</p>
            <p className="text-sm text-slate-500">0–100 based on profile completeness, posts, and replies</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(components).map(([key, val]) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm capitalize">{key.replace(/([A-Z])/g, " $1")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{val as number}%</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.history?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent trend</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            {data.history.map((h: any, i: number) => (
              <span key={i} className="text-xs bg-slate-100 px-2 py-1 rounded">
                {new Date(h.snapshotDate).toLocaleDateString()}: {h.score}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      <Button variant="outline" size="sm" onClick={() => GmbAPI.syncServices().catch(() => {})}>
        Sync services now
      </Button>
    </div>
  )
}
