"use client"

import { Tag, Calendar, Layers } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface Service {
  _id: string
  name: string
  price: number
}

interface PackagePricePreviewProps {
  name: string
  type: string
  totalPrice: number
  discountAmount: number
  discountType: string
  totalSittings: number
  validityDays: number | null
  services: Service[]
  minServiceCount: number
  /** When false, summary shows single-visit copy instead of sitting counts */
  sittingsEnabled?: boolean
}

export function PackagePricePreview({
  name,
  type,
  totalPrice,
  discountAmount,
  discountType,
  totalSittings,
  validityDays,
  services,
  minServiceCount,
  sittingsEnabled = true
}: PackagePricePreviewProps) {
  const serviceSum = services.reduce((sum, s) => sum + (s.price || 0), 0)
  const savings = serviceSum > 0 ? serviceSum - totalPrice : 0
  const savingsPct = serviceSum > 0 ? Math.round((savings / serviceSum) * 100) : 0

  return (
    <Card className="sticky top-4 border-indigo-100 bg-indigo-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-indigo-700">Package Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="font-medium text-gray-800 text-base">{name || "—"}</p>
          <Badge variant="outline" className="mt-1 text-xs">{type || "—"}</Badge>
        </div>

        <div className="flex items-center gap-2 text-gray-600">
          <Layers className="h-4 w-4" />
          {!sittingsEnabled ? (
            <span>Single visit</span>
          ) : (
            <>
              <span>
                {totalSittings || 0} sitting{totalSittings !== 1 ? "s" : ""}
              </span>
              {minServiceCount > 1 && (
                <span className="text-xs text-gray-400">
                  · min {minServiceCount} services/sitting
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-gray-600">
          <Calendar className="h-4 w-4" />
          <span>{validityDays ? `${validityDays} days validity` : "Never expires"}</span>
        </div>

        {services.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Included services:</p>
            <ul className="space-y-0.5">
              {services.map(s => (
                <li key={s._id} className="flex justify-between text-xs text-gray-700">
                  <span>{s.name}</span>
                  <span>₹{s.price}</span>
                </li>
              ))}
            </ul>
            <div className="mt-1 pt-1 border-t flex justify-between text-xs text-gray-500">
              <span>Sum of services</span>
              <span>₹{serviceSum}</span>
            </div>
          </div>
        )}

        <div className="pt-2 border-t">
          <div className="flex justify-between font-semibold text-gray-800">
            <span>Package Price</span>
            <span>₹{totalPrice || 0}</span>
          </div>
          {savings > 0 && (
            <div className="flex items-center gap-1 mt-1 text-green-600 text-xs">
              <Tag className="h-3 w-3" />
              <span>Client saves ₹{savings} ({savingsPct}% off)</span>
            </div>
          )}
          {savings < 0 && (
            <p className="text-xs text-amber-600 mt-1">
              ⚠ Package price is higher than sum of individual services.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
