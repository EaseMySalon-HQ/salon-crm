"use client"

import { Calendar, Layers, MoreVertical, Edit, Archive, ToggleLeft, ToggleRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface PackageCardProps {
  pkg: any
  onEdit: (id: string) => void
  onStatusChange: (id: string, status: string) => void
  onArchive: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-yellow-100 text-yellow-700",
  ARCHIVED: "bg-gray-100 text-gray-500"
}

export function PackageCard({ pkg, onEdit, onStatusChange, onArchive }: PackageCardProps) {
  return (
    <div className="bg-white border rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{pkg.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[pkg.status] || ""}`}>
              {pkg.status}
            </span>
            <Badge variant="outline" className="text-xs">{pkg.type}</Badge>
          </div>
          {pkg.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{pkg.description}</p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(pkg._id)}>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </DropdownMenuItem>
            {pkg.status === "ACTIVE" ? (
              <DropdownMenuItem onClick={() => onStatusChange(pkg._id, "INACTIVE")}>
                <ToggleLeft className="h-4 w-4 mr-2" /> Deactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onStatusChange(pkg._id, "ACTIVE")}>
                <ToggleRight className="h-4 w-4 mr-2" /> Activate
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onArchive(pkg._id)}
              className="text-red-600 focus:text-red-600"
            >
              <Archive className="h-4 w-4 mr-2" /> Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-gray-900">₹{pkg.total_price}</span>
          {pkg.discount_amount > 0 && (
            <span className="text-xs text-green-600">
              ({pkg.discount_type === "PERCENT" ? `${pkg.discount_amount}% off` : `₹${pkg.discount_amount} off`})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" />
          <span>{pkg.total_sittings} sitting{pkg.total_sittings !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          <span>{pkg.validity_days ? `${pkg.validity_days} days` : "Never expires"}</span>
        </div>
        {pkg.service_count !== undefined && (
          <span className="text-xs text-gray-400">{pkg.service_count} service{pkg.service_count !== 1 ? "s" : ""}</span>
        )}
      </div>
    </div>
  )
}
