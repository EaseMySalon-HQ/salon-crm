"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, X } from "lucide-react"
import {
  WHATSAPP_DATA_FIELD_OPTIONS,
  gupshupPlaceholderLabel,
  nextTemplateVariableKey,
  sortTemplateVariableKeys,
} from "@/lib/whatsapp-template-data-fields"

interface WhatsAppVariableMappingEditorProps {
  mapping: Record<string, string>
  onChange: (mapping: Record<string, string>) => void
  /** Optional hint shown above the rows */
  hint?: string
}

export function WhatsAppVariableMappingEditor({
  mapping,
  onChange,
  hint,
}: WhatsAppVariableMappingEditorProps) {
  const keys = sortTemplateVariableKeys(Object.keys(mapping))

  const updateField = (varName: string, dataField: string) => {
    onChange({ ...mapping, [varName]: dataField })
  }

  const removeVar = (varName: string) => {
    const next = { ...mapping }
    delete next[varName]
    onChange(next)
  }

  const addVar = () => {
    const varName = nextTemplateVariableKey(Object.keys(mapping))
    onChange({ ...mapping, [varName]: '' })
  }

  return (
    <div className="space-y-3">
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center">
          No variables mapped yet. Add one row per {"{{n}}"} placeholder in your approved Gupshup template.
        </p>
      ) : (
        <div className="space-y-2">
          {keys.map((varName) => (
            <div key={varName} className="flex items-center gap-2">
              <div className="w-16 shrink-0">
                <Label className="text-xs font-mono text-muted-foreground">
                  {gupshupPlaceholderLabel(varName)}
                </Label>
                <p className="text-[10px] text-muted-foreground/80">{varName}</p>
              </div>
              <Select
                value={mapping[varName] || '__unset__'}
                onValueChange={(value) => updateField(varName, value === '__unset__' ? '' : value)}
              >
                <SelectTrigger className="h-9 flex-1 text-sm">
                  <SelectValue placeholder="Select data field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">— Select field —</SelectItem>
                  {WHATSAPP_DATA_FIELD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => removeVar(varName)}
                title="Remove variable"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={addVar} className="w-full">
        <Plus className="h-3 w-3 mr-1" />
        Add variable
      </Button>
    </div>
  )
}
