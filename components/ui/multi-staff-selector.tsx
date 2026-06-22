"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { X, ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  STAFF_SHARE_VALIDATION_MESSAGE,
  buildStaffContributions,
  equalStaffSharePercentages,
  isStaffShareValid,
} from "@/lib/staff-share-utils"

export interface StaffContribution {
  staffId: string
  staffName: string
  percentage?: number
  amount?: number
}

interface MultiStaffSelectorProps {
  staffList: Array<{ _id?: string; id?: string; name: string; role?: string }>
  serviceTotal?: number
  onStaffContributionsChange: (contributions: StaffContribution[]) => void
  onValidationChange?: (valid: boolean) => void
  initialContributions?: StaffContribution[]
  disabled?: boolean
  compact?: boolean
  selectStaffFlex?: number
  addStaffFlex?: number
  hideShareEditor?: boolean
  placeholder?: string
  popoverContentClassName?: string
  /** Portal target inside Sheet/Dialog (see CategoryCombobox). Falls back to an in-tree anchor. */
  portalContainer?: HTMLElement | null
  /** When set, staff share row (2+ staff) renders in this host instead of below the trigger. */
  shareRowHost?: HTMLElement | null
  /** When true with hideShareEditor, show % inputs inside the staff dropdown for selected staff (2+). */
  shareEditorInDropdown?: boolean
}

function staffKey(staff: { _id?: string; id?: string }) {
  return staff._id || staff.id || ""
}

