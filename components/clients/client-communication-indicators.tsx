"use client"

import { MessageCircle, Smartphone } from "lucide-react"
import {
  normalizeClientCommunicationConsent,
  type ClientCommunicationConsent,
} from "@/lib/client-communication-consent"
import { cn } from "@/lib/utils"

type Source = ClientCommunicationConsent & {
  isWalkIn?: boolean
  whatsappConsent?: { optedIn?: boolean; waMarketingOptOut?: boolean }
}

function Indicator({
  enabled,
  enabledClass,
  disabledClass,
  title,
  children,
}: {
  enabled: boolean
  enabledClass: string
  disabledClass: string
  title: string
  children: React.ReactNode
}) {
  return (
    <span
      title={`${title}: ${enabled ? "Enabled" : "Disabled"}`}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full border",
        enabled ? enabledClass : disabledClass
      )}
      aria-label={`${title} ${enabled ? "enabled" : "disabled"}`}
    >
      {children}
    </span>
  )
}

export function ClientCommunicationIndicators({
  client,
  className,
}: {
  client: Source
  className?: string
}) {
  if (client.isWalkIn) return null

  const c = normalizeClientCommunicationConsent(client)
  const waOn = "border-emerald-200 bg-emerald-50 text-emerald-600"
  const waOff = "border-slate-200 bg-slate-100 text-slate-400"
  const smsOn = "border-sky-200 bg-sky-50 text-sky-600"
  const smsOff = "border-slate-200 bg-slate-100 text-slate-400"

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Indicator
        enabled={c.promotionalWhatsappEnabled}
        enabledClass={waOn}
        disabledClass={waOff}
        title="Promotional WhatsApp"
      >
        <MessageCircle className="h-3 w-3" />
      </Indicator>
      <Indicator
        enabled={c.transactionalWhatsappEnabled}
        enabledClass={waOn}
        disabledClass={waOff}
        title="Transactional WhatsApp"
      >
        <span className="text-[9px] font-bold leading-none">T</span>
      </Indicator>
      <Indicator
        enabled={c.transactionalSmsEnabled}
        enabledClass={smsOn}
        disabledClass={smsOff}
        title="Transactional SMS"
      >
        <Smartphone className="h-3 w-3" />
      </Indicator>
    </span>
  )
}
