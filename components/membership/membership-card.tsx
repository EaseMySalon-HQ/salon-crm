"use client"

import { useState, useEffect } from "react"
import { CreditCard, Calendar, Percent, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MembershipAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"

interface MembershipCardProps {
  clientId: string
}

export function MembershipCard({ clientId }: MembershipCardProps) {
  const { toast } = useToast()
  const [data, setData] = useState<{
    subscription: any
    plan: any
    usageSummary: Array<{ serviceId: string; serviceName: string; used: number; limit: number; remaining: number }>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string>("")
  const [plans, setPlans] = useState<any[]>([])
  const [subscribing, setSubscribing] = useState(false)

  const fetchMembership = async () => {
    if (!clientId) return
    setLoading(true)
    try {
      const res = await MembershipAPI.getByCustomer(clientId)
      if (res.success) {
        setData(res.data as any)
      }
    } catch (e) {
      console.error("Failed to fetch membership:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMembership()
  }, [clientId])

  const fetchPlans = async () => {
    const res = await MembershipAPI.getPlans({ isActive: true })
    if (res.success) setPlans(res.data || [])
  }

  useEffect(() => {
    if (assignDialogOpen) fetchPlans()
  }, [assignDialogOpen])

  const handleAssign = async () => {
    if (!selectedPlanId) {
      toast({ title: "Select a plan", variant: "destructive" })
      return
    }
    setSubscribing(true)
    try {
      const res = await MembershipAPI.subscribe({ customerId: clientId, planId: selectedPlanId })
      if (res.success) {
        toast({ title: "Membership assigned" })
        setAssignDialogOpen(false)
        setSelectedPlanId("")
        fetchMembership()
      } else {
        toast({ title: "Error", description: res.error, variant: "destructive" })
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" })
    } finally {
      setSubscribing(false)
    }
  }

  const subscription = data?.subscription
  const plan = data?.plan || subscription?.planId
  const usageSummary = data?.usageSummary || []
  const isActive = subscription?.status === "ACTIVE"
  const isExpired = subscription?.status === "EXPIRED" || (subscription?.expiryDate && new Date(subscription.expiryDate) < new Date())

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Membership
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Membership
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!subscription || (!isActive && !subscription) ? (
            <div>
              <p className="text-muted-foreground text-sm mb-3">No active membership</p>
              <Button size="sm" onClick={() => setAssignDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Assign Plan
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium">{plan?.planName || "Plan"}</span>
                <Badge variant={isActive && !isExpired ? "default" : "destructive"}>
                  {isActive && !isExpired ? "Active" : "Expired"}
                </Badge>
              </div>
              {subscription?.expiryDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Expires: {format(new Date(subscription.expiryDate), "MMM d, yyyy")}
                </div>
              )}
              {plan?.discountPercentage > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Percent className="h-4 w-4" />
                  {plan.discountPercentage}% discount on non-included services
                </div>
              )}
              {usageSummary.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Remaining usage</p>
                  <ul className="text-sm space-y-1">
                    {usageSummary.map((u) => (
                      <li key={u.serviceId}>
                        {u.serviceName}: {u.remaining} / {u.limit} left
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(!isActive || isExpired) && (
                <Button size="sm" variant="outline" onClick={() => setAssignDialogOpen(true)}>
                  Re-subscribe
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Membership Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p._id || p.id} value={(p._id || p.id).toString()}>
                    {p.planName} - {p.durationInDays} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAssign} disabled={subscribing || !selectedPlanId}>
              {subscribing ? "Assigning..." : "Assign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
