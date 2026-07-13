'use client'

import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'

function BookingLinkRow({
  label,
  description,
  path,
}: {
  label: string
  description: string
  path: string
}) {
  const [copied, setCopied] = useState(false)
  const fullUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${path}` : path

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      toast({ title: 'Link copied' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      <div className="flex gap-2">
        <Input readOnly value={fullUrl} className="h-9 bg-white text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => void handleCopy()}
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" asChild>
          <a href={fullUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label}`}>
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  )
}

export function PublicBookingLink({
  code,
  websiteEnabled = false,
  miniSiteBookPath,
}: {
  code: string
  websiteEnabled?: boolean
  miniSiteBookPath?: string
}) {
  const standalonePath = `/book/${code}`
  const showMiniSite = websiteEnabled && Boolean(miniSiteBookPath)

  return (
    <div className="space-y-4 rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50/80 to-white p-4">
      <div>
        <p className="text-sm font-medium text-slate-800">Booking links</p>
        <p className="mt-1 text-xs text-slate-500">
          Share on Instagram, WhatsApp, or Google so clients can book 24/7.
        </p>
      </div>

      {showMiniSite ? (
        <BookingLinkRow
          label="Mini-site booking (recommended)"
          description="Opens booking inside your salon website — same flow as Book Appointment on your mini-site."
          path={miniSiteBookPath!}
        />
      ) : null}

      <BookingLinkRow
        label={showMiniSite ? 'Standalone booking page' : 'Public booking link'}
        description={
          showMiniSite
            ? 'Direct booking-only page without your mini-site header and catalog.'
            : 'Classic booking page when your salon mini-site is off or not on your plan.'
        }
        path={standalonePath}
      />
    </div>
  )
}
