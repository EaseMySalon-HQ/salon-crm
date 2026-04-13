"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, CalendarDays, PieChart, Settings, Package, Clock, DollarSign, CreditCard, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"
import { useDashboardInit } from "@/lib/queries/dashboard"

interface ServiceStats {
  totalServices: number
  averagePrice: number
  averageDuration: number
}

interface ProductStats {
  totalProducts: number
  lowStockCount: number
  totalValue: number
  categories: number
}

export function DashboardStatsCards() {
  const { data, isPending, isError, refetch } = useDashboardInit()

  const safeFormatAmount = (amount: number) => {
    return `₹${amount.toFixed(2)}`
  }

  const stats = data?.todayStats
    ? {
        totalClients: data.todayStats.totalClients ?? 0,
        totalAppointments: data.todayStats.todaysAppointmentCount ?? 0,
        totalRevenue: data.todayStats.todaysCompletedRevenue ?? 0,
        totalServices: data.todayStats.totalServices ?? 0,
      }
    : { totalClients: 0, totalAppointments: 0, totalRevenue: 0, totalServices: 0 }

  if (isPending) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 text-amber-900 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>Could not load dashboard figures. Check your connection, then try again.</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-gray-900">Total Clients</CardTitle>
          <div className="p-2 bg-gray-100 rounded-lg">
            <Users className="h-4 w-4 text-gray-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold text-gray-900">{stats.totalClients}</div>
          <p className="text-sm text-gray-500">Active clients</p>
        </CardContent>
      </Card>
      
      <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-gray-900">Total Appointments</CardTitle>
          <div className="p-2 bg-gray-100 rounded-lg">
            <CalendarDays className="h-4 w-4 text-gray-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold text-gray-900">{stats.totalAppointments}</div>
          <p className="text-sm text-gray-500">Today</p>
        </CardContent>
      </Card>
      
      <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-gray-900">Total Revenue</CardTitle>
          <div className="p-2 bg-gray-100 rounded-lg">
            <PieChart className="h-4 w-4 text-gray-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold text-gray-900">{safeFormatAmount(stats.totalRevenue)}</div>
          <p className="text-sm text-gray-500">Today</p>
        </CardContent>
      </Card>
      
      <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-gray-900">Total Services</CardTitle>
          <div className="p-2 bg-gray-100 rounded-lg">
            <Settings className="h-4 w-4 text-gray-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold text-gray-900">{stats.totalServices}</div>
          <p className="text-sm text-gray-500">Active services</p>
        </CardContent>
      </Card>
    </div>
  )
}

export function MembershipStatsCards() {
  const { data, isPending, isError, refetch } = useDashboardInit()

  const safeFormatAmount = (amount: number) => `₹${amount.toFixed(2)}`

  const stats = data?.membership
    ? {
        totalActiveMembers: data.membership.totalActiveMembers ?? 0,
        membershipRevenue: data.membership.membershipRevenue ?? 0,
        membersExpiringIn30Days: data.membership.membersExpiringIn30Days ?? 0,
      }
    : { totalActiveMembers: 0, membershipRevenue: 0, membersExpiringIn30Days: 0 }

  if (isPending) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 text-amber-900 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>Could not load membership stats. Try again.</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-gray-900">Active Members</CardTitle>
          <div className="p-2 bg-gray-100 rounded-lg">
            <CreditCard className="h-4 w-4 text-gray-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold text-gray-900">{stats.totalActiveMembers}</div>
          <p className="text-sm text-gray-500">With active membership</p>
        </CardContent>
      </Card>
      <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-gray-900">Membership Revenue</CardTitle>
          <div className="p-2 bg-gray-100 rounded-lg">
            <DollarSign className="h-4 w-4 text-gray-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold text-gray-900">{safeFormatAmount(stats.membershipRevenue)}</div>
          <p className="text-sm text-gray-500">From active subscriptions</p>
        </CardContent>
      </Card>
      <Card className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-medium text-gray-900">Expiring in 30 Days</CardTitle>
          <div className="p-2 bg-gray-100 rounded-lg">
            <CalendarDays className="h-4 w-4 text-gray-600" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-2xl font-bold text-gray-900">{stats.membersExpiringIn30Days}</div>
          <p className="text-sm text-gray-500">Memberships expiring soon</p>
        </CardContent>
      </Card>
    </div>
  )
}

