"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type ClientBirthdateFieldProps = {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  inputClassName?: string
  showDescription?: boolean
}

export function ClientBirthdateField({
  id,
  value,
  onChange,
  disabled,
  className,
  inputClassName,
  showDescription = true,
}: ClientBirthdateFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>Birthday</Label>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputClassName}
      />
      {showDescription ? (
        <p className="text-xs text-muted-foreground">
          Optional. Used for birthday WhatsApp messages and offers.
        </p>
      ) : null}
    </div>
  )
}
