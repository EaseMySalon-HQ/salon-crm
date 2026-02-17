import Link from "next/link"
import { Receipt, TrendingUp, Calendar, Users, BarChart3, Package } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Overview } from "@/components/dashboard/overview"
import { RecentAppointments } from "@/components/dashboard/recent-appointments"
import { DashboardStatsCards } from "@/components/dashboard/stats-cards"
import { ServiceStatsCards } from "@/components/dashboard/stats-cards"
import { ProductStatsCards } from "@/components/dashboard/stats-cards"
import { ProtectedLayout } from "@/components/layout/protected-layout"

export default function DashboardPage() {
  return (
    <ProtectedLayout requiredModule="dashboard">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
        <div className="mb-8 animate-in fade-in" style={{ animationDelay: "200ms" }}>
          <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl p-8 text-white shadow-2xl hover:shadow-3xl transition-all duration-500 transform hover:scale-[1.01]">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-100">
                  Welcome to Ease My Salon
                </h1>
                <p className="text-indigo-100 text-lg">Manage your salon operations with ease and efficiency</p>
              </div>
              <div className="flex items-center gap-3">
                <Button asChild className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border-white/30 transform hover:scale-105 transition-all duration-300">
                  <Link href="/appointments/new">
                    <Calendar className="mr-2 h-4 w-4" />
                    New Appointment
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  className="bg-white text-indigo-600 hover:bg-gray-100 transform hover:scale-105 transition-all duration-300"
                >
                  <Link href="/quick-sale">
                    <Receipt className="mr-2 h-4 w-4" />
                    Quick Sale
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 animate-in slide-in-from-bottom-2" style={{ animationDelay: "400ms" }}>
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="h-6 w-6 text-indigo-600" />
            <h2 className="text-2xl font-semibold text-gray-800">Key Metrics</h2>
          </div>
          <DashboardStatsCards />
        </div>

        <div className="grid gap-8 mb-8 animate-in slide-in-from-bottom-2" style={{ animationDelay: "600ms" }}>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4 transform hover:scale-[1.02] transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg border-b border-blue-100">
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <BarChart3 className="h-5 w-5" />
                  Monthly Overview
                </CardTitle>
                <CardDescription className="text-blue-600">Appointments and revenue trends for the current month</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <Overview />
              </CardContent>
            </Card>

            <Card className="col-span-3 transform hover:scale-[1.02] transition-all duration-300 shadow-lg hover:shadow-xl border-0 bg-white/80 backdrop-blur-sm">
              <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-lg border-b border-green-100">
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <Calendar className="h-5 w-5" />
                  Recent Appointments
                </CardTitle>
                <CardDescription className="text-green-600">Latest scheduled appointments and activities</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <RecentAppointments />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mb-8 animate-in slide-in-from-bottom-2" style={{ animationDelay: "800ms" }}>
          <div className="flex items-center gap-3 mb-6">
            <Users className="h-6 w-6 text-emerald-600" />
            <h2 className="text-2xl font-semibold text-gray-800">Service Analytics</h2>
          </div>
          <ServiceStatsCards />
        </div>

        <div className="mb-8 animate-in slide-in-from-bottom-2" style={{ animationDelay: "1000ms" }}>
          <div className="flex items-center gap-3 mb-6">
            <Package className="h-6 w-6 text-orange-600" />
            <h2 className="text-2xl font-semibold text-gray-800">Inventory Overview</h2>
          </div>
          <ProductStatsCards />
        </div>
      </div>
    </ProtectedLayout>
  )
}

