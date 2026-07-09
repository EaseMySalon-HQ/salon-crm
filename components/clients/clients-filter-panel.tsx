"use client"

import { MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type ClientFilterState,
  type ClientGender,
  GENDER_OPTIONS,
  LAST_VISIT_OPTIONS,
} from "@/lib/client-segments"

interface ClientsFilterPanelProps {
  filters: ClientFilterState
  onChange: (next: ClientFilterState) => void
}

export function ClientsFilterPanel({ filters, onChange }: ClientsFilterPanelProps) {
  const toggleGender = (gender: ClientGender) => {
    const has = filters.genders.includes(gender)
    onChange({
      ...filters,
      genders: has
        ? filters.genders.filter((g) => g !== gender)
        : [...filters.genders, gender],
    })
  }

  return (
    <div className="space-y-5 w-[min(20rem,calc(100vw-2rem))]">
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Gender
        </Label>
        <div className="flex flex-wrap gap-2">
          {GENDER_OPTIONS.map((opt) => {
            const active = filters.genders.includes(opt.id)
            return (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-8 rounded-full px-3 text-xs capitalize"
                onClick={() => toggleGender(opt.id)}
              >
                {opt.label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
        <div>
          <Label htmlFor="birthday-month" className="text-sm font-medium text-slate-800">
            Birthday this month
          </Label>
          <p className="text-xs text-slate-500">Great for birthday offers</p>
        </div>
        <Switch
          id="birthday-month"
          checked={filters.birthdayThisMonth}
          onCheckedChange={(birthdayThisMonth) => onChange({ ...filters, birthdayThisMonth })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-800">Last visit</Label>
        <Select
          value={filters.lastVisit}
          onValueChange={(lastVisit) =>
            onChange({ ...filters, lastVisit: lastVisit as ClientFilterState["lastVisit"] })
          }
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Any time" />
          </SelectTrigger>
          <SelectContent>
            {LAST_VISIT_OPTIONS.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-slate-800">Total spend (₹)</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min"
            value={filters.spendMin}
            onChange={(e) => onChange({ ...filters, spendMin: e.target.value })}
            className="h-10"
          />
          <Input
            type="number"
            min={0}
            placeholder="Max"
            value={filters.spendMax}
            onChange={(e) => onChange({ ...filters, spendMax: e.target.value })}
            className="h-10"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
          <div>
            <Label htmlFor="whatsapp-opt-in" className="text-sm font-medium text-slate-800">
              WhatsApp promo opt-in
            </Label>
            <p className="text-xs text-slate-500">Eligible for marketing messages</p>
          </div>
        </div>
        <Switch
          id="whatsapp-opt-in"
          checked={filters.whatsappOptIn}
          onCheckedChange={(whatsappOptIn) => onChange({ ...filters, whatsappOptIn })}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
        <div>
          <Label htmlFor="has-dues" className="text-sm font-medium text-slate-800">
            Has outstanding dues
          </Label>
          <p className="text-xs text-slate-500">Unpaid or partially paid bills</p>
        </div>
        <Switch
          id="has-dues"
          checked={filters.hasDues}
          onCheckedChange={(hasDues) => onChange({ ...filters, hasDues })}
        />
      </div>
    </div>
  )
}
