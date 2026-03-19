"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Pencil } from "lucide-react"

const CASH_DIFFERENCE_REASONS = [
  "Cash not counted properly",
  "Expense not recorded",
  "Payment mismatch",
  "System entry error",
  "Other",
] as const

export interface DifferenceBreakdownEntry {
  date: string
  type: "cash" | "online"
  expectedCash: number
  actualCash: number
  difference: number
  reason?: string
  note?: string
  closingEntryId: string
}

interface CashDifferenceBreakdownDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: DifferenceBreakdownEntry | null
  onAddEditReason: () => void
}

export function CashDifferenceBreakdownDrawer({
  open,
  onOpenChange,
  entry,
  onAddEditReason,
}: CashDifferenceBreakdownDrawerProps) {
  if (!entry) return null

  const title =
    entry.type === "cash"
      ? "Cash Difference Breakdown"
      : "Online Cash Difference Breakdown"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {entry.type === "cash" ? "Expected Cash" : "Expected (Online Sales)"}
              </span>
              <span className="font-medium">₹{entry.expectedCash.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {entry.type === "cash" ? "Actual Cash" : "Actual (Cash in POS)"}
              </span>
              <span className="font-medium">₹{entry.actualCash.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="font-medium">Difference</span>
              <span
                className={`font-bold ${
                  entry.difference > 0
                    ? "text-green-600"
                    : entry.difference < 0
                    ? "text-red-600"
                    : "text-muted-foreground"
                }`}
              >
                ₹{entry.difference.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Reason</h4>
            {entry.reason ? (
              <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">{entry.reason}</p>
                {entry.note && (
                  <p className="text-sm text-muted-foreground">{entry.note}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No reason added yet
              </p>
            )}
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onAddEditReason()
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {entry.reason ? "Edit Reason" : "Add Reason"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { CASH_DIFFERENCE_REASONS }
