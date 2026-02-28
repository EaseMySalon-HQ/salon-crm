"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ServiceColumnMappingProps {
  headers: string[]
  sampleData: any[][]
  mapping: Record<string, string>
  onMappingChange: (mapping: Record<string, string>) => void
  onNext: () => void
  onBack: () => void
  isProcessing: boolean
}

const SERVICE_FIELDS = [
  { value: 'name', label: 'Name', required: true, description: 'Service name' },
  { value: 'category', label: 'Category', required: true, description: 'Service category' },
  { value: 'duration', label: 'Duration', required: true, description: 'Duration in minutes' },
  { value: 'fullPrice', label: 'Full Price', required: true, description: 'Regular price' },
  { value: 'offerPrice', label: 'Offer Price', required: false, description: 'Discounted price (optional)' },
  { value: 'description', label: 'Description', required: false, description: 'Service description' },
  { value: 'taxApplicable', label: 'Tax Applicable', required: false, description: 'yes/no' },
  { value: 'hsnSacCode', label: 'HSN/SAC Code', required: false, description: 'Tax code e.g. 998313' },
  { value: 'isAutoConsumptionEnabled', label: 'Auto Consumption', required: false, description: 'yes/no - deduct inventory' }
]

export function ServiceColumnMapping({ 
  headers, 
  sampleData, 
  mapping, 
  onMappingChange, 
  onNext, 
  onBack,
  isProcessing 
}: ServiceColumnMappingProps) {
  
  const handleMappingChange = (excelColumn: string, serviceField: string) => {
    const newMapping = { ...mapping }
    if (serviceField === 'none' || serviceField === '') {
      delete newMapping[excelColumn]
    } else {
      newMapping[excelColumn] = serviceField
    }
    onMappingChange(newMapping)
  }

  const getMappedField = (excelColumn: string) => {
    const mappedValue = mapping[excelColumn] || ''
    return mappedValue === 'none' ? '' : mappedValue
  }

  const isFieldMapped = (fieldValue: string) => {
    return Object.values(mapping).includes(fieldValue)
  }

  const getUnmappedRequiredFields = () => {
    return SERVICE_FIELDS.filter(field => 
      field.required && !Object.values(mapping).includes(field.value)
    )
  }

  const canProceed = getUnmappedRequiredFields().length === 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Map Excel Columns to Service Fields</CardTitle>
          <CardDescription>
            Match your Excel columns with the corresponding service fields
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Mapping Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Excel Column</TableHead>
                    <TableHead className="whitespace-nowrap">Sample Data</TableHead>
                    <TableHead className="whitespace-nowrap">Maps To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((header, index) => (
                    <TableRow key={index}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {header}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-gray-600">
                        {sampleData[0]?.[index] || '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Select
                          value={getMappedField(header)}
                          onValueChange={(value) => handleMappingChange(header, value)}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select field..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Don't import this column</SelectItem>
                            {SERVICE_FIELDS.map((field) => (
                              <SelectItem 
                                key={field.value} 
                                value={field.value}
                                disabled={isFieldMapped(field.value) && getMappedField(header) !== field.value}
                              >
                                <div className="flex items-center gap-2">
                                  <span>{field.label}</span>
                                  {field.required && (
                                    <Badge variant="destructive" className="text-xs">Required</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Required Fields Status */}
            {!canProceed && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please map the following required fields: {' '}
                  {getUnmappedRequiredFields().map(field => field.label).join(', ')}
                </AlertDescription>
              </Alert>
            )}

            {/* Field Descriptions */}
            <div className="mt-4 p-4 bg-gray-50 rounded-md">
              <p className="text-sm font-medium text-gray-700 mb-2">Field Descriptions:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                {SERVICE_FIELDS.map(field => (
                  <li key={field.value}>
                    <span className="font-medium">{field.label}:</span> {field.description}
                    {field.required && <span className="text-red-600 ml-1">*</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between pt-4 pb-2">
        <Button variant="outline" onClick={onBack} disabled={isProcessing}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button onClick={onNext} disabled={!canProceed || isProcessing}>
          {isProcessing ? 'Processing...' : 'Start Import'}
          {!isProcessing && <ChevronRight className="h-4 w-4 ml-2" />}
        </Button>
      </div>
    </div>
  )
}
