"use client"

import { useState } from "react"
import { AlertTriangle, Calendar, Clock, LogOut, Mail, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/components/ui/use-toast"

const DEFAULT_EMAIL = "support@easemysalon.in"

function formatNextBilling(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d)
}

interface AccountSuspendedProps {
  message?: string
  nextBillingDate?: string | null
  supportEmail?: string
  supportPhone?: string
  billingOneDayExtensionAvailable?: boolean
  onExtendSubscription?: () => Promise<boolean>
  onLogout?: () => void
}

export function AccountSuspended({
  message,
  nextBillingDate,
  supportEmail,
  supportPhone,
  billingOneDayExtensionAvailable = false,
  onExtendSubscription,
  onLogout,
}: AccountSuspendedProps) {
  const [extending, setExtending] = useState(false)
  const formatted = formatNextBilling(nextBillingDate)
  const email =
    supportEmail ||
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUSPENSION_SUPPORT_EMAIL) ||
    DEFAULT_EMAIL
  const phone =
    supportPhone ||
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUSPENSION_SUPPORT_PHONE) ||
    ""

  const handleExtend = async () => {
    if (!onExtendSubscription || extending) return
    setExtending(true)
    try {
      const ok = await onExtendSubscription()
      if (!ok) {
        toast({
          title: "Could not extend subscription",
          description: "Please contact support if you need more time.",
          variant: "destructive",
        })
      }
    } finally {
      setExtending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-amber-600">
            <AlertTriangle className="h-12 w-12" />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
            Account suspended
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            You are signed in, but this salon account cannot use the app until billing is cleared.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-amber-950 flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Access paused
            </CardTitle>
            <CardDescription className="text-amber-900/90 text-base">
              {message ||
                "Subscription billing needs attention — the business owner or billing contact should renew the plan to restore access."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {formatted && (
              <div className="rounded-lg border border-amber-200/80 bg-white/90 px-4 py-3 text-sm">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-900">Next billing date (on record)</p>
                    <p className="text-slate-700 mt-0.5">{formatted}</p>
                  </div>
                </div>
              </div>
            )}

            {billingOneDayExtensionAvailable && onExtendSubscription ? (
              <div className="rounded-lg border border-[#7C3AED]/20 bg-white px-4 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-[#7C3AED] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-900">Need a little more time?</p>
                    <p className="text-sm text-slate-600 mt-1">
                      Extend your subscription by 1 day to restore access while you sort out billing.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]"
                  disabled={extending}
                  onClick={handleExtend}
                >
                  {extending ? "Extending…" : "Extend subscription for 1 day"}
                </Button>
              </div>
            ) : null}

            <Alert className="border-slate-200 bg-white">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-slate-700">
                To lift suspension and use appointments, billing, and reports again, contact EaseMySalon support
                with your business code or registered email.
              </AlertDescription>
            </Alert>

            <div className="space-y-2 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Who to contact</p>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-500 shrink-0" />
                <a href={`mailto:${email}`} className="text-[#7C3AED] hover:underline">
                  {email}
                </a>
              </div>
              {phone ? (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-500 shrink-0" />
                  <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-[#7C3AED] hover:underline">
                    {phone}
                  </a>
                </div>
              ) : null}
            </div>

            {onLogout && (
              <Button type="button" variant="outline" className="w-full" onClick={onLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
