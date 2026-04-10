"use client"

import { useState, useCallback } from "react"
import * as XLSX from "xlsx"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileSpreadsheet, Download } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { ClientFileUpload } from "./client-file-upload"
import { ClientDataPreview } from "./client-data-preview"
import { ClientColumnMapping } from "./client-column-mapping"
import { ClientImportResults } from "./client-import-results"

type ImportStep = 'upload' | 'preview' | 'mapping' | 'importing' | 'results'

interface ImportData { headers: string[]; rows: any[][]; totalRows: number }

interface ImportResult {
  success: boolean
  imported: number
  created?: number
  updated?: number
  errors: number
  skipped: number
  errorDetails: { row: number; field: string; message: string }[]
  skippedDetails: { row: number; name: string; phone: string; reason: string }[]
}

export function ClientImportModal({ isOpen, onClose, onImportComplete }: { isOpen: boolean; onClose: () => void; onImportComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload')
  const [importData, setImportData] = useState<ImportData | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [updateExisting, setUpdateExisting] = useState(false)  // Default to false to skip duplicates
  const { toast } = useToast()

  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][]
        if (jsonData.length < 2) {
          toast({ title: 'Invalid File', description: 'File must contain headers and at least one row of data', variant: 'destructive' })
          return
        }
        const headers = jsonData[0].map((h: any) => String(h || ''))
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined))
        const auto: Record<string, string> = {}
        headers.forEach(h => {
          const l = h.toLowerCase()
          if (l.includes('name')) auto[h] = 'name'
          else if (l.includes('phone') || l.includes('mobile') || l.includes('contact')) auto[h] = 'phone'
          else if (l.includes('email')) auto[h] = 'email'
          else if (l.includes('gender')) auto[h] = 'gender'
          else if (l.includes('dob') || l.includes('date of birth')) auto[h] = 'dob'
          else if (l.includes('visit')) {
            if (l.includes('last')) auto[h] = 'lastVisit'
            else auto[h] = 'visits'
          }
          else if (l.includes('total') && (l.includes('revenue') || l.includes('spent') || l.includes('amount'))) auto[h] = 'totalSpent'
        })
        setImportData({ headers, rows, totalRows: rows.length })
        setColumnMapping(auto)
        setCurrentStep('preview')
      } catch (err) {
        toast({ title: 'Error', description: 'Failed to parse file. Ensure it is a valid Excel/CSV.', variant: 'destructive' })
      }
    }
    reader.readAsArrayBuffer(file)
  }, [toast])

  const handleImport = async () => {
    if (!importData) return
    setIsProcessing(true)
    setCurrentStep('importing')
    try {
      const rawData = importData.rows.map((row, idx) => {
        const item: any = { _rowIndex: idx + 2 }
        importData.headers.forEach((h, ci) => { item[h] = row[ci] })
        return item
      })
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const csrfCookie = document.cookie.split('; ').find(c => c.startsWith('ems_csrf='))
      const csrfToken = csrfCookie ? csrfCookie.split('=')[1] : ''
      const resp = await fetch(`${API_URL}/clients/import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify({ clients: rawData, mapping: columnMapping, updateExisting })
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || 'Import failed')

      const mapped: ImportResult = {
        success: true,
        imported: result.data.successful,
        created: result.data.created,
        updated: result.data.updated,
        errors: result.data.errors,
        skipped: result.data.skipped,
        errorDetails: result.data.results.errors.map((e: any) => ({ row: e.row, field: '', message: e.error })),
        skippedDetails: result.data.results.skipped.map((s: any) => ({ row: s.row, name: s.data?.name || 'Unknown', phone: s.data?.phone || 'Unknown', reason: s.reason || 'Already exists' }))
      }
      setImportResult(mapped)
      setCurrentStep('results')
      window.dispatchEvent(new Event('client-added'))
      const createdText = mapped.created !== undefined ? `${mapped.created} created` : ''
      const updatedText = mapped.updated !== undefined ? `${mapped.updated} updated` : ''
      const breakdown = [createdText, updatedText].filter(Boolean).join(', ')
      toast({ 
        title: 'Import Completed', 
        description: `Processed ${mapped.imported} rows${breakdown ? ` (${breakdown})` : ''}. ${mapped.errors} errors, ${mapped.skipped} skipped.` 
      })
    } catch (err: any) {
      toast({ title: 'Import Failed', description: err.message || 'Unknown error', variant: 'destructive' })
      setCurrentStep('mapping')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    setCurrentStep('upload')
    setImportData(null)
    setColumnMapping({})
    setImportResult(null)
    setIsProcessing(false)
    onClose()
  }

  const downloadTemplate = () => {
    const rows = [
      ['Name', 'Mobile', 'Gender', 'Email', 'Date of Birth', 'Visits', 'Last Visit', 'Total Revenue'],
      ['John Doe', '9876543210', 'male', 'john@example.com', '1990-05-10', '5', '2025-10-01', '15000'],
      ['Jane Smith', '9123456780', 'female', 'jane@example.com', '1992-03-15', '3', '2025-09-15', '8500']
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clients Template')
    XLSX.writeFile(wb, 'clients-import-template.xlsx')
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[90vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Import Clients
          </DialogTitle>
          <DialogDescription>Upload an Excel/CSV file to import clients</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pb-6">
          {currentStep === 'upload' && (
            <div className="space-y-4">
              <ClientFileUpload onFileSelect={handleFileUpload} />
              <div className="flex items-center justify-between pt-4">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
              </div>
            </div>
          )}

          {currentStep === 'preview' && importData && (
            <ClientDataPreview data={importData} onNext={() => setCurrentStep('mapping')} onBack={() => setCurrentStep('upload')} />
          )}

          {currentStep === 'mapping' && importData && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={updateExisting}
                      onChange={(e) => setUpdateExisting(e.target.checked)}
                      disabled={isProcessing}
                    />
                    <span>Update existing clients if phone number matches (default: skip duplicates)</span>
                  </label>
                </div>
              </div>
              <ClientColumnMapping headers={importData.headers} sampleData={importData.rows.slice(0,3)} mapping={columnMapping} onMappingChange={setColumnMapping} onNext={handleImport} onBack={() => setCurrentStep('preview')} isProcessing={isProcessing} />
            </>
          )}

          {currentStep === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="text-lg font-medium">Importing clients...</p>
              <p className="text-sm text-gray-600">Please don't close this window</p>
            </div>
          )}

          {currentStep === 'results' && importResult && (
            <ClientImportResults result={importResult} onClose={() => { handleClose(); onImportComplete() }} onImportMore={() => setCurrentStep('upload')} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


