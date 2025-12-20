"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { LeadsAPI } from "@/lib/api"
import { Phone, Mail, Calendar, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    "follow-up": "bg-orange-100 text-orange-800",
    converted: "bg-green-100 text-green-800",
    lost: "bg-gray-100 text-gray-800",
  }
  return colors[status] || "bg-gray-100 text-gray-800"
}

const getSourceLabel = (source: string) => {
  const labels: Record<string, string> = {
    "walk-in": "Walk-in",
    phone: "Phone",
    website: "Website",
    social: "Social Media",
    referral: "Referral",
    other: "Other",
  }
  return labels[source] || source
}

export function RecentLeads() {
  const [leads, setLeads] = useState<any[]>([])
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    followUp: 0,
    converted: 0,
    lost: 0,
  })
  const router = useRouter()

  useEffect(() => {
    const loadLeads = async () => {
      try {
        const response = await LeadsAPI.getAll({ limit: 10 })
        if (response.success && response.data) {
          const leadsList = Array.isArray(response.data) ? response.data : (response.data?.data || [])
          setLeads(leadsList.slice(0, 5)) // Show only 5 most recent

          // Calculate stats
          const allLeadsResponse = await LeadsAPI.getAll({ limit: 1000 })
          if (allLeadsResponse.success && allLeadsResponse.data) {
            const allLeads = Array.isArray(allLeadsResponse.data) 
              ? allLeadsResponse.data 
              : (allLeadsResponse.data?.data || [])
            
            setStats({
              total: allLeads.length,
              new: allLeads.filter((l: any) => l.status === 'new').length,
              followUp: allLeads.filter((l: any) => l.status === 'follow-up').length,
              converted: allLeads.filter((l: any) => l.status === 'converted').length,
              lost: allLeads.filter((l: any) => l.status === 'lost').length,
            })
          }
        }
      } catch (error) {
        console.error('Error loading leads:', error)
      }
    }
    loadLeads()
  }, [])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Leads</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/leads')}
            className="text-xs"
          >
            View All
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-2 bg-blue-50 rounded">
            <div className="text-lg font-bold text-blue-600">{stats.new}</div>
            <div className="text-xs text-gray-600">New</div>
          </div>
          <div className="text-center p-2 bg-orange-50 rounded">
            <div className="text-lg font-bold text-orange-600">{stats.followUp}</div>
            <div className="text-xs text-gray-600">Follow-up</div>
          </div>
          <div className="text-center p-2 bg-green-50 rounded">
            <div className="text-lg font-bold text-green-600">{stats.converted}</div>
            <div className="text-xs text-gray-600">Converted</div>
          </div>
        </div>

        {/* Recent Leads List */}
        <div className="space-y-2">
          {leads.length === 0 ? (
            <div className="text-center py-4 text-sm text-gray-500">
              No leads yet. Create your first lead to get started.
            </div>
          ) : (
            leads.map((lead, index) => (
              <button
                key={lead._id || lead.id}
                type="button"
                onClick={() => router.push(`/leads`)}
                className="w-full text-left"
              >
                <div
                  className="group flex items-center p-3 rounded-lg bg-gradient-to-r from-slate-50 to-gray-50 hover:from-blue-50 hover:to-indigo-50 transition-all duration-300 border border-transparent hover:border-blue-200"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-800">
                        {lead.name}
                      </p>
                      <Badge className={getStatusColor(lead.status)}>
                        {lead.status.charAt(0).toUpperCase() + lead.status.slice(1).replace("-", " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {lead.phone}
                      </div>
                      {lead.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {lead.email}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Badge variant="outline" className="text-xs">
                        {getSourceLabel(lead.source)}
                      </Badge>
                      {lead.followUpDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(lead.followUpDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {leads.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => router.push('/leads')}
            >
              View All Leads ({stats.total})
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

