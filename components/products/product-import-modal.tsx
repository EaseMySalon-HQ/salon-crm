"use client"

import { useState, useCallback } from "react"
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { FileUpload } from "./file-upload"
import { DataPreview } from "./data-preview"
import { ColumnMapping } from "./column-mapping"
import { ImportResults } from "./import-results"
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

interface ProductImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

export function ProductImportModal({ isOpen, onClose, onImportComplete }: ProductImportModalProps) {
  const [currentStep, setCurrentStep] = useState<'upload' | 'preview' | 'mapping' | 'importing' | 'results'>('upload')
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
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        
        if (jsonData.length < 2) {
          toast({
            title: "Invalid File",
            description: "File must contain at least a header row and one data row",
            variant: "destructive"
          })
          return
        }

        const headers = jsonData[0] as string[]
        const rows = jsonData.slice(1) as any[][]
        
        setImportData({
          headers: headers.map(h => h?.toString() || ''),
          rows,
          totalRows: rows.length
        })
        
        // Auto-map common column names (align with Add Product form)
        const autoMapping: Record<string, string> = {}
        headers.forEach(header => {
          const lowerHeader = header?.toString().toLowerCase() || ''
          if ((lowerHeader.includes('name') && !lowerHeader.includes('category')) || lowerHeader === 'product name') {
            autoMapping[header] = 'name'
          } else if (lowerHeader.includes('category')) {
            autoMapping[header] = 'category'
          } else if (lowerHeader.includes('cost') && lowerHeader.includes('price')) {
            autoMapping[header] = 'cost'
          } else if ((lowerHeader.includes('selling') && lowerHeader.includes('price')) || (lowerHeader === 'price' && !lowerHeader.includes('cost') && !lowerHeader.includes('offer'))) {
            autoMapping[header] = 'price'
          } else if (lowerHeader.includes('offer') && lowerHeader.includes('price')) {
            autoMapping[header] = 'offerPrice'
          } else if (lowerHeader.includes('stock') || lowerHeader.includes('quantity')) {
            if (lowerHeader.includes('minimum') || lowerHeader.includes('min')) {
              autoMapping[header] = 'minimumStock'
            } else {
              autoMapping[header] = 'stock'
            }
          } else if (lowerHeader === 'volume' && !lowerHeader.includes('unit')) {
            autoMapping[header] = 'volume'
          } else if (lowerHeader.includes('volume') && lowerHeader.includes('unit')) {
            autoMapping[header] = 'volumeUnit'
          } else if (lowerHeader.includes('sku') || lowerHeader.includes('barcode') || (lowerHeader.includes('code') && !lowerHeader.includes('hsn') && !lowerHeader.includes('sac'))) {
            autoMapping[header] = 'barcode'
          } else if (lowerHeader.includes('hsn') || lowerHeader.includes('sac')) {
            autoMapping[header] = 'hsnSacCode'
          } else if (lowerHeader.includes('description')) {
            autoMapping[header] = 'description'
          } else if (lowerHeader.includes('tax')) {
            autoMapping[header] = 'taxCategory'
          } else if (lowerHeader.includes('type') && lowerHeader.includes('product')) {
            autoMapping[header] = 'productType'
          }
        })
        
        setColumnMapping(autoMapping)
        setCurrentStep('preview')
        
        toast({
          title: "File Uploaded",
          description: `Successfully parsed ${rows.length} rows from ${file.name}`,
        })
      } catch (error) {
        console.error('Error parsing file:', error)
        toast({
          title: "File Error",
          description: "Failed to parse the uploaded file. Please check the format.",
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
        const product: any = { _rowIndex: index + 2 } // +2 because Excel is 1-indexed and we skip header
        
        // Map each Excel column to its value
        importData.headers.forEach((header, columnIndex) => {
          if (row[columnIndex] !== undefined) {
            product[header] = row[columnIndex]
          }
        })
        
        return product
      })

      // Call the import API
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const csrfCookie = document.cookie.split('; ').find(c => c.startsWith('ems_csrf='))
      const csrfToken = csrfCookie ? csrfCookie.split('=')[1] : ''
      
      const response = await fetch(`${API_URL}/products/import`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({
          products: rawData,
          mapping: columnMapping
        })
      })

      const result = await response.json()
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed. Please log in again.')
        } else if (response.status === 403) {
          throw new Error('Access denied. You do not have permission to import products.')
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
        description: `Successfully imported ${result.data.successful} products. ${result.data.errors} errors, ${result.data.skipped} skipped.`,
      })
      
      // Dispatch event to refresh product stats and list
      window.dispatchEvent(new Event('product-added'))
      
    } catch (error) {
      console.error('Import error:', error)
      toast({
        title: "Import Failed",
        description: "Failed to import products. Please try again.",
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

  // Download template (columns match Add Product form - no Transaction Type, Volume optional, Supplier in separate section)
  const downloadTemplate = () => {
    const templateData = [
      ['Product Name', 'Category', 'Cost Price', 'Selling Price', 'Offer Price', 'Current Stock', 'Minimum Stock Level', 'Volume', 'Volume Unit', 'Tax Category', 'Product Type', 'Description', 'SKU/Barcode', 'HSN/SAC Code'],
      ['Shampoo', 'Hair Care', '150', '250', '200', '50', '10', '500', 'ml', 'standard', 'retail', 'Premium Shampoo', 'SH001', '998313'],
      ['Haircut', 'Services', '', '500', '', '0', '5', '', 'pcs', 'standard', 'service', 'Professional Haircut', '', ''],
      ['Conditioner', 'Hair Care', '180', '300', '', '30', '5', '250', 'ml', 'luxury', 'retail', 'Moisturizing Conditioner', 'CON001', '998313']
    ]
    
    const ws = XLSX.utils.aoa_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, 'product-import-template.xlsx')
  }

  const getStepTitle = () => {
    switch (currentStep) {
      case 'upload': return 'Upload Product Data'
      case 'preview': return 'Preview Data'
      case 'mapping': return 'Map Columns'
      case 'importing': return 'Importing Products'
      case 'results': return 'Import Complete'
      default: return 'Import Products'
    }
  }

  const getStepDescription = () => {
    switch (currentStep) {
      case 'upload': return 'Upload an Excel or CSV file with your product data'
      case 'preview': return 'Review the data that will be imported'
      case 'mapping': return 'Map Excel columns to product fields'
      case 'importing': return 'Processing your product data...'
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

          {/* Step Content */}
          {currentStep === 'upload' && (
            <div className="space-y-4">
              <FileUpload onFileUpload={handleFileUpload} />
              
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-blue-800">Need a template?</span>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  Download Template
                </Button>
              </div>
            </div>
          )}

          {currentStep === 'preview' && importData && (
            <DataPreview 
              data={importData} 
              onNext={() => setCurrentStep('mapping')}
              onBack={() => setCurrentStep('upload')}
            />
          )}

          {currentStep === 'mapping' && importData && (
            <ColumnMapping
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
              <p className="text-lg font-medium">Importing products...</p>
              <p className="text-sm text-gray-600">Please don't close this window</p>
            </div>
          )}

          {currentStep === 'results' && importResult && (
            <ImportResults
              result={importResult}
              onClose={handleClose}
              onImportMore={() => {
                setCurrentStep('upload')
                setImportData(null)
                setColumnMapping({})
                setImportResult(null)
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
