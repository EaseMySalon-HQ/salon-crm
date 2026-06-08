"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { ClientCommunicationConsent } from "@/lib/client-communication-consent"
import { cn } from "@/lib/utils"

type Props = {
  value: ClientCommunicationConsent
  onChange: (value: ClientCommunicationConsent) => void
  disabled?: boolean
  variant?: "compact" | "grouped"
  className?: string
}

function ConsentCheckbox({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5"
      />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal leading-snug text-slate-700">
        {label}
      </Label>
    </div>
  )
}

export function ClientCommunicationConsentFields({
  value,
  onChange,
  disabled = false,
  variant = "compact",
  className,
}: Props) {
  const setField = (key: keyof ClientCommunicationConsent, checked: boolean) => {
    onChange({ ...value, [key]: checked })
  }

  if (variant === "compact") {
    return (
      <div className={cn("space-y-2.5", className)}>
        <ConsentCheckbox
          id="promo-wa"
          label="Promotional WhatsApp Messages"
          checked={value.promotionalWhatsappEnabled}
          disabled={disabled}
          onCheckedChange={(c) => setField("promotionalWhatsappEnabled", c)}
        />
        <ConsentCheckbox
          id="txn-wa"
          label="Transactional WhatsApp Messages"
          checked={value.transactionalWhatsappEnabled}
          disabled={disabled}
          onCheckedChange={(c) => setField("transactionalWhatsappEnabled", c)}
        />
        <ConsentCheckbox
          id="txn-sms"
          label="Transactional SMS"
          checked={value.transactionalSmsEnabled}
          disabled={disabled}
          onCheckedChange={(c) => setField("transactionalSmsEnabled", c)}
        />
      </div>
    )
  }

  return (
    <div className={cn("space-y-4 rounded-xl border border-slate-200 bg-white p-4", className)}>
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Communication Channel</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Control which messages this client can receive.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">WhatsApp</p>
        <div className="space-y-2 pl-1">
          <ConsentCheckbox
            id="grouped-promo-wa"
            label="Promotional Message"
            checked={value.promotionalWhatsappEnabled}
            disabled={disabled}
            onCheckedChange={(c) => setField("promotionalWhatsappEnabled", c)}
          />
          <ConsentCheckbox
            id="grouped-txn-wa"
            label="Transactional Message"
            checked={value.transactionalWhatsappEnabled}
            disabled={disabled}
            onCheckedChange={(c) => setField("transactionalWhatsappEnabled", c)}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">SMS</p>
        <div className="pl-1">
          <ConsentCheckbox
            id="grouped-txn-sms"
            label="Transactional Message"
            checked={value.transactionalSmsEnabled}
            disabled={disabled}
            onCheckedChange={(c) => setField("transactionalSmsEnabled", c)}
          />
        </div>
      </div>
    </div>
  )
}
