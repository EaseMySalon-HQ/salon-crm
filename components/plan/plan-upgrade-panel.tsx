"use client"

import Link from "next/link"
import { ArrowUpRight, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface PlanUpgradePanelProps {
  title: string
  description?: string
}

export function PlanUpgradePanel({ title, description }: PlanUpgradePanelProps) {
  return (
    <Card className="border-amber-200 bg-amber-50/80 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <CardTitle className="text-amber-900">{title}</CardTitle>
        </div>
        <CardDescription className="text-amber-800/90">
          {description ||
            "This feature is not included in your current plan. Upgrade to Growth or Pro to unlock it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="bg-amber-600 hover:bg-amber-700">
          <Link href="/settings?section=plan-billing">
            View plans &amp; upgrade
            <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
