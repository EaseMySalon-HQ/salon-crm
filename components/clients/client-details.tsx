"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Edit, Save, Wallet, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { clientStore, type Client } from "@/lib/client-store"
import { ClientsAPI } from "@/lib/api"
import { ClientForm } from "@/components/clients/client-form"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface ClientDetailsPageProps {
  clientId: string
  /** Render inside side sheet: no back link, optional close after delete */
  embedded?: boolean
  onClose?: () => void
  /** When true, open form in edit mode (e.g. from row "Edit client") */
  initialEditMode?: boolean
  /** Notified when edit mode toggles (e.g. drawer sheet title) */
  onEditModeChange?: (editing: boolean) => void
  /** After successful save while embedded (e.g. refresh ClientDetailPanel) */
  onProfileSaved?: () => void
}

export function ClientDetailsPage({
  clientId,
  embedded = false,
  onClose,
  initialEditMode = false,
  onEditModeChange,
  onProfileSaved,
}: ClientDetailsPageProps) {
  const [client, setClient] = useState<Client | null>(null)
  const [isEditMode, setIsEditMode] = useState(initialEditMode)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsEditMode(!!initialEditMode)
  }, [clientId, initialEditMode])

  useEffect(() => {
    onEditModeChange?.(isEditMode)
  }, [isEditMode, onEditModeChange])

  useEffect(() => {
    let cancelled = false
    const fetchClient = async () => {
      setIsLoading(true)
      try {
        let clientData = clientStore.getClientById(clientId)

        if (!clientData) {
          const res = await ClientsAPI.getById(clientId)
          if (res.success && res.data) {
            const c = res.data as any
            const id = c._id || c.id || clientId
            clientData = {
              ...c,
              id,
              _id: id,
              birthdate: c.birthdate || c.dob || undefined,
            } as Client
          }
        }

        if (cancelled) return

        if (clientData) {
          setClient(clientData)
        } else {
          toast({
            title: "Error",
            description: "Client not found.",
            variant: "destructive",
          })
          setClient(null)
        }
      } catch (error) {
        console.error("Error fetching client:", error)
        if (!cancelled) {
          toast({
            title: "Error",
            description: "Failed to load client details.",
            variant: "destructive",
          })
          setClient(null)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchClient()
    return () => {
      cancelled = true
    }
  }, [clientId])

  const handleEdit = () => {
    setIsEditMode(true)
  }

  const handleCancelEdit = () => {
    setIsEditMode(false)
  }

  const handleDelete = async () => {
    if (!client) return

    try {
      const success = await clientStore.deleteClient(clientId)
      
      if (success) {
        toast({
          title: "Client Deleted",
          description: "Client has been successfully deleted.",
          duration: 3000,
        })
        setIsDeleteDialogOpen(false)
        if (embedded) {
          void clientStore.loadClients()
          onClose?.()
        } else {
          window.location.href = "/clients"
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to delete client. Please try again.",
          variant: "destructive",
          duration: 5000,
        })
      }
    } catch (error) {
      console.error("Error deleting client:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to delete client. Please try again."
      
      toast({
        title: "Delete Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 6000,
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading client details...</div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Client not found</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col space-y-6">
      <div
        className={cn(
          "flex flex-col gap-4 sm:flex-row sm:items-center",
          embedded ? "sm:justify-end" : "sm:justify-between",
        )}
      >
        {!embedded && (
          <div className="flex items-center gap-4 min-w-0">
            <Button asChild variant="outline" size="icon">
              <Link href="/clients">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">
              {isEditMode ? "Edit User Details" : "User Details"}
            </h1>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!isEditMode && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/clients/${clientId}/wallet`}>
                  <Wallet className="mr-2 h-4 w-4" />
                  Wallet
                </Link>
              </Button>
              <Button onClick={handleEdit} variant="outline" size="sm">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </>
          )}
          {isEditMode && (
            <>
              <Button onClick={handleCancelEdit} variant="outline" size="sm">
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" form="client-form" size="sm">
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
            </>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      <ClientForm
        client={client}
        isEditMode={isEditMode}
        onEditComplete={() => {
          setIsEditMode(false)
          void clientStore.loadClients()
          if (embedded) {
            onProfileSaved?.()
          }
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete client?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The client and associated references may be removed or affected. Are you sure you want to permanently delete this client?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 