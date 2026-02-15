"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { X, Plus } from "lucide-react"

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
  initialContributions?: StaffContribution[]
  disabled?: boolean
  /** When true, Select is compact (half width). Expands when multiple staff added. */
  compact?: boolean
  /** Flex ratio for Select Staff (e.g. 1.5). Used with addStaffFlex. */
  selectStaffFlex?: number
  /** Flex ratio for Add Staff button (e.g. 0.5). Used with selectStaffFlex. */
  addStaffFlex?: number
}

export function MultiStaffSelector({
  staffList,
  serviceTotal = 0,
  onStaffContributionsChange,
  initialContributions = [],
  disabled = false,
  compact = false,
  selectStaffFlex,
  addStaffFlex
}: MultiStaffSelectorProps) {
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(
    initialContributions.map(c => c.staffId)
  )
  // Convert selected staff IDs to contributions
  const contributions: StaffContribution[] = selectedStaffIds.map(staffId => {
    const staff = staffList.find(s => (s._id || s.id) === staffId)
    return {
      staffId,
      staffName: staff?.name || 'Unknown Staff',
      percentage: selectedStaffIds.length > 0 ? 100 / selectedStaffIds.length : 0,
      amount: selectedStaffIds.length > 0 ? serviceTotal / selectedStaffIds.length : 0
    }
  })

  // Notify parent component when selections change
  useEffect(() => {
    onStaffContributionsChange(contributions)
  }, [selectedStaffIds, serviceTotal])

  const handleAddStaff = (staffId: string) => {
    if (!selectedStaffIds.includes(staffId)) {
      setSelectedStaffIds(prev => [...prev, staffId])
    }
  }

  const removeStaff = (staffId: string) => {
    setSelectedStaffIds(prev => prev.filter(id => id !== staffId))
  }

  const availableStaff = staffList.filter(staff => 
    !selectedStaffIds.includes(staff._id || staff.id || '')
  )

  const isCompact = compact && selectedStaffIds.length <= 1

  const StaffBadge = ({ staffId }: { staffId: string }) => {
    const staff = staffList.find(s => (s._id || s.id) === staffId)
    const contribution = contributions.find(c => c.staffId === staffId)
    return (
      <div className="flex items-center bg-green-50 border border-green-200 rounded-full px-2 py-0.5 text-xs shrink-0 whitespace-nowrap">
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></div>
        <span className="font-medium text-green-800 mr-1">{staff?.name}</span>
        <span className="text-green-600 mr-1">
          {contribution?.percentage?.toFixed(0)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => removeStaff(staffId)}
          disabled={disabled}
          className="h-3 w-3 p-0 hover:bg-red-100 hover:text-red-600 ml-1"
        >
          <X className="h-2 w-2" />
        </Button>
      </div>
    )
  }

  const selectStyle = selectStaffFlex != null ? { flex: selectStaffFlex } : (isCompact ? undefined : { flex: 1 })
  const addStaffStyle = addStaffFlex != null ? { flex: addStaffFlex } : undefined

  const primaryStaffId = selectedStaffIds[0] || ""
  const showAllAsPills = selectedStaffIds.length >= 2

  const handlePrimaryChange = (value: string) => {
    if (!value || value === "__clear__") {
      setSelectedStaffIds([])
      return
    }
    setSelectedStaffIds([value])
  }

  return (
    <div className="flex items-center gap-1 flex-nowrap min-w-0 w-full">
      {/* 0 staff: Select with placeholder. 1 staff: Select showing name. 2+ staff: all as green pills */}
      {showAllAsPills ? (
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto overflow-y-hidden" style={selectStyle}>
          {selectedStaffIds.map((staffId) => (
            <StaffBadge key={staffId} staffId={staffId} />
          ))}
        </div>
      ) : (
        <div
          className={isCompact && !selectStaffFlex ? "min-w-0 max-w-[140px] shrink-0" : "min-w-0"}
          style={selectStyle}
        >
          <Select
            value={primaryStaffId}
            onValueChange={handlePrimaryChange}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select staff" />
            </SelectTrigger>
            <SelectContent>
              {primaryStaffId && (
                <SelectItem value="__clear__">
                  <span className="text-muted-foreground">— Clear —</span>
                </SelectItem>
              )}
              {staffList.map((staff) => {
                const staffId = staff._id || staff.id
                return (
                  <SelectItem key={staffId} value={staffId || ''}>
                    {staff.name}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Add Staff: dropdown to add more (same row) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || availableStaff.length === 0}
            className="h-8 px-2 text-xs shrink-0"
            style={addStaffStyle}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Staff
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-60 overflow-auto">
          {availableStaff.map((staff) => {
            const staffId = staff._id || staff.id
            return (
              <DropdownMenuItem
                key={staffId}
                onClick={() => handleAddStaff(staffId || '')}
              >
                {staff.name}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
