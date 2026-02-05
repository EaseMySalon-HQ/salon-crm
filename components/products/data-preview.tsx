"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ArrowRight, FileSpreadsheet } from "lucide-react"

interface ImportData {
  headers: string[]
  rows: any[][]
  totalRows: number
}

interface DataPreviewProps {
  data: ImportData
  onNext: () => void
  onBack: () => void
}

export function DataPreview({ data, onNext, onBack }: DataPreviewProps) {
  const { headers, rows, totalRows } = data
  const previewRows = rows.slice(0, 5) // Show first 5 rows

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center space-x-2">
              <FileSpreadsheet className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-600">Total Rows</p>
                <p className="text-2xl font-bold text-gray-900">{totalRows}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 bg-green-100 rounded-full flex items-center justify-center">
                <div className="h-2 w-2 bg-green-600 rounded-full"></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Columns</p>
                <p className="text-2xl font-bold text-gray-900">{headers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 bg-blue-100 rounded-full flex items-center justify-center">
                <div className="h-2 w-2 bg-blue-600 rounded-full"></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Preview Rows</p>
                <p className="text-2xl font-bold text-gray-900">{previewRows.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Preview Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Data Preview
          </CardTitle>
          <CardDescription>
            Showing first {previewRows.length} rows of {totalRows} total rows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  {headers.map((header, index) => (
                    <TableHead key={index} className="font-semibold text-gray-700 whitespace-nowrap">
                      {header || `Column ${index + 1}`}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex} className="hover:bg-gray-50">
                    {row.map((cell, cellIndex) => (
                      <TableCell key={cellIndex} className="text-sm whitespace-nowrap">
                        {cell !== undefined && cell !== null ? String(cell) : ''}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {totalRows > 5 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Only showing first 5 rows. All {totalRows} rows will be imported.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column Headers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detected Columns</CardTitle>
          <CardDescription>
            These are the column headers found in your file
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {headers.map((header, index) => (
              <Badge key={index} variant="outline" className="px-3 py-1">
                {header || `Column ${index + 1}`}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4 pb-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Upload
        </Button>
        
        <Button onClick={onNext}>
          Continue to Mapping
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
