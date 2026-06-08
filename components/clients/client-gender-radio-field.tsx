"use client"

import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

export type ClientGenderValue = "" | "male" | "female"

interface ClientGenderRadioFieldProps {
  idPrefix?: string
  value: ClientGenderValue
  onChange: (value: "male" | "female") => void
  disabled?: boolean
  className?: string
}

export function ClientGenderRadioField({
  idPrefix = "client-gender",
  value,
  onChange,
  disabled,
  className,
}: ClientGenderRadioFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-sm font-medium">Gender *</Label>
      <RadioGroup
        value={value || undefined}
        onValueChange={(v) => onChange(v as "male" | "female")}
        className="flex flex-row flex-wrap gap-x-4 gap-y-2"
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="male" id={`${idPrefix}-male`} />
          <Label htmlFor={`${idPrefix}-male`} className="cursor-pointer font-normal">
            Male
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="female" id={`${idPrefix}-female`} />
          <Label htmlFor={`${idPrefix}-female`} className="cursor-pointer font-normal">
            Female
          </Label>
        </div>
      </RadioGroup>
    </div>
  )
}

export function isClientGenderSelected(gender: string | undefined): gender is "male" | "female" {
  return gender === "male" || gender === "female"
}
