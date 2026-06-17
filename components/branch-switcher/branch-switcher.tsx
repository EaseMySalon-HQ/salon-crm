"use client"

import { useState } from "react"
import { Building2, Check, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/lib/auth-context"
import { AuthAPI, type AuthBranchOption } from "@/lib/api"
import { useMyBranches } from "@/hooks/use-my-branches"

/**
 * Switch the active branch mid-session. The server issues fresh session cookies
 * for the chosen branch, so we clear the cached profile and hard-reload to refetch
 * every tenant-scoped query. Owner-only with 2+ active branches.
 */
export function switchToBranch(branchId: string): Promise<boolean> {
  return AuthAPI.switchBranch(branchId)
    .then((res) => {
      if (!res.success) return false
      try {
        localStorage.removeItem("salon-auth-user")
      } catch {
        /* ignore */
      }
      window.location.reload()
      return true
    })
    .catch(() => false)
}

const pillClassName =
  "group relative flex items-center gap-3 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 hover:from-indigo-100 hover:via-purple-100 hover:to-pink-100 border border-indigo-100/50 hover:border-indigo-200/70 transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/20 overflow-hidden"

interface BranchSwitcherProps {
  businessName: string
  isLoadingName?: boolean
}

function BranchNamePill({
  label,
  isLoadingName,
  isMultiBranch,
}: {
  label: string
  isLoadingName?: boolean
  isMultiBranch?: boolean
}) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative z-10">
        <div className="w-2.5 h-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full shadow-sm" />
      </div>

      <span className="relative z-10 text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-700 group-hover:from-indigo-800 group-hover:via-purple-800 group-hover:to-pink-800 transition-all duration-300 max-w-[12rem] truncate sm:max-w-[16rem]">
        {isLoadingName ? (
          <span className="inline-block w-28 h-4 bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200 rounded" />
        ) : (
          label
        )}
      </span>

      {isMultiBranch ? (
        <ChevronDown
          className="relative z-10 h-3.5 w-3.5 shrink-0 text-purple-600/70 group-hover:text-purple-700 transition-colors duration-300"
          aria-hidden
        />
      ) : (
        <div className="relative z-10">
          <div className="w-1.5 h-1.5 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300" />
        </div>
      )}

      <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 group-hover:w-full transition-all duration-300 ease-out" />
    </>
  )
}

export function BranchSwitcher({ businessName, isLoadingName = false }: BranchSwitcherProps) {
  const { user } = useAuth()
  const { branches, isMultiBranch } = useMyBranches()
  const [switchingBranchId, setSwitchingBranchId] = useState<string | null>(null)

  const currentBranch = branches.find((b) => String(b.id) === String(user?.branchId))
  const displayName = currentBranch?.name || businessName

  const handleSwitchBranch = async (branch: AuthBranchOption) => {
    if (user?.isImpersonation) return
    if (switchingBranchId || String(branch.id) === String(user?.branchId)) return
    setSwitchingBranchId(branch.id)
    const ok = await switchToBranch(branch.id)
    if (!ok) setSwitchingBranchId(null)
  }

  if (!isMultiBranch) {
    return (
      <div className={pillClassName}>
        <BranchNamePill label={displayName} isLoadingName={isLoadingName} />
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${pillClassName} cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2`}
          aria-label="Switch branch"
          disabled={switchingBranchId !== null}
        >
          <BranchNamePill label={displayName} isLoadingName={isLoadingName} isMultiBranch />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch branch</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((branch) => {
          const isCurrent = String(branch.id) === String(user?.branchId)
          return (
            <DropdownMenuItem
              key={branch.id}
              disabled={switchingBranchId !== null || isCurrent}
              onSelect={(event) => {
                event.preventDefault()
                handleSwitchBranch(branch)
              }}
              className="flex cursor-pointer items-center gap-2"
            >
              <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm ${
                    isCurrent ? "font-semibold text-slate-900" : "text-slate-700"
                  }`}
                >
                  {branch.name}
                </span>
                {branch.city && (
                  <span className="block truncate text-xs text-slate-400">{branch.city}</span>
                )}
              </span>
              {isCurrent && <Check className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
