"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Printer, Download, Mail, Edit, Save, X, Thermometer } from "lucide-react"
import type { Receipt } from "@/lib/data"
import { ReceiptPreview } from "./receipt-preview"
import { ReceiptGenerator } from "./receipt-generator"
import { ThermalReceiptGenerator } from "./thermal-receipt-generator"
import { useToast } from "@/hooks/use-toast"
import { SettingsAPI } from "@/lib/api"
import { useCurrency } from "@/hooks/use-currency"

interface ReceiptDialogProps {
  receipt: Receipt | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onReceiptUpdate?: (receipt: Receipt) => void
}

export function ReceiptDialog({ receipt, open, onOpenChange, onReceiptUpdate }: ReceiptDialogProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedReceipt, setEditedReceipt] = useState<Receipt | null>(null)
  const [businessSettings, setBusinessSettings] = useState<any>(null)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)
  const { toast } = useToast()
  const { formatAmount } = useCurrency()

  // Debug logging
  useEffect(() => {
    console.log('🎯 ReceiptDialog Debug:')
    console.log('Open:', open)
    console.log('Receipt:', receipt)
    console.log('Receipt ID:', receipt?.id)
    console.log('Receipt Number:', receipt?.receiptNumber)
    console.log('Receipt Items:', receipt?.items)
  }, [open, receipt])

  // Load business settings when dialog opens
  useEffect(() => {
    if (open && !businessSettings) {
      const loadBusinessSettings = async () => {
        try {
          console.log('Loading business settings for receipt...')
          const response = await SettingsAPI.getBusinessSettings()
          console.log('Business settings response:', response)
          if (response.success) {
            setBusinessSettings(response.data)
            console.log('Business settings loaded:', response.data)
          }
        } catch (error) {
          console.error('Error loading business settings:', error)
        } finally {
          setIsLoadingSettings(false)
        }
      }

      loadBusinessSettings()
    }
  }, [open, businessSettings])

  if (!receipt) {
    console.log('❌ ReceiptDialog: No receipt provided, returning null')
    return null
  }

  console.log('✅ ReceiptDialog: Receipt received, rendering dialog')

  // Only generate receipt functions when business settings are loaded
  const { printReceipt, downloadReceipt } = ReceiptGenerator({ 
    receipt: editedReceipt || receipt,
    businessSettings 
  })

  const { printThermalReceipt } = ThermalReceiptGenerator({ 
    receipt: editedReceipt || receipt,
    businessSettings 
  })

  const handleEdit = () => {
    setEditedReceipt({ ...receipt })
    setIsEditing(true)
  }

  const handleSave = () => {
    if (editedReceipt && onReceiptUpdate) {
      onReceiptUpdate(editedReceipt)
      setIsEditing(false)
      setEditedReceipt(null)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedReceipt(null)
  }

  const handleEmailReceipt = () => {
    // In a real app, this would send an email
    toast({
      title: "Email Sent",
      description: "Receipt has been emailed to the customer",
    })
  }

  const currentReceipt = editedReceipt || receipt

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Receipt {receipt.receiptNumber}</span>
            <div className="flex gap-2">
              {!isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={handleEdit}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={printReceipt}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                  <Button variant="outline" size="sm" onClick={printThermalReceipt} className="bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100">
                    <Thermometer className="h-4 w-4 mr-2" />
                    Thermal
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadReceipt}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleEmailReceipt}>
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={handleSave}>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCancel}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="preview" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="edit" disabled={!isEditing}>
              Edit Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="mt-6">
            <div className="flex justify-center">
              {isLoadingSettings ? (
                <div className="text-center py-8">
                  <div className="text-lg font-medium">Loading receipt...</div>
                  <div className="text-sm text-muted-foreground">Fetching business settings</div>
                </div>
              ) : (
                <ReceiptPreview receipt={currentReceipt} businessSettings={businessSettings} />
              )}
            </div>
          </TabsContent>

          <TabsContent value="edit" className="mt-6">
            {isEditing && editedReceipt && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="clientName">Client Name</Label>
                    <Input
                      id="clientName"
                      value={editedReceipt.clientName}
                      onChange={(e) => setEditedReceipt({ ...editedReceipt, clientName: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="clientPhone">Client Phone</Label>
                    <Input
                      id="clientPhone"
                      value={editedReceipt.clientPhone}
                      onChange={(e) => setEditedReceipt({ ...editedReceipt, clientPhone: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="staffName">Staff Name</Label>
                    <Input
                      id="staffName"
                      value={editedReceipt.staffName}
                      onChange={(e) => setEditedReceipt({ ...editedReceipt, staffName: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="tip">Tip Amount</Label>
                    <Input
                      id="tip"
                      type="number"
                      step="0.01"
                      value={editedReceipt.tip}
                      onChange={(e) => setEditedReceipt({ ...editedReceipt, tip: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="discount">Discount Amount</Label>
                    <Input
                      id="discount"
                      type="number"
                      step="0.01"
                      value={editedReceipt.discount}
                      onChange={(e) => setEditedReceipt({ ...editedReceipt, discount: Number(e.target.value) })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={editedReceipt.notes || ""}
                      onChange={(e) => setEditedReceipt({ ...editedReceipt, notes: e.target.value })}
                      placeholder="Add any notes..."
                    />
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-semibold mb-2">Totals</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>{formatAmount(editedReceipt.subtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Discount:</span>
                        <span>-{formatAmount(editedReceipt.discount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tax:</span>
                        <span>{formatAmount(editedReceipt.tax)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{editedReceipt.tipStaffName ? `Tip (${editedReceipt.tipStaffName}):` : 'Tip:'}</span>
                        <span>{formatAmount(editedReceipt.tip)}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>Total:</span>
                        <span>
                          $
                          {(
                            editedReceipt.subtotal -
                            editedReceipt.discount +
                            editedReceipt.tax +
                            editedReceipt.tip
                          ).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
