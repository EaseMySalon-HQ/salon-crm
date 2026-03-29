"use client"

import { useState, useEffect } from "react"
import { Search, X, Tag } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ServicesAPI } from "@/lib/api"

export interface SelectedService {
  _id: string
  name: string
  price: number
  is_optional: boolean
  tag: string
}

interface PackageServiceSelectorProps {
  selected: SelectedService[]
  onChange: (services: SelectedService[]) => void
  packageType: "FIXED" | "CUSTOMIZED"
}

export function PackageServiceSelector({ selected, onChange, packageType }: PackageServiceSelectorProps) {
  const [allServices, setAllServices] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ServicesAPI.getAll({ limit: 200 })
      .then(res => {
        if (res.success) setAllServices(res.data || [])
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = allServices.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const isSelected = (id: string) => selected.some(s => s._id === id)

  const toggle = (service: any) => {
    if (isSelected(service._id)) {
      onChange(selected.filter(s => s._id !== service._id))
    } else {
      onChange([...selected, {
        _id: service._id,
        name: service.name,
        price: service.price || 0,
        is_optional: packageType === "CUSTOMIZED",
        tag: ""
      }])
    }
  }

  const updateTag = (id: string, tag: string) => {
    onChange(selected.map(s => s._id === id ? { ...s, tag } : s))
  }

  const toggleOptional = (id: string) => {
    onChange(selected.map(s => s._id === id ? { ...s, is_optional: !s.is_optional } : s))
  }

  const removeService = (id: string) => {
    onChange(selected.filter(s => s._id !== id))
  }

  if (loading) {
    return <div className="h-32 flex items-center justify-center text-sm text-gray-400">Loading services…</div>
  }

  return (
    <div className="space-y-3">
      {/* Selected services */}
      {selected.length > 0 && (
        <div className="border rounded-lg divide-y">
          {selected.map(s => (
            <div key={s._id} className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                <p className="text-xs text-gray-500">₹{s.price}</p>
              </div>
              <Input
                value={s.tag}
                onChange={e => updateTag(s._id, e.target.value)}
                placeholder="Tag (e.g. Hair)"
                className="h-7 w-28 text-xs"
              />
              {packageType === "CUSTOMIZED" && (
                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                  <Checkbox
                    checked={s.is_optional}
                    onCheckedChange={() => toggleOptional(s._id)}
                  />
                  Optional
                </label>
              )}
              <button onClick={() => removeService(s._id)} className="text-gray-400 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search + add services */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search services to add…"
          className="pl-9"
        />
      </div>

      {search && (
        <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No services found</p>
          ) : (
            filtered.map(s => (
              <button
                key={s._id}
                type="button"
                onClick={() => toggle(s)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 ${
                  isSelected(s._id) ? "bg-indigo-50" : ""
                }`}
              >
                <div>
                  <p className="text-sm text-gray-800">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.category || "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">₹{s.price}</span>
                  {isSelected(s._id) && (
                    <Badge variant="secondary" className="text-xs">Added</Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
