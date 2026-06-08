"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Building2, Loader2, MapPin } from "lucide-react"

import { AuthAPI, type AuthBranchOption } from "@/lib/api"
import {
  BRANCH_OPTIONS_STORAGE_KEY,
  BRANCH_PREAUTH_STORAGE_KEY,
} from "@/lib/auth-context"
import { setCsrfTokenPersisted } from "@/lib/csrf"
import { toast } from "@/components/ui/use-toast"

function readBranchOptions(): AuthBranchOption[] {
  try {
    const raw = sessionStorage.getItem(BRANCH_OPTIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AuthBranchOption[]) : []
  } catch {
    return []
  }
}

function branchInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "B"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function BranchPicker() {
  const router = useRouter()
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null)
  const [branches, setBranches] = useState<AuthBranchOption[]>([])
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const token = sessionStorage.getItem(BRANCH_PREAUTH_STORAGE_KEY)
    const options = readBranchOptions()
    if (!token || options.length === 0) {
      router.replace("/login")
      return
    }
    setPreAuthToken(token)
    setBranches(options)
    setReady(true)
  }, [router])

  const isBusy = selectingId !== null

  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => a.name.localeCompare(b.name)),
    [branches]
  )

  async function handleSelect(branch: AuthBranchOption) {
    if (!preAuthToken || isBusy) return
    setSelectingId(branch.id)
    try {
      const response = await AuthAPI.selectBranch(branch.id, preAuthToken)
      if (!response.success || !response.data?.user) {
        toast({
          title: "Could not open branch",
          description:
            (response as { message?: string }).message ||
            "This branch is no longer available. Please sign in again.",
          variant: "destructive",
        })
        setSelectingId(null)
        return
      }

      const csrfToken = response.data.csrfToken
      if (csrfToken && typeof csrfToken === "string") {
        setCsrfTokenPersisted(csrfToken)
      }

      try {
        localStorage.setItem("salon-auth-user", JSON.stringify(response.data.user))
        sessionStorage.removeItem(BRANCH_PREAUTH_STORAGE_KEY)
        sessionStorage.removeItem(BRANCH_OPTIONS_STORAGE_KEY)
      } catch {
        /* private mode / quota — cookie session still works */
      }

      // Full page navigation so AuthProvider re-reads the freshly-issued session cookies.
      window.location.assign("/dashboard")
    } catch {
      toast({
        title: "Session expired",
        description: "Your branch selection window expired. Please sign in again.",
        variant: "destructive",
      })
      router.replace("/login")
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#7C3AED]" />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Select a branch to continue
        </h1>
        <p className="text-sm text-slate-500">
          Your account manages multiple branches. Pick one to open its dashboard.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sortedBranches.map((branch) => {
          const isSelecting = selectingId === branch.id
          return (
            <button
              key={branch.id}
              type="button"
              disabled={isBusy}
              onClick={() => handleSelect(branch)}
              className="group relative flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#7C3AED]/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 text-sm font-bold text-[#7C3AED]">
                {branch.logo ? (
                  <Image
                    src={branch.logo}
                    alt={branch.name}
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span>{branchInitials(branch.name)}</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-slate-900">
                  {branch.name}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  {branch.city ? (
                    <>
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{branch.city}</span>
                    </>
                  ) : (
                    <>
                      <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{branch.code}</span>
                    </>
                  )}
                </div>
              </div>

              {isSelecting && (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#7C3AED]" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