export function ServiceStatsCards() {
  const queryClient = useQueryClient()
  const { data, isPending, isError, refetch } = useDashboardInit()

  const safeFormatAmount = (amount: number) => {
    return `₹${amount.toFixed(2)}`
  }

  const stats: ServiceStats = data?.serviceAggregates
    ? {
        totalServices: data.serviceAggregates.totalServices ?? 0,
        averagePrice: data.serviceAggregates.averagePrice ?? 0,
        averageDuration: data.serviceAggregates.averageDuration ?? 0,
      }
    : { totalServices: 0, averagePrice: 0, averageDuration: 0 }

  useEffect(() => {
    const handleServiceAdded = () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "init"] })
    }
    window.addEventListener("service-added", handleServiceAdded)
    return () => window.removeEventListener("service-added", handleServiceAdded)
  }, [queryClient])

  if (isPending) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 text-amber-900 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>Could not load service stats. Try again.</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="group transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-gradient-to-br from-cyan-50 to-blue-100 overflow-hidden animate-in slide-in-from-bottom-2" style={{ animationDelay: '0ms' }}>
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/10 to-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
          <CardTitle className="text-sm font-medium text-cyan-800">Total Services</CardTitle>
          <div className="p-2 bg-cyan-100 rounded-lg group-hover:bg-cyan-200 transition-colors duration-300">
            <Package className="h-4 w-4 text-cyan-600" />
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="text-3xl font-bold text-cyan-900 mb-1">{stats.totalServices}</div>
          <p className="text-xs text-cyan-600 font-medium">Active services</p>
          <div className="w-full bg-cyan-200 rounded-full h-1 mt-3 overflow-hidden">
            <div className="bg-gradient-to-r from-cyan-500 to-blue-500 h-1 rounded-full transition-all duration-1000 ease-out animate-pulse" style={{ width: `${Math.min((stats.totalServices / 30) * 100, 100)}%` }} />
          </div>
        </CardContent>
      </Card>
      
      <Card className="group transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-gradient-to-br from-violet-50 to-purple-100 overflow-hidden animate-in slide-in-from-bottom-2" style={{ animationDelay: '100ms' }}>
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 to-purple-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
          <CardTitle className="text-sm font-medium text-violet-800">Average Price</CardTitle>
          <div className="p-2 bg-violet-100 rounded-lg group-hover:bg-violet-200 transition-colors duration-300">
            <DollarSign className="h-4 w-4 text-violet-600" />
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="text-3xl font-bold text-violet-900 mb-1">{safeFormatAmount(stats.averagePrice)}</div>
          <p className="text-xs text-violet-600 font-medium">Per service</p>
          <div className="w-full bg-violet-200 rounded-full h-1 mt-3 overflow-hidden">
            <div className="bg-gradient-to-r from-violet-500 to-purple-500 h-1 rounded-full transition-all duration-1000 ease-out animate-pulse" style={{ width: `${Math.min((stats.averagePrice / 1000) * 100, 100)}%` }} />
          </div>
        </CardContent>
      </Card>
      
      <Card className="group transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-gradient-to-br from-rose-50 to-pink-100 overflow-hidden animate-in slide-in-from-bottom-2" style={{ animationDelay: '200ms' }}>
        <div className="absolute inset-0 bg-gradient-to-r from-rose-600/10 to-pink-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
          <CardTitle className="text-sm font-medium text-rose-800">Average Duration</CardTitle>
          <div className="p-2 bg-rose-100 rounded-lg group-hover:bg-rose-200 transition-colors duration-300">
            <Clock className="h-4 w-4 text-rose-600" />
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="text-3xl font-bold text-rose-900 mb-1">{stats.averageDuration} min</div>
          <p className="text-xs text-rose-600 font-medium">Per service</p>
          <div className="w-full bg-rose-200 rounded-full h-1 mt-3 overflow-hidden">
            <div className="bg-gradient-to-r from-rose-500 to-pink-500 h-1 rounded-full transition-all duration-1000 ease-out animate-pulse" style={{ width: `${Math.min((stats.averageDuration / 120) * 100, 100)}%` }} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface ProductStatsCardsProps {
  productTypeFilter?: string
  onLowStockClick?: () => void
  lowStockFilterActive?: boolean
}