export function MultiStaffSelector({
  staffList,
  serviceTotal = 0,
  onStaffContributionsChange,
  onValidationChange,
  initialContributions = [],
  disabled = false,
  compact = false,
  selectStaffFlex,
  addStaffFlex: _addStaffFlex,
  hideShareEditor = false,
  placeholder = "Select staff",
  popoverContentClassName,
  portalContainer: portalContainerProp,
  shareRowHost,
  shareEditorInDropdown = false,
}: MultiStaffSelectorProps) {
  const sharesManuallyEdited = useRef(false)
  const onChangeRef = useRef(onStaffContributionsChange)
  onChangeRef.current = onStaffContributionsChange
  const [portalContainerLocal, setPortalContainerLocal] = useState<HTMLElement | null>(null)
  const portalContainer = portalContainerProp ?? portalContainerLocal
  const [open, setOpen] = useState(false)
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(() =>
    initialContributions.map((c) => c.staffId).filter(Boolean)
  )
  const [percentages, setPercentages] = useState<number[]>(() => {
    const ids = initialContributions.map((c) => c.staffId).filter(Boolean)
    if (ids.length === 0) return []
    if (initialContributions.some((c) => Number(c.percentage) > 0)) {
      return initialContributions.map((c) => Number(c.percentage) || 0)
    }
    return equalStaffSharePercentages(ids.length)
  })

  const applyEqualSplit = useCallback((ids: string[]) => {
    setPercentages(equalStaffSharePercentages(ids.length))
  }, [])

  const contributions = useMemo(
    () => buildStaffContributions(selectedStaffIds, staffList, percentages, serviceTotal),
    [selectedStaffIds, staffList, percentages, serviceTotal]
  )

  const shareValid = useMemo(() => {
    if (selectedStaffIds.length === 0) return false
    if (selectedStaffIds.length === 1) return true
    return isStaffShareValid(contributions)
  }, [selectedStaffIds.length, contributions])

  const lastEmittedRef = useRef<string>("")
  const skipInitialEmptyEmitRef = useRef(true)

  useEffect(() => {
    const payload = JSON.stringify(contributions)
    if (payload === lastEmittedRef.current) return
    if (skipInitialEmptyEmitRef.current && contributions.length === 0) {
      skipInitialEmptyEmitRef.current = false
      lastEmittedRef.current = payload
      return
    }
    lastEmittedRef.current = payload
    onChangeRef.current(contributions)
  }, [contributions])

  useEffect(() => {
    onValidationChange?.(shareValid)
  }, [shareValid, onValidationChange])

  const toggleStaff = (staffId: string, checked: boolean) => {
    if (disabled) return
    if (checked) {
      if (selectedStaffIds.includes(staffId)) return
      const nextIds = [...selectedStaffIds, staffId]
      setSelectedStaffIds(nextIds)
      if (!sharesManuallyEdited.current) {
        applyEqualSplit(nextIds)
      } else {
        setPercentages((prev) => [...prev, 0])
      }
      return
    }
    const idx = selectedStaffIds.indexOf(staffId)
    if (idx < 0) return
    const nextIds = selectedStaffIds.filter((id) => id !== staffId)
    setSelectedStaffIds(nextIds)
    setPercentages((prev) => prev.filter((_, i) => i !== idx))
    if (!sharesManuallyEdited.current && nextIds.length > 0) {
      applyEqualSplit(nextIds)
    }
  }

  const removeStaff = (staffId: string) => toggleStaff(staffId, false)

  const handlePercentageChange = (index: number, raw: string) => {
    sharesManuallyEdited.current = true
    const value = raw === "" ? 0 : Math.min(100, Math.max(0, parseFloat(raw) || 0))
    setPercentages((prev) => prev.map((p, i) => (i === index ? value : p)))
  }

  const showShareEditor = !hideShareEditor && selectedStaffIds.length >= 2
  const showShareInDropdown =
    shareEditorInDropdown && hideShareEditor && selectedStaffIds.length >= 2

  const sharePercentInput = (index: number, staffName: string, className?: string) => (
    <div
      className={cn(
        "inline-flex h-6 shrink-0 items-center justify-end rounded-md border border-input bg-background px-1",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="shrink-0 text-[10px] leading-none text-muted-foreground" aria-hidden>
        %
      </span>
      <Input
        type="number"
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        value={Number.isFinite(percentages[index]) ? percentages[index] : 0}
        onChange={(e) => handlePercentageChange(index, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="h-5 w-7 min-w-0 border-0 bg-transparent p-0 pl-0.5 text-right text-[11px] font-medium leading-none tabular-nums shadow-none outline-none [appearance:textfield] focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label={`${staffName} share percentage`}
      />
    </div>
  )

  const triggerLabel = useMemo(() => {
    if (selectedStaffIds.length === 0) return null
    if (selectedStaffIds.length === 1) {
      const staff = staffList.find((s) => staffKey(s) === selectedStaffIds[0])
      return staff?.name || "Staff"
    }
    return `${selectedStaffIds.length} staff selected`
  }, [selectedStaffIds, staffList])

  const triggerStyle =
    selectStaffFlex != null ? { flex: selectStaffFlex } : compact ? undefined : { flex: 1 }

  const shareRow = showShareEditor ? (
    <div className="space-y-1">
      <div
        className={cn(
          "flex items-center gap-2 text-xs",
          compact ? "flex-nowrap overflow-x-auto pb-0.5" : "flex-wrap"
        )}
      >
        {contributions.map((c, index) => (
          <div
            key={c.staffId}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200/90 bg-emerald-50/95 py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-emerald-900 shadow-sm"
          >
            <span className="max-w-[6.5rem] truncate">{c.staffName}</span>
            <div className="inline-flex h-5 min-w-[2.5rem] items-center rounded-full border border-emerald-200/70 bg-background/95 px-1">
              <span
                className="shrink-0 text-[9px] leading-none text-emerald-600/90"
                aria-hidden
              >
                %
              </span>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={disabled}
                value={Number.isFinite(percentages[index]) ? percentages[index] : 0}
                onChange={(e) => handlePercentageChange(index, e.target.value)}
                className="h-4 w-7 min-w-0 border-0 bg-transparent p-0 pl-0.5 text-right text-[11px] font-semibold leading-none tabular-nums text-emerald-800 shadow-none outline-none [appearance:textfield] focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-label={`${c.staffName} share percentage`}
              />
            </div>
            {!disabled && (
              <button
                type="button"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-emerald-700/80 transition-colors hover:bg-emerald-100 hover:text-emerald-900"
                onClick={() => removeStaff(c.staffId)}
                aria-label={`Remove ${c.staffName}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      {!shareValid && (
        <p className={cn("text-red-600", compact ? "text-[11px]" : "text-xs")}>
          {STAFF_SHARE_VALIDATION_MESSAGE}
        </p>
      )}
    </div>
  ) : null

  const shareRowInline = shareRowHost ? null : shareRow
  const shareRowPortaled =
    shareRowHost && shareRow ? createPortal(shareRow, shareRowHost) : null

  return (
    <div
      className={cn(
        "min-w-0 w-full",
        !shareRowHost && (compact ? "space-y-1" : "space-y-2")
      )}
    >
      {!portalContainerProp ? <div ref={setPortalContainerLocal} aria-hidden /> : null}
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || staffList.length === 0}
            aria-expanded={open}
            aria-haspopup="listbox"
            className={cn(
              "h-8 w-full justify-between gap-2 px-2 py-1.5 text-left font-normal",
              !compact && "min-h-8"
            )}
            style={triggerStyle}
          >
            <span className="min-w-0 flex-1 truncate text-xs">
              {triggerLabel ? (
                triggerLabel
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          container={portalContainer ?? undefined}
          className={cn("w-[min(100vw-2rem,280px)] p-2 !z-[9999]", popoverContentClassName)}
          align="start"
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-56 space-y-0.5 overflow-y-auto" role="listbox" aria-multiselectable>
            {staffList.map((staff) => {
              const id = staffKey(staff)
              if (!id) return null
              const checked = selectedStaffIds.includes(id)
              const shareIndex = selectedStaffIds.indexOf(id)
              return (
                <div
                  key={id}
                  role="option"
                  aria-selected={checked}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <button
                    type="button"
                    aria-label={checked ? `Deselect ${staff.name}` : `Select ${staff.name}`}
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      checked && "bg-primary text-primary-foreground"
                    )}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleStaff(id, !checked)
                    }}
                  >
                    {checked ? <Check className="h-3 w-3" aria-hidden /> : null}
                  </button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded-sm px-0.5 py-0.5 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      toggleStaff(id, !checked)
                      setOpen(false)
                    }}
                  >
                    {staff.name}
                  </button>
                  {showShareInDropdown && checked && shareIndex >= 0
                    ? sharePercentInput(shareIndex, staff.name, "ml-auto w-11 justify-end")
                    : showShareInDropdown
                      ? <span className="ml-auto w-11 shrink-0" aria-hidden />
                      : null}
                </div>
              )
            })}
          </div>
          {showShareInDropdown && !shareValid ? (
            <p className="mt-2 border-t border-border/60 pt-2 text-[11px] text-red-600">
              {STAFF_SHARE_VALIDATION_MESSAGE}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>

      {shareRowInline}
      {shareRowPortaled}

      {compact && selectedStaffIds.length >= 2 && hideShareEditor && !shareValid && (
        <p className="text-[11px] text-red-600">{STAFF_SHARE_VALIDATION_MESSAGE}</p>
      )}
    </div>
  )
}
