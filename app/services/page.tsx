"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ServicesTable } from "@/components/services/services-table"
import { ServiceStatsCards } from "@/components/dashboard/stats-cards"
import { CategoryManagement } from "@/components/categories/category-management"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Scissors, Sparkles, TrendingUp, FolderTree } from "lucide-react"

export default function Services() {
  return (
    <ProtectedRoute requiredModule="services">
      <ProtectedLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
          {/* Elegant Header Section */}
          <div className="mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Header Background */}
              <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 px-8 py-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <Scissors className="h-7 w-7 text-indigo-600" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold text-slate-800 mb-1">
                        Services Management
                      </h1>
                      <p className="text-slate-600 text-base">
                        Manage your salon services, pricing, and categories
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Feature Highlights */}
              <div className="px-8 py-4 bg-white border-t border-slate-100">
                <div className="flex items-center gap-8 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                    <span>Professional management</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span>Streamlined operations</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                    <span>Quality assurance</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs for Services and Categories */}
          <Tabs defaultValue="services" className="w-full">
            <TabsList className="mb-6 bg-white shadow-sm">
              <TabsTrigger value="services" className="gap-2">
                <Scissors className="h-4 w-4" />
                Services
              </TabsTrigger>
              <TabsTrigger value="categories" className="gap-2">
                <FolderTree className="h-4 w-4" />
                Categories
              </TabsTrigger>
            </TabsList>

            <TabsContent value="services" className="space-y-6">
              {/* Stats Cards Section */}
              <div className="animate-in slide-in-from-bottom-2" style={{ animationDelay: '400ms' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full"></div>
                  <h2 className="text-lg font-semibold text-gray-800">Service Analytics</h2>
                </div>
                <ServiceStatsCards />
              </div>

              {/* Services Table Section */}
              <div className="animate-in slide-in-from-bottom-2" style={{ animationDelay: '600ms' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-teal-600 rounded-full"></div>
                  <h2 className="text-lg font-semibold text-gray-800">Service Directory</h2>
                </div>
                <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/50 shadow-lg overflow-hidden">
                  <ServicesTable />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="categories">
              <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-6">
                <CategoryManagement 
                  type="service"
                  title="Service Categories"
                  description="Manage categories for your salon services"
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
