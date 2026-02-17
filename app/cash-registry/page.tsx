"use client"

import { useState } from "react"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { CashRegistryReport } from "@/components/cash-registry/cash-registry-report"
import { TrendingUp } from "lucide-react"

export default function CashRegistryPage() {
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false)

  return (
    <ProtectedRoute requiredModule="cash_registry">
      <ProtectedLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
          {/* Elegant Header Section */}
          <div className="mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Header Background */}
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-8 py-6">
                <div className="flex items-center">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <TrendingUp className="h-7 w-7 text-blue-600" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-bold text-slate-800 mb-1">
                        Cash Registry
                      </h1>
                      <p className="text-slate-600 text-base">
                        Manage and track daily cash balances and shifts
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Feature Highlights */}
              <div className="px-8 py-4 bg-white border-t border-slate-100">
                <div className="flex items-center gap-8 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span>Daily balance tracking</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span>Shift management</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span>Real-time monitoring</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content - Full Width */}
          <div className="relative w-full">
            <CashRegistryReport 
              isVerificationModalOpen={isVerificationModalOpen}
              onVerificationModalChange={setIsVerificationModalOpen}
            />
          </div>
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}