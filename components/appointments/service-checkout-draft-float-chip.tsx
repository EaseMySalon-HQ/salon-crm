"use client"

import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import {
  clearServiceCheckoutDraftByRef,
  dispatchServiceCheckoutDraftChanged,
  listServiceCheckoutDrafts,
  subscribeServiceCheckoutDraftChanged,
  type ServiceCheckoutDraftChipMeta,
} from "@/lib/service-checkout-draft-storage"

type ServiceCheckoutDraftFloatChipProps = {
  /** Hide while the appointment drawer covers the calendar (optional). */
  hidden?: boolean
  onResumeDraft: (meta: ServiceCheckoutDraftChipMeta) => void
}

function refreshDrafts(): ServiceCheckoutDraftChipMeta[] {
  return listServiceCheckoutDrafts()
}

export function ServiceCheckoutDraftFloatChip({ hidden, onResumeDraft }: ServiceCheckoutDraftFloatChipProps) {
  const [drafts, setDrafts] = useState<ServiceCheckoutDraftChipMeta[]>(() =>
    typeof window === "undefined" ? [] : refreshDrafts()
  )
  const [discardTarget, setDiscardTarget] = useState<ServiceCheckoutDraftChipMeta | null>(null)

  const sync = useCallback(() => {
    setDrafts(refreshDrafts())
  }, [])

  useEffect(() => sync(), [sync])

  useEffect(() => {
    return subscribeServiceCheckoutDraftChanged(sync)
  }, [sync])

  if (hidden || drafts.length === 0) return null

  return (
    <>
      <div
        className="fixed bottom-6 right-6 z-[45] flex max-w-[calc(100vw-3rem)] flex-row flex-nowrap items-center justify-end gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="region"
        aria-label="Saved checkout drafts"
      >
        {drafts.map((meta) => {
          const initial = (meta.clientName || "?").trim().charAt(0).toUpperCase() || "?"
          return (
            <div
              key={meta.draftRef}
              className="flex max-w-[min(240px,calc(100vw-4rem))] shrink-0 items-center gap-0 rounded-2xl bg-black py-1.5 pl-2 pr-1 shadow-lg shadow-black/25"
            >
              <button
                type="button"
                onClick={() => onResumeDraft(meta)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-0.5 text-left text-white transition-colors hover:bg-white/10"
              >
                <Avatar className="h-8 w-8 shrink-0 border border-white/25">
                  <AvatarFallback className="bg-white text-xs font-semibold text-black">{initial}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 truncate text-sm font-medium">{meta.clientName}</span>
              </button>
              <button
                type="button"
                className="shrink-0 rounded-full p-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white"
                aria-label="Discard saved draft"
                onClick={(e) => {
                  e.stopPropagation()
                  setDiscardTarget(meta)
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>

      <AlertDialog open={!!discardTarget} onOpenChange={(o) => !o && setDiscardTarget(null)}>
        <AlertDialogContent className="z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel draft sale?</AlertDialogTitle>
            <AlertDialogDescription>
              Canceling will remove this sale from your saved drafts and clear add-on items if you open checkout again.
              The appointment will be unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-foreground text-background hover:bg-foreground/90"
              onClick={() => {
                if (discardTarget) {
                  clearServiceCheckoutDraftByRef(discardTarget.draftRef)
                  dispatchServiceCheckoutDraftChanged()
                }
                setDiscardTarget(null)
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
