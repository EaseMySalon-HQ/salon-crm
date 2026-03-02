"use client"

import type { Receipt } from "@/lib/data"
import { formatCurrency, getCurrencySymbol } from "@/lib/currency"

interface ReceiptGeneratorProps {
  receipt: Receipt
  businessSettings?: any
}

export function ReceiptGenerator({ receipt, businessSettings }: ReceiptGeneratorProps) {
  const generateReceiptHTML = () => {
    if (!businessSettings) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Receipt ${receipt.receiptNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
            .loading { font-size: 18px; color: #666; }
          </style>
        </head>
        <body>
          <div class="loading">Loading receipt...</div>
        </body>
        </html>
      `
    }

    // Calculate correct tax amounts outside template literal
    const calculateCorrectTaxAmount = () => {
      if (receipt.taxBreakdown) {
        const serviceTax = receipt.taxBreakdown.serviceTax || 0
        const productTaxTotal = Object.values(receipt.taxBreakdown.productTaxByRate || {}).reduce((sum, amount) => sum + amount, 0)
        return serviceTax + productTaxTotal
      }
      return receipt.tax
    }

    const calculateCorrectTotal = () => {
      // Since items already include tax, total = subtotal - discount + tip + roundOff
      // Tax breakdown is informational only, not added to total
      const preRoundTotal = receipt.subtotal - receipt.discount + receipt.tip
      const roundedTotal = Math.round(preRoundTotal)
      // If roundOff is provided, use it; otherwise calculate it
      const actualRoundOff = receipt.roundOff !== undefined ? receipt.roundOff : (roundedTotal - preRoundTotal)
      return roundedTotal
    }

    const correctTaxAmount = calculateCorrectTaxAmount()
    const correctTotal = calculateCorrectTotal()

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt ${receipt.receiptNumber}</title>
        <style>
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            margin: 0;
            padding: 20px;
            max-width: 300px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
            margin-bottom: 15px;
          }
          .salon-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .salon-info {
            font-size: 10px;
            margin-bottom: 2px;
          }
          .receipt-info {
            margin-bottom: 15px;
          }
          .receipt-info div {
            margin-bottom: 3px;
          }
          .items {
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 10px 0;
            margin-bottom: 10px;
          }
          .item {
            margin-bottom: 8px;
          }
          .item-header {
            display: flex;
            justify-content: space-between;
            font-weight: bold;
          }
          .item-details {
            font-size: 10px;
            color: #666;
            margin-left: 10px;
          }
          .totals {
            margin-bottom: 15px;
          }
          .total-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
          }
          .total-line.grand-total {
            font-weight: bold;
            font-size: 14px;
            border-top: 1px solid #000;
            padding-top: 5px;
            margin-top: 8px;
          }
          .payments {
            margin-bottom: 15px;
          }
          .payment-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
          }
          .footer {
            text-align: center;
            border-top: 1px dashed #000;
            padding-top: 10px;
            font-size: 10px;
          }
          @media print {
            body { margin: 0; padding: 10px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${businessSettings.logo ? `<div class="logo-container" style="margin-bottom: 10px;"><img src="${businessSettings.logo}" alt="Business Logo" style="max-height: 60px; max-width: 60px; object-fit: contain; display: block; margin: 0 auto;"></div>` : ''}
          <div class="salon-name">${businessSettings.name}</div>
          <div class="salon-info">${businessSettings.address}, ${businessSettings.city}, ${businessSettings.state} ${businessSettings.zipCode}</div>
          <div class="salon-info">Phone: ${businessSettings.phone}</div>
          <div class="salon-info">Email: ${businessSettings.email}</div>
          ${businessSettings.gstNumber ? `<div class="salon-info" style="font-weight: bold;">GST: ${businessSettings.gstNumber}</div>` : ''}
        </div>

        <div class="receipt-info">
          <div><strong>Receipt #:</strong> ${receipt.receiptNumber}</div>
          <div><strong>Date:</strong> ${new Date(receipt.date).toLocaleDateString()}</div>
          <div><strong>Time:</strong> ${receipt.time}</div>
          <div><strong>Client:</strong> ${receipt.clientName}</div>
          <div><strong>Phone:</strong> ${receipt.clientPhone}</div>
        </div>

        <div class="items">
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="border-bottom: 1px solid #000;">
                <th style="text-align: left; padding: 4px 2px;">HSN</th>
                <th style="text-align: left; padding: 4px 2px;">Service/Product</th>
                <th style="text-align: right; padding: 4px 2px;">Price</th>
                <th style="text-align: right; padding: 4px 2px;">Disc(%)</th>
                <th style="text-align: right; padding: 4px 2px;">Tax Rate</th>
                <th style="text-align: right; padding: 4px 2px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${receipt.items
                .map(
                  (item) => `
                <tr style="border-bottom: 1px dashed #999;">
                  <td style="padding: 3px 2px;">${item.hsnSacCode || "-"}</td>
                  <td style="padding: 3px 2px;">${item.name}${item.quantity > 1 ? ` (x${item.quantity})` : ""}${item.staffName ? `<br><span style="font-size: 10px; color: #666;">${item.staffName}</span>` : ""}</td>
                  <td style="text-align: right; padding: 3px 2px;">${formatCurrency(item.price, businessSettings)}</td>
                  <td style="text-align: right; padding: 3px 2px;">${(item.discount || 0) > 0 ? (item.discountType === "percentage" ? item.discount + "%" : formatCurrency(item.discount, businessSettings)) : "-"}</td>
                  <td style="text-align: right; padding: 3px 2px;">${((item as any).taxRate ?? 0) > 0 ? (item as any).taxRate + "%" : "-"}</td>
                  <td style="text-align: right; padding: 3px 2px; font-weight: bold;">${formatCurrency(item.total, businessSettings)}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <div class="totals">
          <div class="total-line">
            <span>Subtotal (Excl. Tax):</span>
            <span>${formatCurrency((receipt as any).subtotalExcludingTax ?? receipt.subtotal, businessSettings)}</span>
          </div>
          ${
            receipt.discount > 0
              ? `
            <div class="total-line">
              <span>Discount:</span>
              <span>-${formatCurrency(receipt.discount, businessSettings)}</span>
            </div>
          `
              : ""
          }
          ${
            receipt.tax > 0
              ? `
            <div class="total-line">
              <span>Tax (GST):</span>
              <span>${formatCurrency(correctTaxAmount, businessSettings)}</span>
            </div>
            ${(() => {
              // Use the tax breakdown from the receipt object if available
              if (receipt.taxBreakdown) {
                let breakdown = ''
                
                // Service Tax breakdown
                if (receipt.taxBreakdown.serviceTax > 0) {
                  const serviceTax = receipt.taxBreakdown.serviceTax
                  const serviceRate = receipt.taxBreakdown.serviceRate || 5
                  breakdown += `
                  <div class="total-line" style="margin-left: 10px; font-size: 11px;">
                    <span>Service Tax (${serviceRate}%):</span>
                    <span>${formatCurrency(serviceTax, businessSettings)}</span>
                  </div>
                  <div class="total-line" style="margin-left: 20px; font-size: 10px;">
                    <span>CGST (${serviceRate / 2}%):</span>
                    <span>${formatCurrency(serviceTax / 2, businessSettings)}</span>
                  </div>
                  <div class="total-line" style="margin-left: 20px; font-size: 10px;">
                    <span>SGST (${serviceRate / 2}%):</span>
                    <span>${formatCurrency(serviceTax / 2, businessSettings)}</span>
                  </div>
                  `
                }
                
                // Product Tax breakdown by rate
                if (receipt.taxBreakdown.productTaxByRate) {
                  Object.entries(receipt.taxBreakdown.productTaxByRate).forEach(([rate, amount]) => {
                    if (amount > 0) {
                      breakdown += `
                      <div class="total-line" style="margin-left: 10px; font-size: 11px;">
                        <span>Product Tax (${rate}%):</span>
                        <span>${formatCurrency(amount, businessSettings)}</span>
                      </div>
                      <div class="total-line" style="margin-left: 20px; font-size: 10px;">
                        <span>CGST (${parseFloat(rate) / 2}%):</span>
                        <span>${formatCurrency(amount / 2, businessSettings)}</span>
                      </div>
                      <div class="total-line" style="margin-left: 20px; font-size: 10px;">
                        <span>SGST (${parseFloat(rate) / 2}%):</span>
                        <span>${formatCurrency(amount / 2, businessSettings)}</span>
                      </div>
                      `
                    }
                  })
                }
                
                return breakdown
              }
              
              // Fallback when taxBreakdown is not available: use 5% service rate (2.5% CGST + 2.5% SGST)
              return `
              <div class="total-line" style="margin-left: 10px; font-size: 11px;">
                <span>CGST (2.5%):</span>
                <span>${formatCurrency(receipt.tax / 2, businessSettings)}</span>
              </div>
              <div class="total-line" style="margin-left: 10px; font-size: 11px;">
                <span>SGST (2.5%):</span>
                <span>${formatCurrency(receipt.tax / 2, businessSettings)}</span>
              </div>
              `
            })()}
          `
              : ""
          }
          ${
            receipt.tip > 0
              ? `
            <div class="total-line">
              <span>${receipt.tipStaffName ? `Tip (${receipt.tipStaffName}):` : 'Tip:'}</span>
              <span>${formatCurrency(receipt.tip, businessSettings)}</span>
            </div>
          `
              : ""
          }
          ${
            receipt.roundOff && Math.abs(receipt.roundOff) > 0.01
              ? `
            <div class="total-line">
              <span>Round Off:</span>
              <span>${formatCurrency(receipt.roundOff, businessSettings)}</span>
            </div>
          `
              : ""
          }
          <div class="total-line grand-total">
            <span>TOTAL:</span>
            <span>${formatCurrency(correctTotal, businessSettings)}</span>
          </div>
        </div>

        <div class="payments">
          <div style="font-weight: bold; margin-bottom: 5px;">Payment Method(s):</div>
          ${receipt.payments
            .map(
              (payment) => {
                // Safely handle payment types with null/undefined checks
                if (!payment || !payment.type) {
                  return `
            <div class="payment-line">
              <span>Unknown:</span>
              <span>${formatCurrency(payment?.amount || 0, businessSettings)}</span>
            </div>
          `
                }
                
                // Map payment types to display names
                let displayName = 'Unknown'
                if (payment.type === 'cash') displayName = 'Cash'
                if (payment.type === 'card') displayName = 'Card'
                if (payment.type === 'online') displayName = 'Online'
                if (payment.type === 'unknown') displayName = 'Unknown'
                
                return `
            <div class="payment-line">
              <span>${displayName}:</span>
              <span>${formatCurrency(payment.amount, businessSettings)}</span>
            </div>
          `
              }
            )
            .join("")}
        </div>

        <div class="footer">
          <div>Thank you for visiting!</div>
          <div>We appreciate your business</div>
          <div style="margin-top: 10px;">
            Follow us on social media<br>
            ${businessSettings.socialMedia}
          </div>
        </div>
      </body>
      </html>
    `
  }

  const printReceipt = () => {
    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(generateReceiptHTML())
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 250)
    }
  }

  const downloadReceipt = () => {
    const html = generateReceiptHTML()
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `receipt-${receipt.receiptNumber}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return {
    generateReceiptHTML,
    printReceipt,
    downloadReceipt,
  }
}
