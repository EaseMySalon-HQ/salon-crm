"use client"

import { useState, useEffect } from "react"
import { Plus, Edit, ToggleLeft, ToggleRight, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Membership Plan</DialogTitle>
            </DialogHeader>
            <MembershipPlanForm
              onSuccess={() => setIsAddOpen(false)}
              onClose={() => setIsAddOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Included Services</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No membership plans yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((plan) => (
                <TableRow key={plan._id || plan.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plan.planName}</span>
                    </div>
                  </TableCell>
                  <TableCell>{formatAmount(plan.price)}</TableCell>
                  <TableCell>{plan.durationInDays} days</TableCell>
                  <TableCell>{plan.discountPercentage || 0}%</TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {(plan.includedServices || []).length} service(s)
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={plan.isActive ? "default" : "secondary"}>
                      {plan.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggle(plan)}
                        title={plan.isActive ? "Deactivate" : "Activate"}
                      >
                        {plan.isActive ? (
                          <ToggleRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditingPlan(plan)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Plan</DialogTitle>
          </DialogHeader>
          {editingPlan && (
            <MembershipPlanForm
              plan={editingPlan}
              onSuccess={() => setEditingPlan(null)}
              onClose={() => setEditingPlan(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
