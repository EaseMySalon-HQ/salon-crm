"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, ArrowRight, AlertCircle, CheckCircle } from "lucide-react"

interface ColumnMappingProps {
  headers: string[]
  sampleData: any[][]
  mapping: Record<string, string>
  onMappingChange: (mapping: Record<string, string>) => void
  onNext: () => void
  onBack: () => void
  isProcessing: boolean
}

const PRODUCT_FIELDS = [
  { value: 'name', label: 'Product Name', required: true, description: 'Name of the product' },
  { value: 'category', label: 'Category', required: true, description: 'Product category' },
  { value: 'cost', label: 'Cost Price', required: false, description: 'Purchase cost per unit' },
  { value: 'price', label: 'Selling Price', required: true, description: 'Selling price' },
  { value: 'offerPrice', label: 'Offer Price', required: false, description: 'Offer/discounted price (optional)' },
  { value: 'stock', label: 'Current Stock', required: true, description: 'Available quantity' },
  { value: 'minimumStock', label: 'Minimum Stock Level', required: false, description: 'Minimum stock for alerts (default 5)' },
  { value: 'volume', label: 'Volume', required: false, description: 'Volume value (number)' },
  { value: 'volumeUnit', label: 'Volume Unit', required: false, description: 'mg, g, kg, ml, l, oz, pcs, pkt' },
  { value: 'taxCategory', label: 'Tax Category', required: false, description: 'essential, intermediate, standard, luxury, exempt' },
  { value: 'productType', label: 'Product Type', required: false, description: 'retail, service, or both' },
  { value: 'description', label: 'Description', required: false, description: 'Product description' },
  { value: 'barcode', label: 'SKU/Barcode', required: false, description: 'SKU or barcode number' },
  { value: 'hsnSacCode', label: 'HSN/SAC Code', required: false, description: 'Tax code for invoicing' }
]

export function ColumnMapping({ 
  headers, 
  sampleData, 
  mapping, 
  onMappingChange, 
  onNext, 
  onBack, 
  isProcessing 
}: ColumnMappingProps) {
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // Validate mapping
  useEffect(() => {
    const errors: string[] = []
    const requiredFields = PRODUCT_FIELDS.filter(field => field.required)
    
    requiredFields.forEach(field => {
      if (!Object.values(mapping).includes(field.value)) {
        errors.push(`${field.label} is required but not mapped`)
      }
    })
    
    // Check for duplicate mappings
    const mappedValues = Object.values(mapping).filter(value => value !== '')
    const uniqueValues = new Set(mappedValues)
    if (mappedValues.length !== uniqueValues.size) {
      errors.push('Each product field can only be mapped once')
    }
    
    setValidationErrors(errors)
  }, [mapping])

  const handleMappingChange = (excelColumn: string, productField: string) => {
    const newMapping = { ...mapping }
    if (productField === 'none' || productField === '') {
      delete newMapping[excelColumn]
    } else {
      newMapping[excelColumn] = productField
    }
    onMappingChange(newMapping)
  }

  const getFieldDescription = (fieldValue: string) => {
    const field = PRODUCT_FIELDS.find(f => f.value === fieldValue)
    return field?.description || ''
  }

  const isFieldRequired = (fieldValue: string) => {
    const field = PRODUCT_FIELDS.find(f => f.value === fieldValue)
    return field?.required || false
  }

  const getMappedField = (excelColumn: string) => {
    const mappedValue = mapping[excelColumn] || ''
    return mappedValue === 'none' ? '' : mappedValue
  }

  const canProceed = validationErrors.length === 0 && Object.keys(mapping).length > 0

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Map Excel Columns to Product Fields</CardTitle>
          <CardDescription>
            Match each column from your Excel file to the corresponding product field. 
            Required fields are marked with a red asterisk (*).
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              {validationErrors.map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Mapping Table */}
      <Card>
        <CardHeader>
          <CardTitle>Column Mapping</CardTitle>
          <CardDescription>
            Select the product field for each Excel column
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {headers.map((header, index) => (
              <div key={index} className="flex items-center space-x-4 p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{header || `Column ${index + 1}`}</span>
                    {sampleData[0] && sampleData[0][index] && (
                      <Badge variant="outline" className="text-xs">
                        Sample: {String(sampleData[0][index]).substring(0, 20)}
                        {String(sampleData[0][index]).length > 20 ? '...' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="flex-1">
                  <Select
                    value={getMappedField(header)}
                    onValueChange={(value) => handleMappingChange(header, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Don't import this column</SelectItem>
                      {PRODUCT_FIELDS.map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                          <div className="flex items-center gap-2">
                            <span>{field.label}</span>
                            {field.required && <span className="text-red-500">*</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {getMappedField(header) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {getFieldDescription(getMappedField(header))}
                    </p>
                  )}
                </div>
                
                <div className="w-8">
                  {getMappedField(header) && (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Mapping Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Mapping Summary</CardTitle>
          <CardDescription>
            Review your column mappings before importing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PRODUCT_FIELDS.map((field) => {
              const mappedColumn = Object.keys(mapping).find(key => mapping[key] === field.value)
              return (
                <div key={field.value} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{field.label}</span>
                    {field.required && <span className="text-red-500">*</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {mappedColumn ? (
                      <>
                        <Badge variant="secondary">{mappedColumn}</Badge>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </>
                    ) : (
                      <Badge variant={field.required ? "destructive" : "outline"}>
                        {field.required ? "Required" : "Not mapped"}
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4 pb-2">
        <Button variant="outline" onClick={onBack} disabled={isProcessing}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Preview
        </Button>
        
        <Button 
          onClick={onNext} 
          disabled={!canProceed || isProcessing}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isProcessing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Processing...
            </>
          ) : (
            <>
              Import Products
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
