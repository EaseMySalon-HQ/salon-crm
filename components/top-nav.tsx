"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Bell, Plus, User, Receipt, Settings, LogOut, Banknote, Clock, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import { SettingsAPI, ClientsAPI } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { useTodayOnlineSales } from "@/hooks/use-today-online-sales"
import { ExpenseForm } from "@/components/expenses/expense-form"
import { CashRegistryModal } from "@/components/cash-registry/cash-registry-modal"
import { SessionStatus } from "@/components/auth/session-status"
import { ClientDetailsDrawer } from "@/components/clients/client-details-drawer"
import type { Client } from "@/lib/client-store"

function searchHitToClient(c: any): Client {
  const id = String(c._id || c.id || "")
  return {
    ...c,
    id,
    _id: id,
    name: c.name || "",
    phone: c.phone || "",
    email: c.email,
    birthdate: c.birthdate || c.dob || undefined,
  }
}

interface TopNavProps {
  showQuickAdd?: boolean
  rightSlot?: React.ReactNode
}

export function TopNav({ showQuickAdd = true, rightSlot }: TopNavProps) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [showExpenseDialog, setShowExpenseDialog] = useState(false)
  const [showCashRegistryModal, setShowCashRegistryModal] = useState(false)
  const { amount: todayOnlineSales } = useTodayOnlineSales(showCashRegistryModal)
  const queryClient = useQueryClient()
  const { data: businessSettingsData, isLoading: isLoadingBusinessName } = useQuery({
    queryKey: ["settings", "business"],
    queryFn: async () => {
      const response = await SettingsAPI.getBusinessSettings()
      if (!response?.success || !response.data) {
        throw new Error(typeof response?.error === "string" ? response.error : "Failed to load business settings")
      }
      return response.data
    },
    staleTime: 5 * 60_000,
    enabled: !!user,
  })
  const businessName = businessSettingsData?.name || "EaseMySalon"

  const [clientSearch, setClientSearch] = useState("")
  const [clientResults, setClientResults] = useState<any[]>([])
  const [clientSearchOpen, setClientSearchOpen] = useState(false)
  const clientSearchRef = useRef<HTMLDivElement>(null)
  const [clientDetailsDrawerOpen, setClientDetailsDrawerOpen] = useState(false)
  const [clientDetailsDrawerClient, setClientDetailsDrawerClient] = useState<Client | null>(null)

  useEffect(() => {
    const handleBusinessSettingsUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "business"] })
    }
    window.addEventListener("business-settings-updated", handleBusinessSettingsUpdate)
    return () => window.removeEventListener("business-settings-updated", handleBusinessSettingsUpdate)
  }, [queryClient])

  useEffect(() => {
    const q = clientSearch.trim()
    if (q.length < 2) {
      setClientResults([])
      return
    }
    const t = setTimeout(() => {
      ClientsAPI.search(q)
        .then((res) => {
          if (res.success && Array.isArray(res.data)) setClientResults(res.data)
          else setClientResults([])
        })
        .catch(() => setClientResults([]))
    }, 280)
    return () => clearTimeout(t)
  }, [clientSearch])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!clientSearchRef.current?.contains(e.target as Node)) setClientSearchOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  const handleQuickAdd = (path: string) => {
    if (path === "/expenses/new") {
      window.setTimeout(() => setShowExpenseDialog(true), 0)
    } else {
      router.push(path)
    }
  }

  const handleLogout = () => {
    logout()
  }

  const isManager = () => {
    return user?.role === "manager" || user?.role === "admin"
  }

  const isAdmin = () => {
    return user?.role === "admin"
  }

  const onClientDetailsDrawerOpenChange = (open: boolean) => {
    setClientDetailsDrawerOpen(open)
    if (!open) {
      window.setTimeout(() => setClientDetailsDrawerClient(null), 350)
    }
  }

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-gray-200/60 bg-gradient-to-r from-white via-slate-50 to-blue-50/30 backdrop-blur-sm w-full px-8 py-4 shadow-sm">
      <div className="flex items-center justify-between">
        {/* Left section - Business Name */}
        <div className="flex items-center">
          <div className="group relative flex items-center gap-3 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 hover:from-indigo-100 hover:via-purple-100 hover:to-pink-100 border border-indigo-100/50 hover:border-indigo-200/70 transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/20 cursor-pointer overflow-hidden">
            {/* Animated background overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            
            {/* Left dot */}
            <div className="relative z-10">
              <div className="w-2.5 h-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full shadow-sm"></div>
            </div>
            
            {/* Business name text */}
            <span className="relative z-10 text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 via-purple-700 to-pink-700 group-hover:from-indigo-800 group-hover:via-purple-800 group-hover:to-pink-800 transition-all duration-300">
              {isLoadingBusinessName ? (
                <span className="inline-block w-28 h-4 bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200 rounded"></span>
              ) : (
                businessName
              )}
            </span>
            
            {/* Right dot */}
            <div className="relative z-10">
              <div className="w-1.5 h-1.5 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
            </div>
            
            {/* Hover effect line */}
            <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 group-hover:w-full transition-all duration-300 ease-out"></div>
          </div>
        </div>

        {/* Right side - Quick Add, Notifications, and User */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Session Status */}
          <SessionStatus showAlways={false} />

          {/* Client search — opens client details drawer on select */}
          <div ref={clientSearchRef} className="relative w-36 shrink-0 sm:w-48 lg:w-56 z-40">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 sm:h-4 sm:w-4" />
            <Input
              type="search"
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value)
                setClientSearchOpen(true)
              }}
              onFocus={() => setClientSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setClientSearchOpen(false)
              }}
              placeholder="Search clients…"
              autoComplete="off"
              className="h-9 pl-8 pr-2 text-xs sm:text-sm border-slate-200/80 bg-white/90 shadow-sm"
            />
            {clientSearchOpen && clientResults.length > 0 && (
              <ul
                role="listbox"
                className="absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              >
                {clientResults.map((c) => {
                  const id = c._id || c.id
                  if (!id) return null
                  return (
                    <li key={String(id)} role="option">
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          setClientDetailsDrawerClient(searchHitToClient(c))
                          setClientDetailsDrawerOpen(true)
                          setClientSearch("")
                          setClientResults([])
                          setClientSearchOpen(false)
                        }}
                      >
                        <span className="font-medium text-slate-800">{c.name || "Client"}</span>
                        {c.phone && (
                          <span className="text-xs text-slate-500 tabular-nums">{c.phone}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Quick Add */}
          {showQuickAdd && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  aria-label="Quick add"
                  className="bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-blue-200 text-blue-700 hover:text-blue-800 hover:border-blue-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-0 shadow-xl bg-white/95 backdrop-blur-sm rounded-xl">
                <DropdownMenuItem 
                  onClick={() => setTimeout(() => setShowCashRegistryModal(true), 0)}
                  className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
                >
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Banknote className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700">Opening/Closing</span>
                </DropdownMenuItem>
                {(isManager() || isAdmin()) && (
                  <>
                <DropdownMenuItem 
                  onClick={() => router.push("/staff/working-hours")}
                  className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
                >
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Clock className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700">Attendance</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleQuickAdd("/expenses/new")}
                  className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-red-50 hover:to-rose-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
                >
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Receipt className="h-4 w-4 text-red-600" />
                  </div>
                  <span className="font-medium text-gray-700">Expense</span>
                </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {rightSlot}
          
          {/* Notifications */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="relative p-2.5 hover:bg-gradient-to-r hover:from-amber-50 hover:to-yellow-50 transition-all duration-300 transform hover:scale-105 hover:shadow-md rounded-lg group"
          >
            <Bell className="h-4 w-4 text-gray-600 group-hover:text-amber-600 transition-colors duration-300" />
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0 animate-pulse shadow-lg group-hover:animate-bounce transition-all duration-300"
            >
              1
            </Badge>
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="relative h-10 w-10 rounded-full p-0 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-300 transform hover:scale-105 hover:shadow-md border-2 border-transparent hover:border-indigo-200 ml-1"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md text-white text-sm font-bold">
                  {(() => {
                    const userName = user?.name || (user as any)?.firstName || user?.email || ''
                    return userName.charAt(0).toUpperCase() || 'U'
                  })()}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 border-0 shadow-xl bg-white/95 backdrop-blur-sm rounded-xl p-2" align="end" forceMount>
              <DropdownMenuLabel className="font-normal p-3">
                <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md text-white text-base font-bold">
                    {(() => {
                      const userName = user?.name || (user as any)?.firstName || user?.email || ''
                      return userName.charAt(0).toUpperCase() || 'U'
                    })()}
                  </div>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold leading-none text-gray-800">{user?.name || user?.email}</p>
                    <p className="text-xs leading-none text-gray-600 capitalize">{user?.role || 'User'}</p>
                    <p className="text-xs leading-none text-gray-500">{user?.email}</p>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem 
                onClick={() => router.push("/profile")}
                className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
              >
                <div className="p-2 bg-blue-100 rounded-lg">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <span className="font-medium text-gray-700">Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => router.push("/settings")}
                className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-green-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
              >
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Settings className="h-4 w-4 text-emerald-600" />
                </div>
                <span className="font-medium text-gray-700">Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem 
                onClick={handleLogout}
                className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-red-50 hover:to-rose-50 transition-all duration-200 cursor-pointer rounded-lg m-1 text-red-600 hover:text-red-700"
              >
                <div className="p-2 bg-red-100 rounded-lg">
                  <LogOut className="h-4 w-4 text-red-600" />
                </div>
                <span className="font-medium">Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Cash Registry Modal - full functionality: online sales, save event for report refresh */}
      <CashRegistryModal
        open={showCashRegistryModal}
        onOpenChange={setShowCashRegistryModal}
        onSaveSuccess={() => {
          window.dispatchEvent(new CustomEvent("cash-registry-saved"))
        }}
        onlineSalesAmount={todayOnlineSales}
        onPosCashChange={() => {}}
      />

      {/* Expense Form Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>
              Add a new expense to track your business costs.
            </DialogDescription>
          </DialogHeader>
          <ExpenseForm onClose={() => setShowExpenseDialog(false)} />
        </DialogContent>
      </Dialog>

      <ClientDetailsDrawer
        open={clientDetailsDrawerOpen}
        onOpenChange={onClientDetailsDrawerOpenChange}
        client={clientDetailsDrawerClient}
        initialExpandProfile={false}
        initialEditMode={false}
      />
    </header>
  )
}
