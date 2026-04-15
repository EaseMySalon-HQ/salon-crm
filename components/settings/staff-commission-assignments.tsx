"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { Search, Users, ExternalLink, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { StaffDirectoryAPI, CommissionProfileAPI, StaffAPI, UsersAPI } from "@/lib/api"
import type { CommissionProfile } from "@/lib/commission-profile-types"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"

type DirectoryStaff = {
  _id: string
  name: string
  email?: string
  phone?: string
  role?: string
  commissionProfileIds?: string[]
  specialties?: string[]
  salary?: number
  notes?: string
  isActive?: boolean
  isOwner?: boolean
  source?: string
  hasLoginAccess?: boolean
  allowAppointmentScheduling?: boolean
}

function profileKey(p: CommissionProfile): string {
  return String(p.id ?? p._id ?? "")
}

export function StaffCommissionAssignments() {
  const { toast } = useToast()
  const { user } = useAuth()
  const canManage = user?.role === "admin" || user?.role === "manager"
  const isAdmin = user?.role === "admin"

  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<DirectoryStaff[]>([])
  const [profilesById, setProfilesById] = useState<Map<string, CommissionProfile>>(new Map())
  const [search, setSearch] = useState("")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<DirectoryStaff | null>(null)
  const [draftIds, setDraftIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [dirRes, profRes] = await Promise.all([
        StaffDirectoryAPI.getAll({}),
        CommissionProfileAPI.getProfiles(),
      ])

      const staffList = Array.isArray(dirRes?.data) ? (dirRes.data as DirectoryStaff[]) : []
      const profileList = Array.isArray(profRes?.data) ? (profRes.data as CommissionProfile[]) : []

      const map = new Map<string, CommissionProfile>()
      for (const p of profileList) {
        const k = profileKey(p)
        if (k) map.set(k, p)
      }
      setProfilesById(map)
      setStaff(
        [...staffList].sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }))
      )
    } catch (e) {
      console.error(e)
      toast({
        title: "Unable to load assignments",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      })
      setStaff([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const profilesList = useMemo(() => {
    return Array.from(profilesById.values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
    )
  }, [profilesById])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return staff
    return staff.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.role || "").toLowerCase().includes(q)
    )
  }, [staff, search])

  const resolveProfiles = (ids: string[] | undefined) => {
    if (!ids?.length) return { resolved: [] as CommissionProfile[], missing: [] as string[] }
    const resolved: CommissionProfile[] = []
    const missing: string[] = []
    for (const id of ids) {
      const sid = String(id)
      const p = profilesById.get(sid)
      if (p) resolved.push(p)
      else missing.push(sid)
    }
    return { resolved, missing }
  }

  const typeLabel = (type: string) => {
    switch (type) {
      case "target_based":
        return "Target"
      case "service_based":
        return "Service"
      case "item_based":
        return "Item"
      default:
        return type
    }
  }

  const openEditor = (row: DirectoryStaff) => {
    if (!canManage) {
      toast({
        title: "Not allowed",
        description: "Only administrators and managers can change commission profile assignments here.",
        variant: "destructive",
      })
      return
    }
    setSelectedStaff(row)
    setDraftIds((row.commissionProfileIds || []).map(String))
    setDialogOpen(true)
  }

  const toggleProfile = (id: string, checked: boolean) => {
    setDraftIds((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id]
      }
      return prev.filter((x) => x !== id)
    })
  }

  const handleSave = async () => {
    if (!selectedStaff) return

    if (selectedStaff.isOwner && !isAdmin) {
      toast({
        title: "Not allowed",
        description: "Only an administrator can change commission profiles for the business owner.",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      if (selectedStaff.isOwner) {
        const nameParts = (selectedStaff.name || "").trim().split(/\s+/)
        const firstName = nameParts[0] || selectedStaff.name || ""
        const lastName = nameParts.slice(1).join(" ") || ""
        const res = await UsersAPI.update(selectedStaff._id, {
          firstName,
          lastName,
          email: selectedStaff.email || "",
          mobile: selectedStaff.phone || "",
          hasLoginAccess: selectedStaff.hasLoginAccess !== false,
          allowAppointmentScheduling: selectedStaff.allowAppointmentScheduling !== false,
          commissionProfileIds: draftIds,
        })
        if (!res?.success) {
          throw new Error((res as { error?: string })?.error || "Failed to update owner")
        }
      } else {
        const res = await StaffAPI.update(selectedStaff._id, {
          name: selectedStaff.name,
          email: selectedStaff.email,
          phone: selectedStaff.phone || "",
          role: selectedStaff.role,
          specialties: selectedStaff.specialties || [],
          salary: selectedStaff.salary ?? 0,
          commissionProfileIds: draftIds,
          notes: selectedStaff.notes || "",
          hasLoginAccess: selectedStaff.hasLoginAccess,
          allowAppointmentScheduling: selectedStaff.allowAppointmentScheduling,
          isActive: selectedStaff.isActive !== false,
        })
        if (!res?.success) {
          throw new Error((res as { error?: string })?.error || "Failed to update staff")
        }
      }

      toast({
        title: "Commission profiles updated",
        description: `Assignments saved for ${selectedStaff.name}.`,
      })
      setDialogOpen(false)
      setSelectedStaff(null)

      const dirRes = await StaffDirectoryAPI.getAll({})
      const staffList = Array.isArray(dirRes?.data) ? (dirRes.data as DirectoryStaff[]) : []
      setStaff(
        [...staffList].sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }))
      )
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      const msg =
        err?.response?.data?.error ||
        (e instanceof Error ? e.message : "Could not save assignments.")
      toast({
        title: "Save failed",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const ownerNeedsAdmin = Boolean(selectedStaff?.isOwner && !isAdmin)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Click a staff row to assign or remove commission profiles. You can also edit assignments from{" "}
          <Link href="/staff" className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-1">
            Staff
            <ExternalLink className="h-3 w-3" />
          </Link>
          . {!canManage ? "Your role can view this list only." : null}
        </p>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search staff…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search staff"
          />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="font-semibold text-slate-700 py-3 px-4">Staff</TableHead>
                <TableHead className="font-semibold text-slate-700 py-3 px-4">Role</TableHead>
                <TableHead className="font-semibold text-slate-700 py-3 px-4">Email</TableHead>
                <TableHead className="font-semibold text-slate-700 py-3 px-4 min-w-[240px]">
                  Assigned commission profiles
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                    Loading staff and profiles…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                    {staff.length === 0 ? "No staff found." : "No matches for your search."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const { resolved, missing } = resolveProfiles(row.commissionProfileIds)
                  return (
                    <TableRow
                      key={row._id}
                      className={cn(
                        "border-b border-slate-100",
                        canManage && "cursor-pointer hover:bg-slate-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      )}
                      onClick={() => openEditor(row)}
                      onKeyDown={(e) => {
                        if (!canManage) return
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          openEditor(row)
                        }
                      }}
                      tabIndex={canManage ? 0 : undefined}
                      role={canManage ? "button" : undefined}
                      aria-label={canManage ? `Edit commission profiles for ${row.name}` : undefined}
                    >
                      <TableCell className="py-3 px-4 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{row.name}</span>
                          {row.isOwner ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              Owner
                            </Badge>
                          ) : null}
                          {row.isActive === false ? (
                            <Badge variant="secondary" className="text-xs font-normal">
                              Inactive
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 capitalize">{row.role || "—"}</TableCell>
                      <TableCell className="py-3 px-4 text-slate-600 text-sm">{row.email || "—"}</TableCell>
                      <TableCell className="py-3 px-4">
                        {resolved.length === 0 && missing.length === 0 ? (
                          <span className="text-sm text-muted-foreground italic">None assigned</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {resolved.map((p) => {
                              const id = profileKey(p)
                              return (
                                <Badge
                                  key={id}
                                  variant="secondary"
                                  className="font-normal max-w-[220px] truncate"
                                  title={p.description || p.name}
                                >
                                  <span className="truncate">{p.name}</span>
                                  <span className="opacity-70 ml-1 shrink-0">· {typeLabel(p.type)}</span>
                                </Badge>
                              )
                            })}
                            {missing.length > 0 ? (
                              <Badge
                                variant="outline"
                                className="font-normal text-amber-800 border-amber-200 bg-amber-50"
                                title={`Missing profile id(s): ${missing.join(", ")}`}
                              >
                                Unknown profile{missing.length > 1 ? ` (${missing.length})` : ""}
                              </Badge>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {!loading && staff.length > 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>
            Showing {filtered.length} of {staff.length} staff
          </span>
        </div>
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false)
            setSelectedStaff(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Commission profiles</DialogTitle>
            <DialogDescription>
              {selectedStaff ? (
                <>
                  Choose which profiles apply to <span className="font-medium text-foreground">{selectedStaff.name}</span>
                  .
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {ownerNeedsAdmin ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Only an administrator can change commission profiles for the business owner.
            </p>
          ) : null}

          {profilesList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No commission profiles are defined. Create profiles under the <strong>Commission profiles</strong> tab. You
              can still save to clear any stale assignments for this person.
            </p>
          ) : (
            <ScrollArea className="h-[min(320px,50vh)] pr-3">
              <div className="space-y-3">
                {profilesList.map((p) => {
                  const id = profileKey(p)
                  if (!id) return null
                  const checked = draftIds.includes(id)
                  return (
                    <div
                      key={id}
                      className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5"
                    >
                      <Checkbox
                        id={`cp-${id}`}
                        checked={checked}
                        disabled={ownerNeedsAdmin}
                        onCheckedChange={(v) => toggleProfile(id, v === true)}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <Label htmlFor={`cp-${id}`} className="cursor-pointer font-medium leading-tight">
                          {p.name}
                        </Label>
                        <span className="text-xs text-muted-foreground">
                          {p.type === "target_based"
                            ? "Commission by target"
                            : p.type === "service_based"
                              ? "Commission by service"
                              : "Commission by item"}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialogOpen(false)
                setSelectedStaff(null)
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || ownerNeedsAdmin}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
