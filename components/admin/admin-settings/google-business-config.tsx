"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { adminRequestHeaders } from "@/lib/admin-request-headers"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

export function GoogleBusinessConfigSettings() {
  const { toast } = useToast()
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [redirectUri, setRedirectUri] = useState("")
  const [hasSecret, setHasSecret] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/admin/gmb-config`, { headers: adminRequestHeaders() })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setClientId(res.data.clientId || "")
          setRedirectUri(res.data.redirectUri || "")
          setHasSecret(Boolean(res.data.hasClientSecret))
        }
      })
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/admin/gmb-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...adminRequestHeaders() },
        body: JSON.stringify({
          clientId,
          clientSecret: clientSecret || undefined,
          redirectUri,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: "Saved", description: "Google OAuth config updated." })
        setHasSecret(Boolean(data.data?.hasClientSecret))
        setClientSecret("")
      } else {
        throw new Error(data.error)
      }
    } catch {
      toast({ title: "Error", description: "Failed to save config", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Business Profile OAuth</CardTitle>
        <CardDescription>Platform Google Cloud OAuth credentials for tenant GMB connect.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div>
          <Label>Client ID</Label>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </div>
        <div>
          <Label>Client secret {hasSecret && <span className="text-xs text-slate-500">(saved)</span>}</Label>
          <Input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={hasSecret ? "Leave blank to keep existing" : ""}
          />
        </div>
        <div>
          <Label>Redirect URI</Label>
          <Input value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} />
        </div>
        <Button onClick={handleSave} disabled={saving}>
          Save
        </Button>
      </CardContent>
    </Card>
  )
}
