"use client"

import { useState, useEffect } from "react"
import { Plus, Edit, ToggleLeft, ToggleRight, CreditCard, Calendar, Percent, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { MembershipPlanForm } from "./membership-plan-form"
import { MembershipAPI } from "@/lib/api"
import { useCurrency } from "@/hooks/use-currency"
import { useToast } from "@/hooks/use-toast"

export function MembershipPlansTable() {
  const { formatAmount } = useCurrency()
  const { toast } = useToast()
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<any>(null)

  const fetchPlans = async () => {
    try {
      const res = await MembershipAPI.getPlans()
      if (res.success) setPlans(res.data || [])
    } catch (e) {
      console.error("Failed to fetch plans:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
  }, [])

  useEffect(() => {
    const handler = () => fetchPlans()
    window.addEventListener("membership-plan-added", handler)
    return () => window.removeEventListener("membership-plan-added", handler)
  }, [])

  const handleToggle = async (plan: any) => {
    try {
      const res = await MembershipAPI.togglePlan(plan._id || plan.id)
      if (res.success) {
        toast({ title: res.data?.isActive ? "Plan activated" : "Plan deactivated" })
        fetchPlans()
      } else {
        toast({ title: "Error", description: res.error, variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    }
  }

  const filtered = plans.filter(
    (p) =>
      p.planName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Input
            placeholder="Search plans..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Sheet open={isAddOpen} onOpenChange={setIsAddOpen}>
          <SheetTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Plan
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Create Membership Plan</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <MembershipPlanForm
                onSuccess={() => setIsAddOpen(false)}
                onClose={() => setIsAddOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-2">
                  <div className="h-5 w-32 bg-slate-200 rounded" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="h-4 w-20 bg-slate-200 rounded" />
                  <div className="h-4 w-24 bg-slate-200 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="font-medium text-muted-foreground">No membership plans yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create one to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {filtered.map((plan) => (
              <Card
                key={plan._id || plan.id}
                className={`overflow-hidden transition-all hover:shadow-md ${
                  !plan.isActive ? "opacity-75" : ""
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                        <CreditCard className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{plan.planName}</h3>
                        <Badge
                          variant={plan.isActive ? "default" : "secondary"}
                          className="mt-1.5 text-xs"
                        >
                          {plan.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleToggle(plan)}
                        title={plan.isActive ? "Deactivate" : "Activate"}
                      >
                        {plan.isActive ? (
                          <ToggleRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingPlan(plan)}
                        title="Edit plan"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="text-2xl font-bold text-primary">{formatAmount(plan.price)}</div>
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {plan.durationInDays} days
                    </span>
                    {(plan.discountPercentage || 0) > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Percent className="h-3.5 w-3.5" />
                        {plan.discountPercentage}% off
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5" />
                      {(plan.includedServices || []).length} service(s)
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Membership Plan</SheetTitle>
          </SheetHeader>
          {editingPlan && (
            <div className="mt-6">
              <MembershipPlanForm
                plan={editingPlan}
                onSuccess={() => setEditingPlan(null)}
                onClose={() => setEditingPlan(null)}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
