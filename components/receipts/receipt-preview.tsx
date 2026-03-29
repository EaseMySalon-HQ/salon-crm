"use client"

import { useEffect } from "react"
import type { Receipt } from "@/lib/data"
import { getReceiptGrandTotal } from "@/lib/receipt-grand-total"
import { formatReceiptItemStaffNames } from "@/lib/receipt-staff-format"
import { Card, CardContent } from "@/components/ui/card"
import { useCurrency } from "@/hooks/use-currency"

interface ReceiptPreviewProps {
  receipt: Receipt
  businessSettings?: any
}

export function ReceiptPreview({ receipt, businessSettings }: ReceiptPreviewProps) {
  const { formatAmount } = useCurrency()
  
  // Debug logging
  useEffect(() => {
    console.log('🔍 ReceiptPreview - receipt data:', receipt)
    console.log('🔍 ReceiptPreview - payments:', receipt.payments)
  }, [receipt])
  
  const total = getReceiptGrandTotal(receipt)
  const totalPaid = (receipt.payments || []).reduce((sum, p) => sum + (p?.amount || 0), 0)
  const outstanding = total - totalPaid
  const paymentStatus = outstanding === 0 ? "FULL PAID" : totalPaid > 0 ? "PART PAID" : "UNPAID"
  const stampColor = paymentStatus === "FULL PAID" ? "#16a34a" : paymentStatus === "PART PAID" ? "#f97316" : "#dc2626"

  return (
    <Card className="max-w-2xl w-full mx-auto bg-white relative">
      <CardContent className="p-6 font-mono text-sm">
        {/* Header */}
        <div className="text-center border-b-2 border-black pb-3 mb-4">
          {/* Logo */}
          {businessSettings?.logo && (
            <div className="mb-3">
              <img 
                src={businessSettings.logo} 
                alt="Business Logo" 
                className="mx-auto h-16 w-16 object-contain"
              />
            </div>
          )}
          <div className="text-lg font-bold mb-1">
            {businessSettings?.name || "GLAMOUR SALON & SPA"}
          </div>
          <div className="text-xs">
            {businessSettings 
              ? `${businessSettings.address}, ${businessSettings.city}, ${businessSettings.state} ${businessSettings.zipCode}`
              : "123 Beauty Street, City, ST 12345"
            }
          </div>
          <div className="text-xs">
            Phone: {businessSettings?.phone || "(555) 123-SALON"}
          </div>
          <div className="text-xs">
            Email: {businessSettings?.email || "info@glamoursalon.com"}
          </div>
          {businessSettings?.gstNumber && (
            <div className="text-xs font-semibold mt-1">
              GST: {businessSettings.gstNumber}
            </div>
          )}
        </div>

        {/* Receipt Info */}
        <div className="mb-4 space-y-1">
          <div className="flex justify-between">
            <span className="font-semibold">Receipt #:</span>
            <span>{receipt.receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Date:</span>
            <span>{new Date(receipt.date).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Time:</span>
            <span>{receipt.time}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Client:</span>
            <span>{receipt.clientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Phone:</span>
            <span>{receipt.clientPhone}</span>
          </div>
        </div>

        {/* Items - Table: HSN, Service/Product, Price, Disc(%), Tax Rate, Total */}
        <div className="border-t border-b border-dashed border-black py-3 mb-3 overflow-x-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black">
                <th className="text-left py-1 font-semibold">HSN</th>
                <th className="text-left py-1 font-semibold">Service/Product</th>
                <th className="text-right py-1 font-semibold">Price</th>
                <th className="text-right py-1 font-semibold">Disc(%)</th>
                <th className="text-right py-1 font-semibold">Tax Rate</th>
                <th className="text-right py-1 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item, index) => (
                <tr key={index} className="border-b border-dashed border-gray-300 last:border-0">
                  <td className="py-1.5">{item.hsnSacCode || "-"}</td>
                  <td className="py-1.5">
                    <span className="font-medium">{item.name}</span>
                    {item.quantity > 1 && (
                      <span className="text-xs text-gray-600 ml-1">(x{item.quantity})</span>
                    )}
                    {(() => {
                      const staffLabel = formatReceiptItemStaffNames(item)
                      return staffLabel ? (
                        <span className="block text-xs text-gray-600">{staffLabel}</span>
                      ) : null
                    })()}
                  </td>
                  <td className="py-1.5 text-right">{formatAmount(item.price)}</td>
                  <td className="py-1.5 text-right">
                    {(item.discount || 0) > 0
                      ? item.discountType === "percentage"
                        ? `${item.discount}%`
                        : formatAmount(item.discount)
                      : "-"}
                  </td>
                  <td className="py-1.5 text-right">{((item as any).taxRate ?? 0) > 0 ? `${(item as any).taxRate}%` : "-"}</td>
                  <td className="py-1.5 text-right font-medium">{formatAmount(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="space-y-1 mb-4">
          <div className="flex justify-between">
            <span>Subtotal (Excl. Tax):</span>
            <span>{formatAmount((receipt as any).subtotalExcludingTax ?? receipt.subtotal)}</span>
          </div>
          {receipt.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>-{formatAmount(receipt.discount)}</span>
            </div>
          )}
          {receipt.tax > 0 && (
            <>
              {(() => {
                // Calculate correct total tax from taxBreakdown if available
                let correctTotalTax = receipt.tax
                if (receipt.taxBreakdown) {
                  const serviceTax = receipt.taxBreakdown.serviceTax || 0
                  const productTaxTotal = Object.values(receipt.taxBreakdown.productTaxByRate || {}).reduce((sum, amount) => sum + amount, 0)
                  correctTotalTax = serviceTax + productTaxTotal
                }
                
                return (
                  <>
                    <div className="flex justify-between font-semibold">
                      <span>Tax (GST):</span>
                      <span>{formatAmount(correctTotalTax)}</span>
                    </div>
                    {receipt.taxBreakdown ? (
                      <div className="space-y-1">
                        {/* Service Tax breakdown */}
                        {receipt.taxBreakdown.serviceTax > 0 && (
                          <div className="ml-2 space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>Service Tax ({receipt.taxBreakdown.serviceRate}%):</span>
                              <span>{formatAmount(receipt.taxBreakdown.serviceTax)}</span>
                            </div>
                            <div className="flex justify-between text-xs ml-2">
                              <span>CGST ({receipt.taxBreakdown.serviceRate / 2}%):</span>
                              <span>{formatAmount(receipt.taxBreakdown.serviceTax / 2)}</span>
                            </div>
                            <div className="flex justify-between text-xs ml-2">
                              <span>SGST ({receipt.taxBreakdown.serviceRate / 2}%):</span>
                              <span>{formatAmount(receipt.taxBreakdown.serviceTax / 2)}</span>
                            </div>
                          </div>
                        )}
                        
                        {/* Product Tax breakdown by rate */}
                        {receipt.taxBreakdown.productTaxByRate && Object.entries(receipt.taxBreakdown.productTaxByRate).map(([rate, amount]) => {
                          if (amount > 0) {
                            return (
                              <div key={rate} className="ml-2 space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>Product Tax ({rate}%):</span>
                                  <span>{formatAmount(amount)}</span>
                                </div>
                                <div className="flex justify-between text-xs ml-2">
                                  <span>CGST ({parseFloat(rate) / 2}%):</span>
                                  <span>{formatAmount(amount / 2)}</span>
                                </div>
                                <div className="flex justify-between text-xs ml-2">
                                  <span>SGST ({parseFloat(rate) / 2}%):</span>
                                  <span>{formatAmount(amount / 2)}</span>
                                </div>
                              </div>
                            )
                          }
                          return null
                        })}
                      </div>
                    ) : (
                      // Fallback when taxBreakdown is not available: use 5% service rate (2.5% CGST + 2.5% SGST)
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs ml-2">
                          <span>CGST (2.5%):</span>
                          <span>{formatAmount(receipt.tax / 2)}</span>
                        </div>
                        <div className="flex justify-between text-xs ml-2">
                          <span>SGST (2.5%):</span>
                          <span>{formatAmount(receipt.tax / 2)}</span>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          )}
          {receipt.tip > 0 && (
            <div className="flex justify-between">
              <span>{receipt.tipStaffName ? `Tip (${receipt.tipStaffName}):` : 'Tip:'}</span>
              <span>{formatAmount(receipt.tip)}</span>
            </div>
          )}
          {receipt.roundOff && Math.abs(receipt.roundOff) > 0.01 && (
            <div className="flex justify-between">
              <span>Round Off:</span>
              <span>{formatAmount(receipt.roundOff)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base border-t border-black pt-2 mt-2">
            <span>TOTAL:</span>
            <span>{formatAmount(getReceiptGrandTotal(receipt))}</span>
          </div>
          {(() => {
            const total = getReceiptGrandTotal(receipt)
            const totalPaid = (receipt.payments || []).reduce((sum, p) => sum + (p?.amount || 0), 0)
            const outstanding = total - totalPaid
            return (
              <>
                <div className="flex justify-between text-sm mt-2">
                  <span>Total Paid:</span>
                  <span>{formatAmount(totalPaid)}</span>
                </div>
                <div className={`flex justify-between text-sm mt-1 ${outstanding > 0 ? "text-red-600 font-medium" : ""}`}>
                  <span>Outstanding:</span>
                  <span>{formatAmount(outstanding)}</span>
                </div>
              </>
            )
          })()}
        </div>

        {/* Payments */}
        <div className="mb-4">
          <div className="font-semibold mb-2">Payment Method(s):</div>
          {receipt.payments.map((payment, index) => {
            // Safely handle payment types with null/undefined checks
            if (!payment || !payment.type) {
              console.warn(`Payment at index ${index} is missing type:`, payment)
              return (
                <div key={index} className="flex justify-between">
                  <span>Unknown:</span>
                  <span>{formatAmount(payment?.amount || 0)}</span>
                </div>
              )
            }
            
            // Map payment types to display names
            let displayName = 'Unknown'
            if (payment.type === 'cash') displayName = 'Cash'
            if (payment.type === 'card') displayName = 'Card'
            if (payment.type === 'online') displayName = 'Online'
            if (payment.type === 'unknown') displayName = 'Unknown'
            
            return (
              <div key={index} className="flex justify-between">
                <span>{displayName}:</span>
                <span>{formatAmount(payment.amount)}</span>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="text-center border-t border-dashed border-black pt-3 text-xs">
          <div>Thank you for visiting!</div>
          <div>We appreciate your business</div>
          <div className="mt-2">
            Follow us on social media
            <br />
            {businessSettings?.socialMedia || "@glamoursalon"}
          </div>
        </div>

        {/* Payment Status Stamp */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 select-none print:opacity-100"
          style={{
            border: `2px solid ${stampColor}`,
            color: stampColor,
            padding: "6px 12px",
            fontSize: "14px",
            fontWeight: 700,
            letterSpacing: "0.05em",
            opacity: 0.85,
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            borderRadius: "4px",
            printColorAdjust: "exact",
            WebkitPrintColorAdjust: "exact",
          }}
        >
          {paymentStatus === "FULL PAID" && "✓ "}
          {paymentStatus}
        </div>
      </CardContent>
    </Card>
  )
}
