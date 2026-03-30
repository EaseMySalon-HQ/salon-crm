"use client"

import { Receipt } from "@/lib/data"
import { formatReceiptItemStaffNames } from "@/lib/receipt-staff-format"
import { getReceiptPaymentStamp } from "@/lib/receipt-payment-stamp"

interface ThermalReceiptGeneratorProps {
  receipt: Receipt
  businessSettings?: any
}

export function ThermalReceiptGenerator({ receipt, businessSettings }: ThermalReceiptGeneratorProps) {
  const generateThermalReceiptHTML = () => {
    if (!businessSettings) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Thermal Receipt - ${receipt.receiptNumber}</title>
          <style>
            @page {
              size: 80mm 200mm;
              margin: 0;
              padding: 0;
            }
          body {
            font-family: 'Courier New', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 20px;
            font-weight: bold;
            line-height: 1.3;
            margin: 0;
            padding: 2mm 0mm 0mm 0mm;
            width: 80mm;
            background: white;
            color: black;
            -webkit-font-smoothing: none;
            -moz-osx-font-smoothing: auto;
            text-rendering: optimizeSpeed;
            font-smooth: never;
          }
            .header {
              text-align: center;
              border-bottom: 1px dashed #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
            }
            .business-name {
              font-size: 25px;
              font-weight: bold;
              margin-bottom: 4px;
              letter-spacing: 0.5px;
            }
            .business-info {
              font-size: 17px;
              font-weight: bold;
              margin-bottom: 2px;
            }
            .receipt-info {
              margin-bottom: 8px;
            }
            .receipt-info div {
              margin-bottom: 2px;
              font-weight: bold;
            }
            .items {
              border-bottom: 1px dashed #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
            }
            .item {
              margin-bottom: 4px;
            }
            .item-name {
              font-weight: bold;
              font-size: 20px;
            }
            .item-details {
              font-size: 17px;
              font-weight: bold;
              margin-left: 4px;
            }
            .totals {
              margin-bottom: 8px;
            }
            .total-line {
              display: flex;
              justify-content: space-between;
              margin-bottom: 2px;
              font-weight: bold;
            }
            .total-line.total-amount {
              font-weight: bold;
              font-size: 22px;
              border-top: 1px solid #000;
              padding-top: 4px;
              margin-top: 4px;
            }
            .payments {
              border-bottom: 1px dashed #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
            }
            .payment-line {
              display: flex;
              justify-content: space-between;
              margin-bottom: 2px;
              font-weight: bold;
            }
            .footer {
              text-align: center;
              font-size: 17px;
              font-weight: bold;
              margin-bottom: 0;
              padding-bottom: 0;
            }
            .tax-breakdown {
              font-size: 17px;
              font-weight: bold;
              margin-left: 8px;
            }
            .round-off {
              font-size: 18px;
            }
            body { position: relative; }
            .payment-stamp {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-12deg);
              padding: 4px 8px;
              font-size: 14px;
              font-weight: 700;
              letter-spacing: 0.03em;
              opacity: 0.85;
              border-radius: 3px;
              box-shadow: 0 1px 2px rgba(0,0,0,0.2);
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="business-name">GLAMOUR SALON & SPA</div>
            <div class="business-info">123 Beauty Street, City, ST 12345</div>
            <div class="business-info">Phone: (555) 123-SALON</div>
            <div class="business-info">Email: info@glamoursalon.com</div>
            <div class="business-info">GST: 12ABCDE1234F1Z5</div>
          </div>

          <div class="receipt-info">
            <div><strong>Receipt #:</strong> ${receipt.receiptNumber}</div>
            <div><strong>Date:</strong> ${new Date(receipt.date).toLocaleDateString()}</div>
            <div><strong>Time:</strong> ${receipt.time}</div>
            <div><strong>Client:</strong> ${receipt.clientName}</div>
            <div><strong>Phone:</strong> ${receipt.clientPhone}</div>
          </div>

          <div class="items">
            <table style="width: 100%; border-collapse: collapse; font-size: 17px;">
              <tr style="border-bottom: 1px solid #000;"><th style="text-align: left;">HSN</th><th style="text-align: left;">Item</th><th style="text-align: right;">Price</th><th style="text-align: right;">Disc</th><th style="text-align: right;">Tax Rate</th><th style="text-align: right;">Total</th></tr>
              ${receipt.items.map(item => {
                const staffLabel = formatReceiptItemStaffNames(item)
                return `
                <tr style="border-bottom: 1px dashed #999;">
                  <td>${(item as any).hsnSacCode || "-"}</td>
                  <td>${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}${staffLabel ? `<br><span style="font-size: 15px; color: #666;">${staffLabel}</span>` : ""}</td>
                  <td style="text-align: right;">₹${item.price.toFixed(2)}</td>
                  <td style="text-align: right;">${(item.discount || 0) > 0 ? (item.discountType === "percentage" ? item.discount + "%" : "₹" + item.discount.toFixed(2)) : "-"}</td>
                  <td style="text-align: right;">${((item as any).taxRate ?? 0) > 0 ? (item as any).taxRate + "%" : "-"}</td>
                  <td style="text-align: right; font-weight: bold;">₹${item.total.toFixed(2)}</td>
                </tr>
              `}).join('')}
            </table>
          </div>

          <div class="totals">
            <div class="total-line">
              <span>Subtotal (Excl. Tax):</span>
              <span>₹${((receipt as any).subtotalExcludingTax ?? receipt.subtotal).toFixed(2)}</span>
            </div>
            ${receipt.discount > 0 ? `
              <div class="total-line">
                <span>Discount:</span>
                <span>-₹${receipt.discount.toFixed(2)}</span>
              </div>
            ` : ''}
            ${receipt.tax > 0 ? `
              <div class="total-line">
                <span>Tax (GST):</span>
                <span>₹${receipt.tax.toFixed(2)}</span>
              </div>
              ${(() => {
                // Calculate service and product tax separately
                const serviceTax = receipt.items
                  .filter(item => item.type === 'service')
                  .reduce((sum, item) => {
                    const itemTax = (item.price * item.quantity) * 0.05 // 5% service tax
                    return sum + itemTax
                  }, 0)
                
                const productTax = receipt.items
                  .filter(item => item.type === 'product')
                  .reduce((sum, item) => {
                    const itemTax = (item.price * item.quantity) * 0.18 // 18% product tax (assuming standard)
                    return sum + itemTax
                  }, 0)

                let breakdown = ''

                if (serviceTax > 0) {
                  breakdown += `
                    <div class="tax-breakdown">
                      <div class="total-line">Service Tax (5%): ₹${serviceTax.toFixed(2)}</div>
                      <div class="total-line">CGST (2.5%): ₹${(serviceTax / 2).toFixed(2)}</div>
                      <div class="total-line">SGST (2.5%): ₹${(serviceTax / 2).toFixed(2)}</div>
                    </div>
                  `
                }

                if (productTax > 0) {
                  breakdown += `
                    <div class="tax-breakdown">
                      <div class="total-line">Product Tax (18%): ₹${productTax.toFixed(2)}</div>
                      <div class="total-line">CGST (9%): ₹${(productTax / 2).toFixed(2)}</div>
                      <div class="total-line">SGST (9%): ₹${(productTax / 2).toFixed(2)}</div>
                    </div>
                  `
                }

                return breakdown || `
                  <div class="tax-breakdown">
                    <div class="total-line">CGST (2.5%): ₹${(receipt.tax / 2).toFixed(2)}</div>
                    <div class="total-line">SGST (2.5%): ₹${(receipt.tax / 2).toFixed(2)}</div>
                  </div>
                `
              })()}
            ` : ''}
            ${receipt.tip > 0 ? `
              <div class="total-line">
                <span>${receipt.tipStaffName ? `Tip (${receipt.tipStaffName}):` : 'Tip:'}</span>
                <span>₹${receipt.tip.toFixed(2)}</span>
              </div>
            ` : ''}
            ${receipt.roundOff && Math.abs(receipt.roundOff) > 0.01 ? `
              <div class="total-line round-off">
                <span>Round Off:</span>
                <span>₹${receipt.roundOff.toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="total-line total-amount">
              <span>TOTAL:</span>
              <span>₹${receipt.total.toFixed(2)}</span>
            </div>
            ${(() => {
              const totalPaid = (receipt.payments || []).reduce((sum, p) => sum + (p?.amount || 0), 0)
              const outstanding = receipt.total - totalPaid
              const outstandingStyle = outstanding > 0 ? ' style="color: #dc2626; font-weight: 500;"' : ''
              return `
            <div class="total-line" style="margin-top: 6px;">
              <span>Total Paid:</span>
              <span>₹${totalPaid.toFixed(2)}</span>
            </div>
            <div class="total-line" style="margin-top: 4px;"${outstandingStyle}>
              <span>Outstanding:</span>
              <span>₹${outstanding.toFixed(2)}</span>
            </div>
            `
            })()}
          </div>

          <div class="payments">
            <div style="font-weight: bold; margin-bottom: 4px;">Payment Method(s):</div>
            ${receipt.payments.map(payment => `
              <div class="payment-line">
                <span>${payment.type === 'cash' ? 'Cash' : payment.type === 'card' ? 'Card' : 'Online'}:</span>
                <span>₹${payment.amount.toFixed(2)}</span>
              </div>
            `).join('')}
          </div>

          <div class="footer">
            <div>Thank you for visiting!</div>
            <div>We appreciate your business</div>
            <div style="margin-top: 8px;">
              Follow us on social media<br>
              @glamoursalon
            </div>
          </div>
          ${(() => {
            const stamp = getReceiptPaymentStamp(receipt as any, receipt.total)
            return `<div class="payment-stamp" style="border: 2px solid ${stamp.color}; color: ${stamp.color};">${stamp.checkPrefix}${stamp.label}</div>`
          })()}
        </body>
        </html>
      `
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Thermal Receipt - ${receipt.receiptNumber}</title>
        <style>
          @page {
            size: 80mm 200mm;
            margin: 0;
            padding: 0;
          }
          @media print {
            @page {
              size: 80mm 200mm;
              margin: 0;
              padding: 0;
            }
            body {
              -webkit-print-color-adjust: exact;
              color-adjust: exact;
            }
          }
          body {
            font-family: 'Courier New', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 20px;
            font-weight: bold;
            line-height: 1.3;
            margin: 0;
            padding: 2mm 0mm 0mm 0mm;
            width: 80mm;
            background: white;
            color: black;
            -webkit-font-smoothing: none;
            -moz-osx-font-smoothing: auto;
            text-rendering: optimizeSpeed;
            font-smooth: never;
          }
          .header {
            text-align: center;
            border-bottom: 1px dashed #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .business-name {
            font-size: 25px;
            font-weight: bold;
            margin-bottom: 4px;
            letter-spacing: 0.5px;
          }
          .business-info {
            font-size: 17px;
            font-weight: bold;
            margin-bottom: 2px;
          }
          .receipt-info {
            margin-bottom: 8px;
          }
          .receipt-info div {
            margin-bottom: 2px;
            font-weight: bold;
          }
          .items {
            border-bottom: 1px dashed #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .item {
            margin-bottom: 4px;
          }
          .item-name {
            font-weight: bold;
            font-size: 20px;
          }
          .item-details {
            font-size: 17px;
            font-weight: bold;
            margin-left: 4px;
          }
          .totals {
            margin-bottom: 8px;
          }
          .total-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
            font-weight: bold;
          }
          .total-line.total-amount {
            font-weight: bold;
            font-size: 22px;
            border-top: 1px solid #000;
            padding-top: 4px;
            margin-top: 4px;
          }
          .payments {
            border-bottom: 1px dashed #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .payment-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
            font-weight: bold;
          }
          .footer {
            text-align: center;
            font-size: 17px;
            font-weight: bold;
            margin-bottom: 0;
            padding-bottom: 0;
          }
          .tax-breakdown {
            font-size: 17px;
            font-weight: bold;
            margin-left: 8px;
          }
          .round-off {
            font-size: 18px;
            font-weight: bold;
          }
          body { position: relative; }
          .payment-stamp {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-12deg);
            padding: 4px 8px;
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.03em;
            opacity: 0.85;
            border-radius: 3px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="business-name">${businessSettings.name || "GLAMOUR SALON & SPA"}</div>
          <div class="business-info">${businessSettings.address || "123 Beauty Street"}, ${businessSettings.city || "City"}, ${businessSettings.state || "ST"} ${businessSettings.zipCode || "12345"}</div>
          <div class="business-info">Phone: ${businessSettings.phone || "(555) 123-SALON"}</div>
          <div class="business-info">Email: ${businessSettings.email || "info@glamoursalon.com"}</div>
          ${businessSettings.gstNumber ? `<div class="business-info">GST: ${businessSettings.gstNumber}</div>` : ''}
        </div>

        <div class="receipt-info">
          <div><strong>Receipt #:</strong> ${receipt.receiptNumber}</div>
          <div><strong>Date:</strong> ${new Date(receipt.date).toLocaleDateString()}</div>
          <div><strong>Time:</strong> ${receipt.time}</div>
          <div><strong>Client:</strong> ${receipt.clientName}</div>
          <div><strong>Phone:</strong> ${receipt.clientPhone}</div>
        </div>

        <div class="items">
          <table style="width: 100%; border-collapse: collapse; font-size: 17px;">
            <tr style="border-bottom: 1px solid #000;"><th style="text-align: left;">HSN</th><th style="text-align: left;">Item</th><th style="text-align: right;">Price</th><th style="text-align: right;">Disc</th><th style="text-align: right;">Tax Rate</th><th style="text-align: right;">Total</th></tr>
            ${receipt.items.map(item => {
              const staffLabel = formatReceiptItemStaffNames(item)
              return `
              <tr style="border-bottom: 1px dashed #999;">
                <td>${(item as any).hsnSacCode || "-"}</td>
                <td>${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}${staffLabel ? `<br><span style="font-size: 15px; color: #666;">${staffLabel}</span>` : ""}</td>
                <td style="text-align: right;">₹${item.price.toFixed(2)}</td>
                <td style="text-align: right;">${(item.discount || 0) > 0 ? (item.discountType === "percentage" ? item.discount + "%" : "₹" + item.discount.toFixed(2)) : "-"}</td>
                <td style="text-align: right;">${((item as any).taxRate ?? 0) > 0 ? (item as any).taxRate + "%" : "-"}</td>
                <td style="text-align: right; font-weight: bold;">₹${item.total.toFixed(2)}</td>
              </tr>
            `}).join('')}
          </table>
        </div>

        <div class="totals">
          <div class="total-line">
            <span>Subtotal (Excl. Tax):</span>
            <span>₹${((receipt as any).subtotalExcludingTax ?? receipt.subtotal).toFixed(2)}</span>
          </div>
          ${receipt.discount > 0 ? `
            <div class="total-line">
              <span>Discount:</span>
              <span>-₹${receipt.discount.toFixed(2)}</span>
            </div>
          ` : ''}
          ${receipt.tax > 0 ? `
            <div class="total-line">
              <span>Tax (GST):</span>
              <span>₹${receipt.tax.toFixed(2)}</span>
            </div>
            ${(() => {
              // Calculate service and product tax separately
              const serviceTax = receipt.items
                .filter(item => item.type === 'service')
                .reduce((sum, item) => {
                  const itemTax = (item.price * item.quantity) * 0.05 // 5% service tax
                  return sum + itemTax
                }, 0)
              
              const productTax = receipt.items
                .filter(item => item.type === 'product')
                .reduce((sum, item) => {
                  const itemTax = (item.price * item.quantity) * 0.18 // 18% product tax (assuming standard)
                  return sum + itemTax
                }, 0)

              let breakdown = ''

              if (serviceTax > 0) {
                breakdown += `
                  <div class="tax-breakdown">
                    <div class="total-line">Service Tax (5%): ₹${serviceTax.toFixed(2)}</div>
                    <div class="total-line">CGST (2.5%): ₹${(serviceTax / 2).toFixed(2)}</div>
                    <div class="total-line">SGST (2.5%): ₹${(serviceTax / 2).toFixed(2)}</div>
                  </div>
                `
              }

              if (productTax > 0) {
                breakdown += `
                  <div class="tax-breakdown">
                    <div class="total-line">Product Tax (18%): ₹${productTax.toFixed(2)}</div>
                    <div class="total-line">CGST (9%): ₹${(productTax / 2).toFixed(2)}</div>
                    <div class="total-line">SGST (9%): ₹${(productTax / 2).toFixed(2)}</div>
                  </div>
                `
              }

              return breakdown || `
                <div class="tax-breakdown">
                  <div class="total-line">CGST (2.5%): ₹${(receipt.tax / 2).toFixed(2)}</div>
                  <div class="total-line">SGST (2.5%): ₹${(receipt.tax / 2).toFixed(2)}</div>
                </div>
              `
            })()}
          ` : ''}
          ${receipt.tip > 0 ? `
            <div class="total-line">
              <span>${receipt.tipStaffName ? `Tip (${receipt.tipStaffName}):` : 'Tip:'}</span>
              <span>₹${receipt.tip.toFixed(2)}</span>
            </div>
          ` : ''}
          ${receipt.roundOff && Math.abs(receipt.roundOff) > 0.01 ? `
            <div class="total-line round-off">
              <span>Round Off:</span>
              <span>₹${receipt.roundOff.toFixed(2)}</span>
            </div>
          ` : ''}
          <div class="total-line total-amount">
            <span>TOTAL:</span>
            <span>₹${receipt.total.toFixed(2)}</span>
          </div>
          ${(() => {
            const totalPaid = (receipt.payments || []).reduce((sum, p) => sum + (p?.amount || 0), 0)
            const outstanding = receipt.total - totalPaid
            const outstandingStyle = outstanding > 0 ? ' style="color: #dc2626; font-weight: 500;"' : ''
            return `
          <div class="total-line" style="margin-top: 6px;">
            <span>Total Paid:</span>
            <span>₹${totalPaid.toFixed(2)}</span>
          </div>
          <div class="total-line" style="margin-top: 4px;"${outstandingStyle}>
            <span>Outstanding:</span>
            <span>₹${outstanding.toFixed(2)}</span>
          </div>
          `
          })()}
        </div>

        <div class="payments">
          <div style="font-weight: bold; margin-bottom: 4px;">Payment Method(s):</div>
          ${receipt.payments.map(payment => `
            <div class="payment-line">
              <span>${payment.type === 'cash' ? 'Cash' : payment.type === 'card' ? 'Card' : 'Online'}:</span>
              <span>₹${payment.amount.toFixed(2)}</span>
            </div>
          `).join('')}
        </div>

        <div class="footer">
          <div>Thank you for visiting!</div>
          <div>We appreciate your business</div>
          <div style="margin-top: 8px;">
            Follow us on social media<br>
            ${businessSettings.socialMedia || "@glamoursalon"}
          </div>
        </div>
        ${(() => {
          const stamp = getReceiptPaymentStamp(receipt as any, receipt.total)
          return `<div class="payment-stamp" style="border: 2px solid ${stamp.color}; color: ${stamp.color};">${stamp.checkPrefix}${stamp.label}</div>`
        })()}
      </body>
      </html>
    `
  }

  const printThermalReceipt = () => {
    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(generateThermalReceiptHTML())
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 250)
    }
  }

  return {
    generateThermalReceiptHTML,
    printThermalReceipt,
  }
}
