import { ProtectedLayout } from "@/components/layout/protected-layout"
import { RevenueReport } from "@/components/reports/revenue-report"
import { ServicePopularity } from "@/components/reports/service-popularity"
import { ClientRetention } from "@/components/reports/client-retention"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { FeatureGate } from "@/components/ui/feature-gate"

export default function AnalyticsPage() {
  return (
    <ProtectedRoute requiredModule="analytics">
      <ProtectedLayout>
        <FeatureGate 
          featureId="analytics"
          upgradeMessage="Analytics is available in Professional and Enterprise plans. Upgrade to access advanced business insights and analytics."
        >
        <div className="flex flex-col space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
                <p className="text-muted-foreground">View analytics and insights for your salon business</p>
              </div>

              <Tabs defaultValue="revenue">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  <TabsTrigger value="revenue">Revenue</TabsTrigger>
                  <TabsTrigger value="services">Services</TabsTrigger>
                  <TabsTrigger value="clients">Clients</TabsTrigger>
                </TabsList>

                <TabsContent value="revenue" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Revenue Overview</CardTitle>
                      <CardDescription>View your salon&apos;s revenue performance over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RevenueReport />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="services" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Service Popularity</CardTitle>
                      <CardDescription>See which services are most popular with your clients</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ServicePopularity />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="clients" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Client Retention</CardTitle>
                      <CardDescription>Track client retention and new client acquisition</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ClientRetention />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
        </div>
        </FeatureGate>
      </ProtectedLayout>
    </ProtectedRoute>
  )
} 