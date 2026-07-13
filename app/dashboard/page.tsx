"use client"

import { useState } from "react"
import { TrendingUp, Calendar, BarChart3, MoreVertical, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Overview } from "@/components/dashboard/overview"
import { RecentAppointments } from "@/components/dashboard/recent-appointments"
import { DashboardStatsCards, DashboardTopPerformersCards } from "@/components/dashboard/stats-cards"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { DashboardGate } from "@/components/dashboard/dashboard-gate"

export default function DashboardPage() {
  const [salesOverviewRange, setSalesOverviewRange] = useState<"last7days" | "last30days">("last7days")
  const [keyMetricsRange, setKeyMetricsRange] = useState<"today" | "last7days">("today")
  const [upcomingAppointmentsRange, setUpcomingAppointmentsRange] = useState<"today" | "next7days">("today")

  return (
    <ProtectedLayout requiredModule="dashboard">
      <DashboardGate>
      <div className="min-h-screen bg-background p-6">
        <div className="mb-8 animate-in slide-in-from-bottom-2" style={{ animationDelay: "400ms" }}>
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-indigo-600" />
              <h2 className="text-2xl font-semibold text-foreground">Key Metrics</h2>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-md">
                  {keyMetricsRange === "today" ? "Today" : "Last 7 days"}
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setKeyMetricsRange("today")}>
                  {keyMetricsRange === "today" ? "✓ " : ""}Today
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setKeyMetricsRange("last7days")}>
                  {keyMetricsRange === "last7days" ? "✓ " : ""}Last 7 days
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <DashboardStatsCards metricsRange={keyMetricsRange} />
        </div>

        <div className="grid gap-8 mb-8 animate-in slide-in-from-bottom-2" style={{ animationDelay: "600ms" }}>
          <div className="grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4 h-full shadow-lg border-0 dark:border dark:border-border bg-white/80 backdrop-blur-sm">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg border-b border-blue-100 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-blue-800">
                      <BarChart3 className="h-5 w-5" />
                      Sales Overview
                    </CardTitle>
                    <CardDescription className="text-blue-600">
                      Sales and revenue trends for the selected range
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-md border border-blue-200 bg-white/85 text-blue-800 hover:bg-blue-50"
                        aria-label="Sales range options"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setSalesOverviewRange("last7days")}>
                        {salesOverviewRange === "last7days" ? "✓ " : ""}Last 7 days
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSalesOverviewRange("last30days")}>
                        {salesOverviewRange === "last30days" ? "✓ " : ""}Last 30 days
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <Overview chartRange={salesOverviewRange} />
              </CardContent>
            </Card>

            <Card className="col-span-3 h-full shadow-lg border-0 dark:border dark:border-border bg-white/80 backdrop-blur-sm">
              <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-lg border-b border-green-100 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-green-800">
                      <Calendar className="h-5 w-5" />
                      Upcoming Appointments
                    </CardTitle>
                    <CardDescription className="text-green-600">
                      {upcomingAppointmentsRange === "today"
                        ? "Scheduled visits for today"
                        : "Scheduled visits for the next 7 days"}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-md border border-green-200 bg-white/85 text-green-800 hover:bg-green-50"
                        aria-label="Upcoming appointments range options"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setUpcomingAppointmentsRange("today")}>
                        {upcomingAppointmentsRange === "today" ? "✓ " : ""}Today
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setUpcomingAppointmentsRange("next7days")}>
                        {upcomingAppointmentsRange === "next7days" ? "✓ " : ""}Upcoming 7 Days
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="p-6 h-[350px]">
                <RecentAppointments range={upcomingAppointmentsRange} />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mb-8 animate-in slide-in-from-bottom-2" style={{ animationDelay: "700ms" }}>
          <DashboardTopPerformersCards />
        </div>

      </div>
      </DashboardGate>
    </ProtectedLayout>
  )
}

