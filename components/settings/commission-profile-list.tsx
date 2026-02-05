"use client"

import { useState, useEffect } from "react"
import { Plus, Edit, Trash2, MoreHorizontal, Target, Award, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CommissionProfile, CommissionProfileFormData } from "@/lib/commission-profile-types"
import { useToast } from "@/components/ui/use-toast"
import { AddCommissionProfileModal } from "./add-commission-profile-modal"
import { EditCommissionProfileModal } from "./edit-commission-profile-modal"
import { CommissionProfileAPI } from "@/lib/api"

export function CommissionProfileList() {
  const { toast } = useToast()
  const [profiles, setProfiles] = useState<CommissionProfile[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<CommissionProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleteLoading, setIsDeleteLoading] = useState(false)

  const normalizeProfile = (profile: CommissionProfile): CommissionProfile => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backendId = profile.id || profile._id || (profile as any)?._id
    return {
      ...profile,
      id: backendId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    }
  }

  const fetchProfiles = async () => {
    setIsLoading(true)
    try {
      const response = await CommissionProfileAPI.getProfiles()
      if (response?.success) {
        const normalized = (response.data || []).map((profile: CommissionProfile) => normalizeProfile(profile))
        setProfiles(normalized)
      } else {
        toast({
          title: "Unable to load commission profiles",
          description: response?.error || "Please try again.",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error fetching commission profiles:", error)
      toast({
        title: "Unable to load commission profiles",
        description: "Something went wrong. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  const handleAddProfile = () => {
    setSelectedProfile(null)
    setIsAddModalOpen(true)
  }

  const handleEditProfile = (profile: CommissionProfile) => {
    setSelectedProfile(profile)
    setIsEditModalOpen(true)
  }

  const handleDeleteProfile = (profile: CommissionProfile) => {
    setSelectedProfile(profile)
    setIsDeleteModalOpen(true)
  }

  const handleSaveProfile = async (profileData: CommissionProfileFormData) => {
    try {
      const response = await CommissionProfileAPI.createProfile(profileData)
      if (response?.success && response.data) {
        const newProfile = normalizeProfile(response.data as CommissionProfile)
        setProfiles(prev => [newProfile, ...prev])
        toast({
          title: "Commission profile created",
          description: `"${newProfile.name}" is now available for assignment.`
        })
        setIsAddModalOpen(false)
      } else {
        throw new Error(response?.error || "Failed to create profile")
      }
    } catch (error) {
      console.error("Error creating commission profile:", error)
      toast({
        title: "Failed to create profile",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive"
      })
      throw error
    }
  }

  const handleSaveEditedProfile = async (profileId: string, profileData: CommissionProfileFormData) => {
    try {
      const response = await CommissionProfileAPI.updateProfile(profileId, profileData)
      if (response?.success && response.data) {
        const updatedProfile = normalizeProfile(response.data as CommissionProfile)
        setProfiles(prev => prev.map(p => p.id === profileId ? updatedProfile : p))
        toast({
          title: "Commission profile updated",
          description: `"${updatedProfile.name}" has been updated.`
        })
        setIsEditModalOpen(false)
        setSelectedProfile(null)
      } else {
        throw new Error(response?.error || "Failed to update profile")
      }
    } catch (error) {
      console.error("Error updating commission profile:", error)
      toast({
        title: "Failed to update profile",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive"
      })
      throw error
    }
  }

  const confirmDelete = async () => {
    if (!selectedProfile) return
    const profileId = selectedProfile.id || selectedProfile._id || ""
    if (!profileId) return

    try {
      setIsDeleteLoading(true)
      const response = await CommissionProfileAPI.deleteProfile(profileId)
      if (response?.success) {
        setProfiles(prev => prev.filter(p => p.id !== profileId))
        toast({
          title: "Commission profile deleted",
          description: `"${selectedProfile.name}" has been removed.`
        })
      } else {
        throw new Error(response?.error || "Failed to delete profile")
      }
    } catch (error) {
      console.error("Error deleting commission profile:", error)
      toast({
        title: "Failed to delete profile",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsDeleteLoading(false)
    setIsDeleteModalOpen(false)
    setSelectedProfile(null)
    }
  }

  const getProfileTypeIcon = (type: string) => {
    switch (type) {
      case "target_based":
        return <Target className="h-4 w-4" />
      case "item_based":
        return <Package className="h-4 w-4" />
      default:
        return <Award className="h-4 w-4" />
    }
  }

  const getProfileTypeBadge = (type: string) => {
    const typeConfig = {
      target_based: { label: "Commission by Target", variant: "default" as const },
      item_based: { label: "Commission by Item", variant: "secondary" as const }
    }
    
    const config = typeConfig[type as keyof typeof typeConfig] || typeConfig.target_based
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {getProfileTypeIcon(type)}
        {config.label}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={handleAddProfile} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Add Commission Profile
        </Button>
      </div>

      {/* Profiles Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 border-b border-slate-200">
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Profile Name</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Profile Type</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Description</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Status</TableHead>
              <TableHead className="font-semibold text-slate-700 py-4 px-6">Created</TableHead>
              <TableHead className="text-right font-semibold text-slate-700 py-4 px-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                  Loading commission profiles...
                </TableCell>
              </TableRow>
            ) : profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                      <Award className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-medium">No commission profiles yet</p>
                    <p className="text-slate-500 text-sm">Create one to start tracking commissions.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((profile) => (
                <TableRow key={profile.id} className="hover:bg-slate-50/50 border-b border-slate-100 transition-colors duration-200">
                  <TableCell className="py-4 px-6 font-medium text-slate-800">{profile.name}</TableCell>
                  <TableCell className="py-4 px-6">
                    {getProfileTypeBadge(profile.type)}
                  </TableCell>
                  <TableCell className="py-4 px-6 text-slate-600">
                    {profile.description || "No description"}
                  </TableCell>
                  <TableCell className="py-4 px-6">
                    <Badge variant={profile.isActive ? "default" : "secondary"}>
                      {profile.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 px-6 text-slate-600">
                    {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right py-4 px-6">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-9 w-9 p-0 hover:bg-slate-100 rounded-lg transition-all duration-200">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleEditProfile(profile)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Profile
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleDeleteProfile(profile)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Profile
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Commission Profile</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedProfile?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleteLoading}>
              {isDeleteLoading ? "Deleting..." : "Delete Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Commission Profile Modal */}
      <AddCommissionProfileModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveProfile}
      />

      {/* Edit Commission Profile Modal */}
      <EditCommissionProfileModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedProfile(null)
        }}
        onSave={handleSaveEditedProfile}
        profile={selectedProfile}
      />
    </div>
  )
}
