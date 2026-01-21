"use client"

import { useState, useEffect } from "react"
import { Plus, CheckCircle2, Clock, XCircle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { MarketingTemplatesAPI } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TemplateCreationDialog } from "./template-creation-dialog"

export function MarketingTemplateManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  useEffect(() => {
    if (open) {
      loadTemplates()
    }
  }, [open])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const response = await MarketingTemplatesAPI.getAll()
      if (response.success && response.data) {
        const templatesList = Array.isArray(response.data) ? response.data : (response.data?.data || [])
        setTemplates(templatesList)
      }
    } catch (error: any) {
      console.error('Error loading templates:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to load templates",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (template: any) => {
    if (!confirm(`Are you sure you want to delete template "${template.templateName}"?`)) {
      return
    }

    try {
      const response = await MarketingTemplatesAPI.delete(template._id)
      if (response.success) {
        toast({
          title: "Success",
          description: "Template deleted successfully",
        })
        loadTemplates()
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>
      case 'pending':
        return <Badge className="bg-yellow-500"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
      case 'rejected':
        return <Badge className="bg-red-500"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>
      case 'active':
        return <Badge className="bg-blue-500"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Marketing Templates</DialogTitle>
            <DialogDescription>
              Create and manage your WhatsApp marketing templates
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No templates yet. Create your first template to start sending campaigns!
              </div>
            ) : (
              <div className="space-y-4">
                {templates.map((template) => (
                  <Card key={template._id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{template.templateName}</CardTitle>
                          {template.description && (
                            <CardDescription className="mt-1">{template.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex gap-2 items-center">
                          {getStatusBadge(template.status)}
                          {template.tags?.map((tag: string) => (
                            <Badge key={tag} variant="outline">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">
                          <p>Language: {template.language}</p>
                          <p>Category: {template.category}</p>
                          {template.msg91TemplateId && (
                            <p>MSG91 ID: {template.msg91TemplateId}</p>
                          )}
                          {template.status === 'pending' && (
                            <p className="text-yellow-600 mt-2">
                              Submitted on {new Date(template.submittedAt).toLocaleDateString()}. 
                              Approval typically takes 10-30 minutes.
                            </p>
                          )}
                          {template.campaignCount > 0 && (
                            <p className="text-sm mt-2">
                              Used in {template.campaignCount} campaign(s)
                            </p>
                          )}
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                          {template.status === 'rejected' || template.status === 'pending' ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(template)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {isCreateDialogOpen && (
        <TemplateCreationDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          onSuccess={() => {
            setIsCreateDialogOpen(false)
            loadTemplates()
          }}
        />
      )}
    </>
  )
}

