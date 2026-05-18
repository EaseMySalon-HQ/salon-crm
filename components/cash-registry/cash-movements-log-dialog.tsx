"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { Pencil, Trash2, Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CashMovementsAPI } from "@/lib/api"
import { labelForCashMovementType, type CashMovementRow } from "@/lib/cash-movements"
import { toDateStringIST } from "@/lib/date-utils"
import { useToast } from "@/hooks/use-toast"
import { CashMovementModal } from "./cash-movement-modal"

interface CashMovementsLogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  movements: CashMovementRow[]
  canManage: boolean
  onRefresh: () => void
  verifiedDates?: Set<string>
  isAdmin?: boolean
}

export function CashMovementsLogDialog({
  open,
  onOpenChange,
  movements,
  canManage,
  onRefresh,
  verifiedDates,
  isAdmin = false,
}: CashMovementsLogDialogProps) {
  const { toast } = useToast()
  const [editing, setEditing] = useState<CashMovementRow | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<CashMovementRow | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const activeMovements = useMemo(
    () =>
      [...movements]
        .filter((m) => m.status !== "void")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [movements]
  )

  const isDayLocked = (movement: CashMovementRow) => {
    const day = toDateStringIST(movement.date)
    return verifiedDates?.has(day) ?? false
  }

  const handleVoid = async () => {
    if (!voidTarget) return
    setVoiding(true)
    try {
      const res = await CashMovementsAPI.void(voidTarget._id)
      if (res.success) {
        toast({
          title: "Movement removed",
          description: "It no longer affects expected cash for that day.",
        })
        setVoidTarget(null)
        onRefresh()
      } else {
        throw new Error((res as { error?: string }).error || "Failed to void")
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } }
      toast({
        title: "Could not remove",
        description: ax.response?.data?.error || (e instanceof Error ? e.message : "Unknown error"),
        variant: "destructive",
      })
    } finally {
      setVoiding(false)
    }
  }

  const openEdit = (row: CashMovementRow) => {
    setEditing(row)
    setEditModalOpen(true)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Cash movements</DialogTitle>
            <DialogDescription>
              Correct mistakes with Edit, or remove a wrong entry with Delete (void). Changes update expected cash for that day.
              {canManage ? "" : " Only managers can edit or delete."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto border rounded-lg">
            {activeMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No movements in this date range.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>By</TableHead>
                    {canManage && <TableHead className="text-right w-[100px]">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeMovements.map((m) => {
                    const locked = isDayLocked(m) && !isAdmin
                    return (
                      <TableRow key={m._id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(m.date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm">{labelForCashMovementType(m.type)}</span>
                            <Badge
                              variant="outline"
                              className={
                                m.direction === "in"
                                  ? "w-fit text-emerald-700 border-emerald-200"
                                  : "w-fit text-amber-700 border-amber-200"
                              }
                            >
                              {m.direction === "in" ? "In" : "Out"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">₹{Number(m.amount).toFixed(2)}</TableCell>
                        <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground">
                          {m.reason || m.referenceNo || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.createdBy || "—"}</TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title={locked ? "Day verified — admin only" : "Edit"}
                                disabled={locked}
                                onClick={() => openEdit(m)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                title={locked ? "Day verified — admin only" : "Delete (void)"}
                                disabled={locked}
                                onClick={() => setVoidTarget(m)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            {canManage ? (
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New movement
              </Button>
            ) : (
              <span />
            )}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CashMovementModal
        open={editModalOpen}
        onOpenChange={(o) => {
          setEditModalOpen(o)
          if (!o) setEditing(null)
        }}
        editing={editing}
        onSuccess={() => {
          onRefresh()
          setEditModalOpen(false)
          setEditing(null)
        }}
      />

      <CashMovementModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          onRefresh()
          setAddOpen(false)
        }}
      />

      <AlertDialog open={Boolean(voidTarget)} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this movement?</AlertDialogTitle>
            <AlertDialogDescription>
              {voidTarget && (
                <>
                  {labelForCashMovementType(voidTarget.type)} — ₹{Number(voidTarget.amount).toFixed(2)} on{" "}
                  {format(new Date(voidTarget.date), "dd MMM yyyy")}. This cannot be undone, but the entry stays in the
                  log as voided for audit.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voiding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={voiding}
              onClick={(e) => {
                e.preventDefault()
                handleVoid()
              }}
            >
              {voiding ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
