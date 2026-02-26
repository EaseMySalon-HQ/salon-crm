"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Edit, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SideNav } from "@/components/side-nav"
import { TopNav } from "@/components/top-nav"
import { clientStore, type Client } from "@/lib/client-store"
import { ClientForm } from "@/components/clients/client-form"
import { MembershipCard } from "@/components/membership/membership-card"
import { toast } from "@/components/ui/use-toast"
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
}

export function ClientDetailsPage({ clientId }: ClientDetailsPageProps) {
  const [client, setClient] = useState<Client | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const clientData = clientStore.getClientById(clientId)
        
        if (clientData) {
          setClient(clientData)
        } else {
          toast({
            title: "Error",
            description: "Client not found.",
            variant: "destructive",
          })
        }
      } catch (error) {
        console.error("Error fetching client:", error)
        toast({
          title: "Error",
          description: "Failed to load client details.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchClient()
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
        // Redirect to clients list
        window.location.href = "/clients"
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
      <div className="flex min-h-screen flex-col">
        <TopNav />
        <div className="flex flex-1">
          <SideNav />
          <main className="flex-1 p-6 md:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="text-lg">Loading client details...</div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopNav />
        <div className="flex flex-1">
          <SideNav />
          <main className="flex-1 p-6 md:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="text-lg">Client not found</div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <div className="flex flex-1">
        <SideNav />
        <main className="flex-1 p-6 md:p-8">
          <div className="flex flex-col space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button asChild variant="outline" size="icon">
                  <Link href="/clients">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">
                  {isEditMode ? "Edit User Details" : "User Details"}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                {!isEditMode && (
                  <Button onClick={handleEdit} variant="outline">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
                {isEditMode && (
                  <>
                    <Button onClick={handleCancelEdit} variant="outline">
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button type="submit" form="client-form">
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                  </>
                )}
                <Button 
                  variant="destructive" 
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  Delete
                </Button>
              </div>
            </div>
            
            <ClientForm 
              client={client}
              isEditMode={isEditMode}
              onEditComplete={() => setIsEditMode(false)}
            />

            <MembershipCard clientId={clientId} />
          </div>
        </main>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the user.
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