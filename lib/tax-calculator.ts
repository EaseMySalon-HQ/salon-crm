/**
 * GST Tax Calculator for EaseMySalon
 * Handles CGST + SGST calculation for local salon business
 */

export interface TaxSettings {
  enableTax: boolean
  taxType: 'single' | 'gst' | 'vat' | 'sales'
  serviceTaxRate: number
  essentialProductRate: number
  intermediateProductRate: number
  standardProductRate: number
  luxuryProductRate: number
  exemptProductRate: number
  cgstRate: number
  sgstRate: number
}

export interface TaxCalculationResult {
  baseAmount: number
  taxAmount: number
  totalAmount: number
  cgst: number
  sgst: number
  igst: number
  taxRate: number
  taxCategory: string
}

export interface BillItem {
  id: string
  name: string
  type: 'service' | 'product'
  price: number
  quantity: number
  taxCategory?: string
}

export class TaxCalculator {
  private settings: TaxSettings

  constructor(settings: TaxSettings) {
    this.settings = settings
  }

  /**
   * Calculate tax for a single item
   */
  calculateItemTax(item: BillItem): TaxCalculationResult {
    if (!this.settings.enableTax) {
      return {
        baseAmount: item.price * item.quantity,
        taxAmount: 0,
        totalAmount: item.price * item.quantity,
        cgst: 0,
        sgst: 0,
        igst: 0,
        taxRate: 0,
        taxCategory: 'no-tax'
      }
    }

    const baseAmount = item.price * item.quantity
    let taxRate = 0
    let taxCategory = ''

    if (item.type === 'service') {
      taxRate = this.settings.serviceTaxRate
      taxCategory = 'service'
    } else {
      // Product tax based on category
      switch (item.taxCategory) {
        case 'essential':
          taxRate = this.settings.essentialProductRate
          taxCategory = 'essential'
          break
        case 'intermediate':
          taxRate = this.settings.intermediateProductRate
          taxCategory = 'intermediate'
          break
        case 'standard':
          taxRate = this.settings.standardProductRate
          taxCategory = 'standard'
          break
        case 'luxury':
          taxRate = this.settings.luxuryProductRate
          taxCategory = 'luxury'
          break
        case 'exempt':
          taxRate = this.settings.exemptProductRate
          taxCategory = 'exempt'
          break
        default:
          taxRate = this.settings.standardProductRate
          taxCategory = 'standard'
      }
    }

    const taxAmount = (baseAmount * taxRate) / 100
    const totalAmount = baseAmount + taxAmount

    // For local salon business, always use CGST + SGST (no IGST)
    const cgst = taxAmount / 2
    const sgst = taxAmount / 2
    const igst = 0

    return {
      baseAmount,
      taxAmount,
      totalAmount,
      cgst,
      sgst,
      igst,
      taxRate,
      taxCategory
    }
  }

  /**
   * Calculate tax for multiple items (bill)
   */
  calculateBillTax(items: BillItem[]): {
    items: Array<BillItem & TaxCalculationResult>
    summary: {
      totalBaseAmount: number
      totalTaxAmount: number
      totalAmount: number
      totalCGST: number
      totalSGST: number
      totalIGST: number
      itemCount: number
    }
  } {
    const calculatedItems = items.map(item => ({
      ...item,
      ...this.calculateItemTax(item)
    }))

    const summary = calculatedItems.reduce(
      (acc, item) => ({
        totalBaseAmount: acc.totalBaseAmount + item.baseAmount,
        totalTaxAmount: acc.totalTaxAmount + item.taxAmount,
        totalAmount: acc.totalAmount + item.totalAmount,
        totalCGST: acc.totalCGST + item.cgst,
        totalSGST: acc.totalSGST + item.sgst,
        totalIGST: acc.totalIGST + item.igst,
        itemCount: acc.itemCount + 1
      }),
      {
        totalBaseAmount: 0,
        totalTaxAmount: 0,
        totalAmount: 0,
        totalCGST: 0,
        totalSGST: 0,
        totalIGST: 0,
        itemCount: 0
      }
    )

    return {
      items: calculatedItems,
      summary
    }
  }

  /**
   * Get tax rate for a specific category
   */
  getTaxRate(category: string, type: 'service' | 'product'): number {
    if (!this.settings.enableTax) return 0

    if (type === 'service') {
      return this.settings.serviceTaxRate
    }

    switch (category) {
      case 'essential':
        return this.settings.essentialProductRate
      case 'intermediate':
        return this.settings.intermediateProductRate
      case 'standard':
        return this.settings.standardProductRate
      case 'luxury':
        return this.settings.luxuryProductRate
      case 'exempt':
        return this.settings.exemptProductRate
      default:
        return this.settings.standardProductRate
    }
  }

  /**
   * Format tax breakdown for display
   */
  formatTaxBreakdown(result: TaxCalculationResult): string {
    if (result.taxAmount === 0) {
      return 'No Tax'
    }

    return `CGST (${(result.taxRate / 2).toFixed(1)}%): ₹${result.cgst.toFixed(2)} + SGST (${(result.taxRate / 2).toFixed(1)}%): ₹${result.sgst.toFixed(2)}`
  }

  /**
   * Get tax category display name
   */
  getTaxCategoryDisplayName(category: string): string {
    switch (category) {
      case 'essential':
        return 'Essential (5%)'
      case 'intermediate':
        return 'Intermediate (12%)'
      case 'standard':
        return 'Standard (18%)'
      case 'luxury':
        return 'Luxury (28%)'
      case 'exempt':
        return 'Exempt (0%)'
      case 'service':
        return 'Service (5%)'
      default:
        return 'Standard (18%)'
    }
  }
}

/**
 * Utility function to create tax calculator with default settings
 */
export function createTaxCalculator(settings: Partial<TaxSettings> = {}): TaxCalculator {
  const defaultSettings: TaxSettings = {
    enableTax: true,
    taxType: 'gst',
    serviceTaxRate: 5,
    essentialProductRate: 5,
    intermediateProductRate: 12,
    standardProductRate: 18,
    luxuryProductRate: 28,
    exemptProductRate: 0,
    cgstRate: 9,
    sgstRate: 9,
    ...settings
  }

  return new TaxCalculator(defaultSettings)
}
