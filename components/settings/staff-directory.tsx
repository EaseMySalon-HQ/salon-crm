"use client"

import { StaffTable } from "@/components/staff/staff-table"
import { StaffWorkingHoursContent } from "@/components/staff/staff-working-hours-content"
import { CommissionProfileList } from "@/components/settings/commission-profile-list"
import { FeatureGate } from "@/components/ui/feature-gate"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, Clock, Award } from "lucide-react"

export function StaffDirectory() {
  return (
    <Tabs defaultValue="staff-list" className="w-full space-y-6">
      {/* Header card: title and description only */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Staff Directory</h2>
              <p className="text-slate-600">Manage staff accounts, roles, and access permissions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab list: outside the header card */}
      <TabsList className="h-11 rounded-xl bg-slate-100 p-1 gap-1 w-full sm:w-auto inline-flex">
        <TabsTrigger value="staff-list" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm flex-1 sm:flex-initial">
          <Users className="h-4 w-4" />
          Staff List
        </TabsTrigger>
        <TabsTrigger value="working-hours" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm flex-1 sm:flex-initial">
          <Clock className="h-4 w-4" />
          Working Hours
        </TabsTrigger>
        <TabsTrigger value="commission" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm flex-1 sm:flex-initial">
          <Award className="h-4 w-4" />
          Commission Management
        </TabsTrigger>
      </TabsList>

      {/* Content card: tab panels only */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6">
          <TabsContent value="staff-list" className="mt-0">
            <StaffTable />
          </TabsContent>
          <TabsContent value="working-hours" className="mt-0">
            <StaffWorkingHoursContent />
          </TabsContent>
          <TabsContent value="commission" className="mt-0">
            <FeatureGate
              featureId="staff_commissions"
              upgradeMessage="Staff commission tracking is available in Professional and Enterprise plans. Upgrade to configure commission profiles and track staff commissions."
            >
              <CommissionProfileList />
            </FeatureGate>
          </TabsContent>
        </div>
      </div>
    </Tabs>
  )
}
