"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plug, Unplug, MapPin } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { GmbAPI } from "@/lib/api"
import { GoogleBusinessReviewsPanel } from "./google-business-reviews-panel"
import { GoogleBusinessHealthDashboard } from "./google-business-health-dashboard"
import { GoogleBusinessInsightsPanel } from "./google-business-insights-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function GoogleBusinessSettings() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const mountedRef = useRef(true)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccount, setSelectedAccount] = useState("")
  const [selectedLocation, setSelectedLocation] = useState("")
  const [activeTab, setActiveTab] = useState("reviews")

  const loadStatus = useCallback(async () => {
    if (!mountedRef.current) return
    setLoading(true)
    try {
      const res = await GmbAPI.getStatus()
      if (!mountedRef.current) return
      if (res.success) setStatus(res.data)
    } catch {
      if (!mountedRef.current) return
      toast({ title: "Error", description: "Failed to load Google Business status", variant: "destructive" })
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    mountedRef.current = true
    void loadStatus()
    return () => {
      mountedRef.current = false
    }
  }, [loadStatus])

  useEffect(() => {
    const connected = searchParams.get("connected")
    const error = searchParams.get("error")
    if (connected === "1") {
      toast({ title: "Connected", description: "Google Business Profile linked successfully." })
    } else if (error) {
      toast({
        title: "Connection failed",
        description: decodeURIComponent(error),
        variant: "destructive",
      })
    }
  }, [searchParams, toast])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const res = await GmbAPI.connect()
      if (res.success && res.data?.authUrl) {
        window.location.href = res.data.authUrl
      }
    } catch {
      toast({ title: "Error", description: "Failed to start Google connect", variant: "destructive" })
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await GmbAPI.disconnect()
      toast({ title: "Disconnected", description: "Google Business Profile disconnected." })
      await loadStatus()
    } catch {
      toast({ title: "Error", description: "Failed to disconnect", variant: "destructive" })
    }
  }

  const loadAccounts = async () => {
    try {
      const res = await GmbAPI.getAccounts()
      if (res.success) setAccounts(res.data?.accounts || [])
    } catch {
      toast({ title: "Error", description: "Failed to load GMB accounts", variant: "destructive" })
    }
  }

  const handleMapLocation = async () => {
    if (!selectedAccount || !selectedLocation) return
    const acct = accounts.find((a) => a.accountId === selectedAccount)
    const loc = acct?.locations?.find((l: any) => l.locationId === selectedLocation)
    try {
      const res = await GmbAPI.mapLocation({
        accountId: selectedAccount,
        locationId: selectedLocation,
        locationName: loc?.locationName,
      })
      if (res.success) {
        toast({ title: "Location mapped", description: "Your branch is now linked to Google." })
        await loadStatus()
      }
    } catch {
      toast({ title: "Error", description: "Failed to map location", variant: "destructive" })
    }
  }

  const updateSettings = async (patch: Record<string, unknown>) => {
    try {
      const res = await GmbAPI.updateSettings(patch)
      if (res.success) {
        setStatus((s: any) => ({ ...s, ...res.data }))
        toast({ title: "Saved", description: "Settings updated." })
      }
    } catch {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  const connected = status?.connected === true
  const pendingLocation = status?.status === "pending_location"

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Google Business Profile</CardTitle>
              <CardDescription>
                Connect your Google listing to sync reviews, reply automatically, and grow local SEO.
              </CardDescription>
            </div>
            {connected ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Connected</Badge>
            ) : (
              <Badge variant="secondary">Not connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connected && (
            <div className="text-sm text-slate-600">
              <p>
                <strong>{status?.accountName || "Google account"}</strong>
                {status?.locationName ? ` · ${status.locationName}` : ""}
              </p>
              {status?.locationCount > 0 && (
                <p className="text-slate-500">{status.locationCount} location(s) on account</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {!connected ? (
              <Button onClick={handleConnect} disabled={connecting}>
                {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plug className="h-4 w-4 mr-2" />}
                Connect Google Business
              </Button>
            ) : (
              <Button variant="outline" onClick={handleDisconnect}>
                <Unplug className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            )}
            {pendingLocation && (
              <Button variant="secondary" onClick={loadAccounts}>
                <MapPin className="h-4 w-4 mr-2" />
                Map location
              </Button>
            )}
          </div>

          {accounts.length > 0 && pendingLocation && (
            <div className="grid gap-3 sm:grid-cols-2 max-w-xl pt-2">
              <div>
                <Label>Account</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.accountId} value={a.accountId}>
                        {a.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts.find((a) => a.accountId === selectedAccount)?.locations || []).map((l: any) => (
                      <SelectItem key={l.locationId} value={l.locationId}>
                        {l.locationName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleMapLocation} disabled={!selectedAccount || !selectedLocation}>
                Save mapping
              </Button>
            </div>
          )}

          {!status?.addonEnabled && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              GMB Booster add-on (₹499/mo) unlocks AI auto-reply, WhatsApp review requests, auto posts, and insights.
            </p>
          )}
        </CardContent>
      </Card>

      {connected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Automation settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-reply">AI auto-reply</Label>
              <Switch
                id="auto-reply"
                checked={status?.autoReplyEnabled === true}
                onCheckedChange={(v) => updateSettings({ autoReplyEnabled: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="review-request">WhatsApp review requests</Label>
              <Switch
                id="review-request"
                checked={status?.reviewRequestEnabled === true}
                onCheckedChange={(v) => updateSettings({ reviewRequestEnabled: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-post">Auto post scheduling</Label>
              <Switch
                id="auto-post"
                checked={status?.postingEnabled === true}
                onCheckedChange={(v) => updateSettings({ postingEnabled: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="services-sync">Services sync to GMB</Label>
              <Switch
                id="services-sync"
                checked={status?.servicesSyncEnabled === true}
                onCheckedChange={(v) => updateSettings({ servicesSyncEnabled: v })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {connected && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>
          <TabsContent value="reviews" className="mt-4">
            {activeTab === "reviews" ? (
              <GoogleBusinessReviewsPanel addonEnabled={status?.addonEnabled} />
            ) : null}
          </TabsContent>
          <TabsContent value="health" className="mt-4">
            {activeTab === "health" ? <GoogleBusinessHealthDashboard /> : null}
          </TabsContent>
          <TabsContent value="insights" className="mt-4">
            {activeTab === "insights" ? (
              <GoogleBusinessInsightsPanel addonEnabled={status?.addonEnabled} />
            ) : null}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
