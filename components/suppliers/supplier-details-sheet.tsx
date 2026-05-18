"use client"

import * as React from "react"
import {
  User,
  Phone,
  MessageCircle,
  Hash,
  Building2,
  StickyNote,
  Landmark,
  Tag,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

function InfoItem({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  const displayValue = value?.trim() || "—"
  return (
    <div className="flex gap-3 rounded-lg bg-slate-50/80 px-3 py-2.5 dark:bg-slate-900/40">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 break-words text-sm leading-snug ${value?.trim() ? "font-medium text-foreground" : "text-muted-foreground"}`}>
          {displayValue}
        </p>
      </div>
    </div>
  )
}

export interface SupplierDetailsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: any | null
  onEdit?: () => void
}

export function SupplierDetailsSheet({ open, onOpenChange, supplier, onEdit }: SupplierDetailsSheetProps) {
  if (!supplier) return null

  const categories = Array.isArray(supplier.categories)
    ? supplier.categories
    : supplier.category
      ? [supplier.category]
      : []
  const supplierNotesTrimmed = supplier.notes == null ? "" : String(supplier.notes).trim()
  const hasSupplierNotes = supplierNotesTrimmed.length > 0

  const openEdit = () => {
    onOpenChange(false)
    window.setTimeout(() => onEdit?.(), 0)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle>Supplier profile</SheetTitle>
          <p className="text-sm font-medium text-foreground">{supplier.name}</p>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 py-4">
          <Card className="border-slate-200/90 shadow-sm">
            <CardContent className="grid min-w-0 grid-cols-1 gap-2.5 pt-6 sm:grid-cols-2">
              <InfoItem label="Contact name" value={supplier.contactPerson || ""} icon={User} />
              <InfoItem label="Phone" value={supplier.phone || ""} icon={Phone} />
              <InfoItem label="WhatsApp" value={supplier.whatsapp || ""} icon={MessageCircle} />
              <InfoItem label="Email" value={supplier.email || ""} />
              <InfoItem label="GST number" value={supplier.gstNumber || ""} icon={Hash} />
              <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-50/80 px-3 py-2.5 sm:col-span-2 dark:bg-slate-900/40">
                <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Landmark className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Bank details
                </p>
                <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground">
                  {supplier.bankDetails?.trim() || "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/90 shadow-sm">
            <CardContent className="grid min-w-0 grid-cols-1 gap-4 pt-6">
              <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-50/80 px-3 py-2.5 dark:bg-slate-900/40">
                <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Address
                </p>
                <p className="break-words text-sm font-medium leading-snug text-foreground">
                  {supplier.address?.trim() || "—"}
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-50/80 px-3 py-2.5 dark:bg-slate-900/40">
                <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Categories
                </p>
                {categories.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((c: string) => (
                      <Badge key={c} variant="secondary" className="font-normal">
                        {c}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
              {hasSupplierNotes ? (
                <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-slate-50/80 px-3 py-2.5 dark:bg-slate-900/40">
                  <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <StickyNote className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Notes
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground">
                    {supplierNotesTrimmed}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {onEdit ? (
          <SheetFooter className="mt-auto border-t border-slate-200/80 pt-4 dark:border-slate-800/80">
            <Button type="button" className="w-full sm:w-auto" onClick={openEdit}>
              Edit profile
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
