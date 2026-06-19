"use client"

import { useState } from "react"
import { Copy, Check, ExternalLink } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"

export function PublicBookingLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const fullUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/book/${code}`
      : `/book/${code}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      toast({ title: "Booking link copied" })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" })
    }
  }

  return (
    <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50/80 to-white p-4">
      <p className="text-sm font-medium text-slate-800">Public booking link</p>
      <p className="mt-1 text-xs text-slate-500">
        Share on Instagram, WhatsApp, or Google so clients can book 24/7.
      </p>
      <div className="mt-3 flex gap-2">
        <Input readOnly value={fullUrl} className="h-9 text-xs bg-white" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={handleCopy}
          aria-label="Copy booking link"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" asChild>
          <a href={fullUrl} target="_blank" rel="noopener noreferrer" aria-label="Open booking page">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  )
}
