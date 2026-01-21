"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { CampaignsAPI } from "@/lib/api"

export function CampaignStats({ 
  open, 
  onOpenChange, 
  campaign 
}: { 
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: any
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    if (open && campaign?._id) {
      loadStats()
    }
  }, [open, campaign])

  const loadStats = async () => {
    try {
      setLoading(true)
      const response = await CampaignsAPI.getStats(campaign._id)
      if (response.success) {
        setStats(response.data)
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load campaign stats",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const successRate = stats?.stats?.total 
    ? ((stats.stats.sent / stats.stats.total) * 100).toFixed(2)
    : '0'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Campaign Statistics</DialogTitle>
          <DialogDescription>
            Performance metrics for "{campaign?.name}"
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8">Loading stats...</div>
        ) : stats ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.stats?.total || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Sent</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{stats.stats?.sent || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Failed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{stats.stats?.failed || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{successRate}%</div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Campaign Details:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Status: {stats.campaign?.status}</li>
                <li>Recipients: {stats.campaign?.recipientCount || 0}</li>
                <li>Sent: {stats.campaign?.sentCount || 0}</li>
                <li>Failed: {stats.campaign?.failedCount || 0}</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No statistics available
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

