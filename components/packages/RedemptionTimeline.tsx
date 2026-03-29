"use client"

import { CheckCircle, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface RedeemedService {
  service_id: string
  service_name: string
  price: number
}

interface Redemption {
  _id: string
  sitting_number: number
  redeemed_at: string
  services_redeemed: RedeemedService[]
  is_reversed: boolean
  reversal_reason?: string
  reversed_at?: string
}

interface RedemptionTimelineProps {
  redemptions: Redemption[]
}

export function RedemptionTimeline({ redemptions }: RedemptionTimelineProps) {
  if (!redemptions || redemptions.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">No redemptions yet.</p>
  }

  return (
    <div className="relative pl-6 space-y-4">
      {/* vertical line */}
      <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-200" />

      {redemptions.map((r) => (
        <div key={r._id} className="relative">
          {/* dot */}
          <span className="absolute -left-4 top-1">
            {r.is_reversed ? (
              <XCircle className="h-4 w-4 text-red-400" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
          </span>

          <div className={`bg-white border rounded-lg p-3 ${r.is_reversed ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className={`text-sm font-medium ${r.is_reversed ? "line-through text-gray-400" : "text-gray-800"}`}>
                Sitting #{r.sitting_number}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(r.redeemed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>

            {r.services_redeemed.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {r.services_redeemed.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {s.service_name}
                  </Badge>
                ))}
              </div>
            )}

            {r.is_reversed && r.reversal_reason && (
              <p className="text-xs text-red-500 mt-1">
                Reversed: {r.reversal_reason}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
