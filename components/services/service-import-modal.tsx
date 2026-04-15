"use client"

import { useState, useCallback } from "react"
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { ServiceFileUpload } from "./service-file-upload"
import { ServiceDataPreview } from "./service-data-preview"
import { ServiceColumnMapping } from "./service-column-mapping"
import { ServiceImportResults } from "./service-import-results"
import * as XLSX from "xlsx"

interface ImportData {
  headers: string[]
  rows: any[][]
  totalRows: number
}

interface ImportResult {
  success: boolean
  imported: number
  errors: number
  skipped: number
  errorDetails: Array<{
    row: number
    field: string
    message: string
  }>
  skippedDetails: Array<{
    row: number
    name: string
    category: string
    reason: string
  }>
}

interface ServiceImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

type ImportStep = 'upload' | 'preview' | 'mapping' | 'importing' | 'results'

export function ServiceImportModal({ isOpen, onClose, onImportComplete }: ServiceImportModalProps) {
  
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload')
  const [importData, setImportData] = useState<ImportData | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const { toast } = useToast()

  // Step 1: Handle file upload
  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][]
        
        if (jsonData.length < 2) {
          toast({
            title: "Invalid File",
            description: "File must contain headers and at least one row of data",
            variant: "destructive"
          })
          return
        }
        
        const headers = jsonData[0].map((h: any) => String(h || ''))
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined))
        
        // Auto-detect column mapping (matches Add New Service form)
        const autoMapping: Record<string, string> = {}
        headers.forEach(header => {
          const lowerHeader = header?.toString().toLowerCase() || ''
          
          if (lowerHeader.includes('name') && !lowerHeader.includes('plan')) {
            autoMapping[header] = 'name'
          } else if (lowerHeader.includes('category')) {
            autoMapping[header] = 'category'
          } else if (lowerHeader.includes('duration') || lowerHeader.includes('time')) {
            autoMapping[header] = 'duration'
          } else if (lowerHeader.includes('full') && lowerHeader.includes('price')) {
            autoMapping[header] = 'fullPrice'
          } else if (lowerHeader.includes('offer') && lowerHeader.includes('price')) {
            autoMapping[header] = 'offerPrice'
          } else if ((lowerHeader === 'price' || lowerHeader.includes('cost') || lowerHeader.includes('amount')) && !lowerHeader.includes('offer') && !lowerHeader.includes('full')) {
            autoMapping[header] = 'fullPrice'
          } else if (lowerHeader.includes('description') || lowerHeader.includes('desc')) {
            autoMapping[header] = 'description'
          } else if (lowerHeader.includes('tax') && lowerHeader.includes('applicable')) {
            autoMapping[header] = 'taxApplicable'
          } else if (lowerHeader.includes('hsn') || lowerHeader.includes('sac')) {
            autoMapping[header] = 'hsnSacCode'
          } else if (lowerHeader.includes('auto') && lowerHeader.includes('consumption')) {
            autoMapping[header] = 'isAutoConsumptionEnabled'
          }
        })
        
        setImportData({
          headers,
          rows,
          totalRows: rows.length
        })
        
        setColumnMapping(autoMapping)
        setCurrentStep('preview')
        
      } catch (error) {
        console.error('File parsing error:', error)
        toast({
          title: "Error",
          description: "Failed to parse file. Please ensure it's a valid Excel file.",
          variant: "destructive"
        })
      }
    }
    reader.readAsArrayBuffer(file)
  }, [toast])

  // Step 2: Handle column mapping
  const handleMappingComplete = (mapping: Record<string, string>) => {
    setColumnMapping(mapping)
    setCurrentStep('mapping')
  }

  // Step 3: Process import
  const handleImport = async () => {
    if (!importData || !columnMapping) return
    
    setIsProcessing(true)
    setCurrentStep('importing')
    
    try {
      // Prepare raw Excel data for import (backend will handle mapping)
      const rawData = importData.rows.map((row, index) => {
        const service: any = { _rowIndex: index + 2 } // +2 because Excel is 1-indexed and we skip header
        
        // Map each Excel column to its value
        importData.headers.forEach((header, columnIndex) => {
          if (row[columnIndex] !== undefined) {
            service[header] = row[columnIndex]
          }
        })
        
        return service
      })

      // Call the import API
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const csrfCookie = document.cookie.split('; ').find(c => c.startsWith('ems_csrf='))
      const csrfToken = csrfCookie ? csrfCookie.split('=')[1] : ''
      
      const response = await fetch(`${API_URL}/services/import`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({
          services: rawData,
          mapping: columnMapping
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. You do not have permission to import services.')
        } else {
          throw new Error(result.error || 'Import failed')
        }
      }
      
      // Process the results
      const importResult: ImportResult = {
        success: true,
        imported: result.data.successful,
        errors: result.data.errors,
        skipped: result.data.skipped,
        errorDetails: result.data.results.errors.map((error: any) => ({
          row: error.row,
          field: '',
          message: error.error
        })),
        skippedDetails: result.data.results.skipped.map((skipped: any) => ({
          row: skipped.row,
          name: skipped.data?.name || 'Unknown',
          category: skipped.data?.category || 'Unknown',
          reason: skipped.reason || 'Already exists'
        }))
      }
      
      setImportResult(importResult)
      setCurrentStep('results')
      
      toast({
        title: "Import Completed",
        description: `Successfully imported ${result.data.successful} services. ${result.data.errors} errors, ${result.data.skipped} skipped.`,
      })
      
      // Dispatch event to refresh service stats and list
      window.dispatchEvent(new Event('service-added'))
      
    } catch (error) {
      console.error('Import error:', error)
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to import services. Please try again.",
        variant: "destructive"
      })
      setCurrentStep('mapping')
    } finally {
      setIsProcessing(false)
    }
  }

  // Reset modal state
  const handleClose = () => {
    setCurrentStep('upload')
    setImportData(null)
    setColumnMapping({})
    setImportResult(null)
    setIsProcessing(false)
    onClose()
  }

  // Download template (columns match Add New Service form)
  const downloadTemplate = () => {
    const templateData = [
      ['Name', 'Category', 'Duration', 'Full Price', 'Offer Price', 'Description', 'Tax Applicable', 'HSN/SAC Code'],
      ['Haircut', 'Hair Services', '30', '500', '', 'Professional haircut with styling', 'yes', '998313'],
      ['Hair Coloring', 'Hair Services', '90', '1500', '1200', 'Full hair coloring service', 'yes', '998313'],
      ['Facial', 'Skin Care', '45', '800', '', 'Deep cleansing facial treatment', 'yes', '']
    ]
    
    const ws = XLSX.utils.aoa_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Services Template")
    XLSX.writeFile(wb, "services-import-template.xlsx")
    
    toast({
      title: "Template Downloaded",
      description: "Check your downloads folder for the template file",
    })
  }

  const getStepTitle = () => {
    switch (currentStep) {
      case 'upload': return 'Upload File'
      case 'preview': return 'Preview Data'
      case 'mapping': return 'Map Columns'
      case 'importing': return 'Importing Services'
      case 'results': return 'Import Complete'
      default: return ''
    }
  }

  const getStepDescription = () => {
    switch (currentStep) {
      case 'upload': return 'Upload an Excel or CSV file containing service data'
      case 'preview': return 'Review the data that will be imported'
      case 'mapping': return 'Map Excel columns to service fields'
      case 'importing': return 'Import process in progress'
      case 'results': return 'Import process completed'
      default: return ''
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
    >
      <DialogContent className="max-w-[90vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {getStepTitle()}
          </DialogTitle>
          <DialogDescription>
            {getStepDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pb-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            {['upload', 'preview', 'mapping', 'importing', 'results'].map((step, index) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep === step 
                    ? 'bg-blue-600 text-white' 
                    : ['upload', 'preview', 'mapping'].indexOf(currentStep) > index
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {index + 1}
                </div>
                {index < 4 && (
                  <div className={`w-12 h-1 mx-2 ${
                    ['upload', 'preview', 'mapping'].indexOf(currentStep) > index
                      ? 'bg-green-600'
                      : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Upload Step */}
          {currentStep === 'upload' && (
            <div className="space-y-4">
              <ServiceFileUpload onFileSelect={handleFileUpload} />
              
              <div className="flex items-center justify-between pt-4">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {currentStep === 'preview' && importData && (
            <ServiceDataPreview 
              data={importData} 
              onNext={() => setCurrentStep('mapping')}
              onBack={() => setCurrentStep('upload')}
            />
          )}

          {currentStep === 'mapping' && importData && (
            <ServiceColumnMapping
              headers={importData.headers}
              sampleData={importData.rows.slice(0, 3)}
              mapping={columnMapping}
              onMappingChange={setColumnMapping}
              onNext={handleImport}
              onBack={() => setCurrentStep('preview')}
              isProcessing={isProcessing}
            />
          )}

          {currentStep === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="text-lg font-medium">Importing services...</p>
              <p className="text-sm text-gray-600">Please don't close this window</p>
            </div>
          )}

          {currentStep === 'results' && importResult && (
            <ServiceImportResults
              result={importResult}
              onClose={() => {
                handleClose()
                onImportComplete()
              }}
              onImportMore={() => setCurrentStep('upload')}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