export function ProductStatsCards({
  productTypeFilter: _productTypeFilter = "all",
  onLowStockClick,
  lowStockFilterActive = false,
}: ProductStatsCardsProps = {}) {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const queryClient = useQueryClient()
  const { data, isPending, isError, refetch } = useDashboardInit()

  const safeFormatAmount = (amount: number) => {
    return `₹${amount.toFixed(2)}`
  }

  const stats: ProductStats = data?.productAggregates
    ? {
        totalProducts: data.productAggregates.totalProducts ?? 0,
        lowStockCount: data.productAggregates.lowStockCount ?? 0,
        totalValue: data.productAggregates.totalValue ?? 0,
        categories: data.productAggregates.categories ?? 0,
      }
    : { totalProducts: 0, lowStockCount: 0, totalValue: 0, categories: 0 }

  useEffect(() => {
    const handleProductAdded = () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "init"] })
    }
    window.addEventListener("product-added", handleProductAdded)
    return () => window.removeEventListener("product-added", handleProductAdded)
  }, [queryClient])

  if (isPending) {
    const cardCount = isAdmin ? 4 : 3
    return (
      <div className={`grid gap-4 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
        {Array.from({ length: cardCount }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 text-amber-900 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>Could not load product stats. Try again.</span>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className={`grid gap-4 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
      <Card className="group transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-gradient-to-br from-teal-50 to-emerald-100 overflow-hidden animate-in slide-in-from-bottom-2" style={{ animationDelay: '0ms' }}>
        <div className="absolute inset-0 bg-gradient-to-r from-teal-600/10 to-emerald-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
          <CardTitle className="text-sm font-medium text-teal-800">Total Products</CardTitle>
          <div className="p-2 bg-teal-100 rounded-lg group-hover:bg-teal-200 transition-colors duration-300">
            <Package className="h-4 w-4 text-teal-600" />
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="text-3xl font-bold text-teal-900 mb-1">{stats.totalProducts}</div>
          <p className="text-xs text-teal-600 font-medium">In inventory</p>
          <div className="w-full bg-teal-200 rounded-full h-1 mt-3 overflow-hidden">
            <div className="bg-gradient-to-r from-teal-500 to-emerald-500 h-1 rounded-full transition-all duration-1000 ease-out animate-pulse" style={{ width: `${Math.min((stats.totalProducts / 100) * 100, 100)}%` }} />
          </div>
        </CardContent>
      </Card>
      
      <Card 
        className={cn(
          "group transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-gradient-to-br from-red-50 to-rose-100 overflow-hidden animate-in slide-in-from-bottom-2 cursor-pointer",
          lowStockFilterActive && "ring-2 ring-red-500 ring-offset-2"
        )}
        style={{ animationDelay: '100ms' }}
        onClick={onLowStockClick}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 to-rose-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
          <CardTitle className="text-sm font-medium text-red-800">Low Stock</CardTitle>
          <div className="p-2 bg-red-100 rounded-lg group-hover:bg-red-200 transition-colors duration-300">
            <Package className="h-4 w-4 text-red-500" />
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="text-3xl font-bold text-red-600 mb-1">{stats.lowStockCount}</div>
          <p className="text-xs text-red-600 font-medium">Items need restocking</p>
          <div className="w-full bg-red-200 rounded-full h-1 mt-3 overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-rose-500 h-1 rounded-full transition-all duration-1000 ease-out animate-pulse" style={{ width: `${Math.min((stats.lowStockCount / 20) * 100, 100)}%` }} />
          </div>
        </CardContent>
      </Card>
      
      {isAdmin && (
        <Card className="group transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-gradient-to-br from-amber-50 to-yellow-100 overflow-hidden animate-in slide-in-from-bottom-2" style={{ animationDelay: '200ms' }}>
          <div className="absolute inset-0 bg-gradient-to-r from-amber-600/10 to-yellow-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-amber-800">Total Value</CardTitle>
            <div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors duration-300">
              <Package className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold text-amber-900 mb-1">{safeFormatAmount(stats.totalValue)}</div>
            <p className="text-xs text-amber-600 font-medium">Current inventory value</p>
            <div className="w-full bg-amber-200 rounded-full h-1 mt-3 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-yellow-500 h-1 rounded-full transition-all duration-1000 ease-out animate-pulse" style={{ width: `${Math.min((stats.totalValue / 50000) * 100, 100)}%` }} />
            </div>
          </CardContent>
        </Card>
      )}
      
      <Card className="group transform hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-gradient-to-br from-indigo-50 to-blue-100 overflow-hidden animate-in slide-in-from-bottom-2" style={{ animationDelay: isAdmin ? '300ms' : '200ms' }}>
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/10 to-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
          <CardTitle className="text-sm font-medium text-indigo-800">Categories</CardTitle>
          <div className="p-2 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors duration-300">
            <Package className="h-4 w-4 text-indigo-600" />
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="text-3xl font-bold text-indigo-900 mb-1">{stats.categories}</div>
          <p className="text-xs text-indigo-600 font-medium">Product categories</p>
          <div className="w-full bg-indigo-200 rounded-full h-1 mt-3 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-blue-500 h-1 rounded-full transition-all duration-1000 ease-out animate-pulse" style={{ width: `${Math.min((stats.categories / 10) * 100, 100)}%` }} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 