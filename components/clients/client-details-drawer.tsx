"use client"

import { useLayoutEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ClientDetailPanel } from "@/components/appointments/client-detail-panel"
import { ClientDetailsPage } from "@/components/clients/client-details"
import type { Client } from "@/lib/client-store"

export interface ClientDetailsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Row / store client — same object shape as in the New Appointment side panel */
  client: Client | null
  /** Open directly into full profile (e.g. Actions → Edit Client) */
  initialExpandProfile?: boolean
  /** Start profile form in edit mode (used with initialExpandProfile) */
  initialEditMode?: boolean
}

function normalizeClientForPanel(c: Client): Client {
  const id = String(c._id || c.id || "")
  return { ...c, id, _id: id }
}

export function ClientDetailsDrawer({ open, onOpenChange, client }: ClientDetailsDrawerProps) {
  const [profileExpanded, setProfileExpanded] = useState(false)
  const [profileEditing, setProfileEditing] = useState(false)
  const [panelRefreshKey, setPanelRefreshKey] = useState(0)

  const panelClient = open && client ? normalizeClientForPanel(client) : null
  const clientId = panelClient?._id || panelClient?.id

  useEffect(() => {
    if (!open) {
      setProfileExpanded(false)
      setProfileEditing(false)
    }
  }, [open])

  const closeProfileLayout = () => {
    setProfileExpanded(false)
    setProfileEditing(false)
  }

  const sheetTitle = !profileExpanded
    ? "Client Details"
    : profileEditing
      ? "Edit user details"
      : "User Details"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "w-full overflow-hidden p-0 flex flex-col transition-[max-width] duration-200",
          profileExpanded ? "sm:max-w-4xl" : "sm:max-w-xl",
        )}
      >
        <div className="flex h-full min-h-0 overflow-hidden flex-col flex-1">
          <SheetHeader className="border-b border-border/60 px-6 py-4 shrink-0 space-y-0 pr-14">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {profileExpanded ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 h-8 px-2 -ml-2"
                    onClick={closeProfileLayout}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                ) : null}
                <SheetTitle
                  className={cn(
                    profileExpanded
                      ? "sr-only"
                      : "text-foreground text-base font-semibold tracking-tight truncate",
                  )}
                >
                  {sheetTitle}
                </SheetTitle>
              </div>
            </div>
          </SheetHeader>

          {profileExpanded && clientId && panelClient ? (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-6">
                <ClientDetailsPage
                  key={`drawer-profile-${clientId}`}
                  clientId={clientId}
                  embedded
                  initialEditMode={sessionStartInEditMode}
                  onClose={() => onOpenChange(false)}
                  onEditModeChange={setProfileEditing}
                  onProfileSaved={() => setPanelRefreshKey((k) => k + 1)}
                />
              </div>
              <aside
                className="w-full min-w-0 overflow-y-auto border-l border-slate-200/80 bg-slate-50/50 shrink-0 hidden sm:block"
                style={{ width: 400 }}
              >
                <div className="p-4">
                  <ClientDetailPanel
                    key={`${clientId}-${panelRefreshKey}`}
                    client={panelClient}
                  />
                </div>
              </aside>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {panelClient ? (
                <ClientDetailPanel
                  key={`${clientId}-${panelRefreshKey}`}
                  client={panelClient}
                  onViewProfile={() => {
                    setProfileExpanded(true)
                    setProfileEditing(false)
                  }}
                />
              ) : null}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
