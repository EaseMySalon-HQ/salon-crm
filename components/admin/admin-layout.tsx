"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { Building2, LogOut, Menu, X, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAdminAuth } from "@/lib/admin-auth-context"
import { cn } from "@/lib/utils"
import { AdminSidebarNav, AdminSidebarNavSkeleton } from "@/components/admin/admin-sidebar-nav"

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { admin, logout, isLoading } = useAdminAuth()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!isLoading && !admin) {
      if (typeof window !== "undefined") {
        router.push("/admin/login")
      }
    }
  }, [admin, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#0f172a] border-t-transparent mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!admin) {
    return null
  }

  return (
    <div className="flex h-screen bg-[#fafafa]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - modern SaaS style */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col bg-white border-r border-slate-200/80 transition-transform duration-200 ease-out lg:static lg:translate-x-0",
          "shadow-sm lg:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo / Brand */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-slate-200/80 shrink-0">
          <button
            onClick={() => { router.push("/admin"); setSidebarOpen(false) }}
            className="flex items-center gap-2 outline-none focus:ring-2 focus:ring-slate-400/50 rounded-lg"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="font-semibold text-slate-900 tracking-tight">EaseMySalon</span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          <Suspense fallback={<AdminSidebarNavSkeleton />}>
            <AdminSidebarNav onNavigate={() => setSidebarOpen(false)} />
          </Suspense>
        </div>

        {/* Bottom: CTA + User */}
        <div className="shrink-0 border-t border-slate-200/80 p-3 space-y-2">
          <Button
            onClick={() => { router.push("/admin/businesses/new"); setSidebarOpen(false) }}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white h-9 text-sm font-medium"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Business
          </Button>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50/80">
            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-medium shrink-0">
              {(admin.name || "A").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{admin.name || "Admin"}</p>
              <p className="text-xs text-slate-500 truncate">Platform admin</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Log out
          </Button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 flex items-center gap-4 px-4 lg:px-8 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0" />
          <span className="text-sm text-slate-500 hidden sm:inline">Platform control center</span>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
