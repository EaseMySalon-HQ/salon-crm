"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { CampaignsAPI } from "@/lib/api"
import { Loader2 } from "lucide-react"

export function CampaignSendDialog({ 
  open, 
  onOpenChange, 
  campaign,
  onSuccess 
}: { 
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: any
  onSuccess: () => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleSend = async () => {
    if (!confirm(`Are you sure you want to send this campaign to ${campaign.recipientCount || 0} recipients?`)) {
      return
    }

    try {
      setLoading(true)
      setSending(true)
      setResult(null)

      const response = await CampaignsAPI.send(campaign._id)

      if (response.success) {
        setResult(response.data)
        toast({
          title: "Success",
          description: `Campaign sent to ${response.data?.successful || 0} recipients`,
        })
        onSuccess()
      } else {
        throw new Error(response.error || 'Failed to send campaign')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send campaign",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Campaign</DialogTitle>
          <DialogDescription>
            Send "{campaign?.name}" to recipients
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!result && !sending && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">Campaign Details:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Name: {campaign?.name}</li>
                  <li>Template: {campaign?.templateName}</li>
                  <li>Recipients: {campaign?.recipientCount || 0}</li>
                  <li>Recipient Type: {campaign?.recipientType}</li>
                </ul>
              </div>
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  This will send WhatsApp messages to {campaign?.recipientCount || 0} recipients. 
                  This action cannot be undone.
                </p>
              </div>
            </>
          )}

          {sending && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Sending campaign...</p>
              <p className="text-xs text-muted-foreground mt-2">This may take a few minutes</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800 mb-2">Campaign Sent Successfully!</p>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>Total Recipients: {result.total || 0}</li>
                  <li>Successfully Sent: {result.successful || 0}</li>
                  <li>Failed: {result.failed || 0}</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {!result && (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={handleSend} disabled={loading || sending}>
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Campaign"
                )}
              </Button>
            </>
          )}
          {result && (
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

