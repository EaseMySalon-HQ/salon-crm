"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Bell, Plus, User, Users, Briefcase, Package, Receipt, CreditCard, Settings, LogOut } from "lucide-react"
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
import { SettingsAPI } from "@/lib/api"
import { useTodayOnlineSales } from "@/hooks/use-today-online-sales"
import { ExpenseForm } from "@/components/expenses/expense-form"
import { CashRegistryModal } from "@/components/cash-registry/cash-registry-modal"
import { SessionStatus } from "@/components/auth/session-status"

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
  const [businessName, setBusinessName] = useState<string>("Ease My Salon")
  const [isLoadingBusinessName, setIsLoadingBusinessName] = useState(true)

  // Fetch business settings to get the business name
  useEffect(() => {
    let isMounted = true

    const fetchBusinessSettings = async () => {
      try {
        setIsLoadingBusinessName(true)
        const response = await SettingsAPI.getBusinessSettings()
        if (isMounted) {
          if (response.success && response.data?.name) {
            setBusinessName(response.data.name)
          } else {
            console.warn("Business settings response missing name:", response)
          }
          setIsLoadingBusinessName(false)
        }
      } catch (error) {
        console.error("Failed to fetch business settings:", error)
        // Keep default name if API call fails
        if (isMounted) {
          setIsLoadingBusinessName(false)
        }
      }
    }

    fetchBusinessSettings()

    // Listen for business settings updates from other components
    const handleBusinessSettingsUpdate = () => {
      if (isMounted) {
        fetchBusinessSettings()
      }
    }

    window.addEventListener('business-settings-updated', handleBusinessSettingsUpdate)
    
    return () => {
      isMounted = false
      window.removeEventListener('business-settings-updated', handleBusinessSettingsUpdate)
    }
  }, [])

  const handleQuickAdd = (path: string) => {
    if (path === "/expenses/new") {
      setShowExpenseDialog(true)
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

  return (
    <header className="border-b border-gray-200/60 bg-gradient-to-r from-white via-slate-50 to-blue-50/30 backdrop-blur-sm w-full px-8 py-4 shadow-sm">
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
        <div className="flex items-center gap-3">
          {/* Add Entry Button */}
          <Button
            onClick={() => setShowCashRegistryModal(true)}
            className="flex items-center gap-2 justify-center whitespace-nowrap text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 rounded-xl px-6 py-2"
          >
            Add Opening/Closing
          </Button>
          {/* Session Status */}
          <SessionStatus showAlways={false} />

          {/* Quick Add */}
          {showQuickAdd && (isManager() || isAdmin()) && (
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
                  onClick={() => handleQuickAdd("/clients/new")}
                  className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
                >
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700">Customer</span>
                </DropdownMenuItem>
                {isAdmin() && (
                  <DropdownMenuItem 
                    onClick={() => handleQuickAdd("/staff/new")}
                    className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
                  >
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Users className="h-4 w-4 text-purple-600" />
                    </div>
                    <span className="font-medium text-gray-700">Staff</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={() => handleQuickAdd("/services/new")}
                  className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-green-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
                >
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <Briefcase className="h-4 w-4 text-emerald-600" />
                  </div>
                  <span className="font-medium text-gray-700">Service</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleQuickAdd("/products/new")}
                  className="flex items-center gap-3 p-3 hover:bg-gradient-to-r hover:from-orange-50 hover:to-amber-50 transition-all duration-200 cursor-pointer rounded-lg m-1"
                >
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Package className="h-4 w-4 text-orange-600" />
                  </div>
                  <span className="font-medium text-gray-700">Product</span>
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

    </header>
  )
}
