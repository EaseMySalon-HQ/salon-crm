"use client"

import { Receipt } from "@/lib/data"
import { formatReceiptDiscountPercent } from "@/lib/receipt-discount-format"
import { formatReceiptItemStaffNames } from "@/lib/receipt-staff-format"
import { receiptWalkInSaleLabel } from "@/lib/receipt-line-source"
import { getReceiptPaymentStamp } from "@/lib/receipt-payment-stamp"
import { formatPaymentRecordedDateLabelFromIso, receiptPaymentTypeDisplayName } from "@/lib/sale-payment-lines"
import { getReceiptSettlementSummary } from "@/lib/receipt-settlement-summary"
import { buildReceiptRefundsSectionHtml } from "@/lib/receipt-refunds"
import { receiptTipDisplayLines } from "@/lib/receipt-tip-lines"
import {
  buildReceiptTaxDetailHtml,
  renderReceiptTotalsHtml,
} from "@/lib/receipt-totals-breakdown"
import { getThermalPaperWidthMm, resolveReceiptPaperSize } from "@/lib/receipt-paper-size"
import { shouldShowGstOnClientReceipt } from "@/lib/should-show-gst-on-client-receipt"

const thermalFormat = (amount: number) => `₹${amount.toFixed(2)}`

/** Thermal HTML rows for split tips (one line per staff). */
function thermalTipRowsHtml(receipt: Receipt): string {
  if ((receipt.tip || 0) <= 0) return ""
  return receiptTipDisplayLines(receipt)
    .map(
      (line) => `
            <div class="total-line">
              <span>${line.staffName ? `Tip (${line.staffName}):` : "Tip:"}</span>
              <span>₹${line.amount.toFixed(2)}</span>
            </div>`,
    )
    .join("")
}

/** Shared thermal HTML block: TOTAL … Total Paid (Bill). */
function buildThermalSettlementTotals(receipt: Receipt): string {
  const s = getReceiptSettlementSummary(receipt)
  let h = `
            <div class="total-line total-amount">
              <span>TOTAL:</span>
              <span>₹${s.billTotal.toFixed(2)}</span>
            </div>`
  if (s.showReceivedAndAdjusted) {
    h += `
            <div class="total-line" style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #000;">
              <span>Amount Received:</span>
              <span>₹${s.amountReceived.toFixed(2)}</span>
            </div>
            <div class="total-line">
              <span>Adjusted:</span>
              <span>₹${s.paidTowardBill.toFixed(2)}</span>
            </div>`
    if (s.showWalletCreditLine) {
      h += `
            <div class="total-line">
              <span>Wallet Credit:</span>
              <span>₹${s.walletCredit.toFixed(2)}</span>
            </div>`
    }
    if (s.showOutstandingLine) {
      h += `
            <div class="total-line" style="color: #dc2626; font-weight: 600;">
              <span>Outstanding:</span>
              <span>₹${s.outstanding.toFixed(2)}</span>
            </div>`
    }
  }
  h += `
            <div class="total-line" style="margin-top: 8px; padding-top: 6px; border-top: ${
              s.showReceivedAndAdjusted ? "2px solid #000" : "1px dashed #000"
            };">
              <span>Total Paid (Bill):</span>
              <span>₹${s.effectivePaidTowardBill.toFixed(2)}</span>
            </div>`
  return h
}

function formatThermalItemDiscount(item: Receipt["items"][number]): string {
  if ((item.discount || 0) <= 0) return "-"
  return item.discountType === "percentage"
    ? formatReceiptDiscountPercent(item.discount)
    : `₹${item.discount.toFixed(2)}`
}

function formatThermalItemTaxRate(item: Receipt["items"][number]): string {
  const rate = (item as { taxRate?: number }).taxRate ?? 0
  return rate > 0 ? `${rate}%` : "-"
}

function buildThermalItemBlock(
  item: Receipt["items"][number],
  detailFontPx: number,
  nameFontPx: number
): string {
  const staffLabel = formatReceiptItemStaffNames(item)
  const walkInLabel = receiptWalkInSaleLabel(item.lineSource)
  const hsn = (item as { hsnSacCode?: string }).hsnSacCode || ""
  const qtySuffix = item.quantity > 1 ? ` x${item.quantity}` : ""

  const metaLines = [
    staffLabel ? `<div class="item-block-meta">Staff: ${staffLabel}</div>` : "",
    walkInLabel ? `<div class="item-block-meta item-block-walkin">${walkInLabel}</div>` : "",
    hsn ? `<div class="item-block-meta">HSN: ${hsn}</div>` : "",
  ]
    .filter(Boolean)
    .join("")

  return `
    <div class="item-block">
      <div class="item-block-name" style="font-size: ${nameFontPx}px;">${item.name}${qtySuffix}</div>
      ${metaLines}
      <div class="item-detail-line" style="font-size: ${detailFontPx}px;">
        <span class="item-detail-label">Price</span>
        <span class="item-detail-value">₹${item.price.toFixed(2)}</span>
      </div>
      <div class="item-detail-line" style="font-size: ${detailFontPx}px;">
        <span class="item-detail-label">Disc</span>
        <span class="item-detail-value">${formatThermalItemDiscount(item)}</span>
      </div>
      <div class="item-detail-line" style="font-size: ${detailFontPx}px;">
        <span class="item-detail-label">Tax Rate</span>
        <span class="item-detail-value">${formatThermalItemTaxRate(item)}</span>
      </div>
      <div class="item-detail-line item-detail-total" style="font-size: ${detailFontPx}px;">
        <span class="item-detail-label">Total</span>
        <span class="item-detail-value">₹${item.total.toFixed(2)}</span>
      </div>
    </div>`
}

function buildThermalItemsSectionHtml(receipt: Receipt, paperSize: string): string {
  const detailFontPx = paperSize === "57mm" ? 14 : 16
  const nameFontPx = paperSize === "57mm" ? 16 : 18

  return `
          <div class="items">
            <div class="items-section-title">ITEMS</div>
            ${receipt.items.map((item) => buildThermalItemBlock(item, detailFontPx, nameFontPx)).join("")}
          </div>`
}

function getThermalLayoutCss(detailFontPx: number, metaFontPx: number): string {
  return `
          .items {
            border-bottom: 1px dashed #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .items-section-title {
            font-size: ${detailFontPx}px;
            font-weight: bold;
            border-bottom: 1px solid #000;
            padding-bottom: 4px;
            margin-bottom: 6px;
            letter-spacing: 0.04em;
          }
          .item-block {
            border-bottom: 1px dashed #999;
            padding-bottom: 6px;
            margin-bottom: 6px;
            word-wrap: break-word;
            overflow-wrap: anywhere;
          }
          .item-block:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
          }
          .item-block-name {
            font-weight: bold;
            margin-bottom: 2px;
            line-height: 1.25;
          }
          .item-block-meta {
            font-size: ${metaFontPx}px;
            color: #555;
            margin-bottom: 2px;
            line-height: 1.2;
          }
          .item-block-walkin {
            color: #92400e;
          }
          .item-detail-line {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            margin-top: 2px;
            line-height: 1.25;
          }
          .item-detail-label {
            flex: 0 0 auto;
            min-width: 4.5em;
          }
          .item-detail-value {
            flex: 1 1 auto;
            text-align: right;
            white-space: nowrap;
          }
          .item-detail-total {
            margin-top: 4px;
            padding-top: 2px;
            border-top: 1px dotted #999;
            font-weight: bold;
          }
          .total-line {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 8px;
            margin-bottom: 2px;
            font-weight: bold;
          }
          .total-line > span:first-child {
            flex: 1 1 auto;
            min-width: 0;
            word-break: break-word;
          }
          .total-line > span:last-child {
            flex: 0 0 auto;
            text-align: right;
            white-space: nowrap;
          }`
}

interface ThermalReceiptGeneratorProps {
  receipt: Receipt
  businessSettings?: any
}

export function ThermalReceiptGenerator({ receipt, businessSettings }: ThermalReceiptGeneratorProps) {
  const paperSize = resolveReceiptPaperSize(businessSettings)
  const paperWidthMm = getThermalPaperWidthMm(paperSize)
  const baseFontPx = paperSize === "57mm" ? 16 : 20
  const businessNameFontPx = paperSize === "57mm" ? 20 : 25
  const infoFontPx = paperSize === "57mm" ? 14 : 17

  const generateThermalReceiptHTML = () => {
    const detailFontPx = paperSize === "57mm" ? 14 : 16
    const metaFontPx = paperSize === "57mm" ? 12 : 14
    const itemsHtml = buildThermalItemsSectionHtml(receipt, paperSize)
    const layoutCss = getThermalLayoutCss(detailFontPx, metaFontPx)

    const pageCss = `
            html {
              overflow-x: hidden;
              margin: 0;
              padding: 0;
            }
            @page {
              size: ${paperWidthMm}mm 200mm;
              margin: 0;
              padding: 0;
            }`
    const bodyCss = `
            font-family: 'Courier New', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: ${baseFontPx}px;
            font-weight: bold;
            line-height: 1.3;
            margin: 0;
            padding: 2mm 0mm 0mm 0mm;
            width: ${paperWidthMm}mm;
            max-width: ${paperWidthMm}mm;
            overflow-x: hidden;
            box-sizing: border-box;
            background: white;
            color: black;
            -webkit-font-smoothing: none;
            -moz-osx-font-smoothing: auto;
            text-rendering: optimizeSpeed;
            font-smooth: never;`

    if (!businessSettings) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Thermal Receipt - ${receipt.receiptNumber}</title>
          <style>
            ${pageCss}
          body {
            ${bodyCss}
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
            ${layoutCss}
            .totals {
              margin-bottom: 8px;
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

          ${itemsHtml}

          <div class="totals">
            ${renderReceiptTotalsHtml(receipt, thermalFormat, {
              taxDetailHtml: buildReceiptTaxDetailHtml(receipt, thermalFormat),
              skipGrandTotal: true,
            })}
            ${buildThermalSettlementTotals(receipt)}
          </div>

          <div class="payments">
            <div style="font-weight: bold; margin-bottom: 4px;">Payment Method(s):</div>
            ${receipt.payments
              .map((payment) => {
                const displayName = receiptPaymentTypeDisplayName(payment.type)
                const d = formatPaymentRecordedDateLabelFromIso(payment.recordedAt)
                const label = d ? `${displayName} (${d})` : displayName
                return `
              <div class="payment-line">
                <span>${label}:</span>
                <span>₹${payment.amount.toFixed(2)}</span>
              </div>
            `
              })
              .join("")}
        </div>
        ${buildReceiptRefundsSectionHtml(getReceiptSettlementSummary(receipt).refundLines, thermalFormat)}

          <div class="footer">
            <div>Thank you for visiting!</div>
            <div>We appreciate your business</div>
            <div style="margin-top: 8px;">
              Follow us on social media<br>
              @glamoursalon
            </div>
          </div>
          ${(() => {
            const stamp = getReceiptPaymentStamp(receipt as any, getReceiptSettlementSummary(receipt).billTotal)
            return `<div class="payment-stamp" style="border: 2px solid ${stamp.color}; color: ${stamp.color};">${stamp.checkPrefix}${stamp.label}</div>`
          })()}
        </body>
        </html>
      `
    }

    const showGstOnReceipt = shouldShowGstOnClientReceipt(businessSettings)

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Thermal Receipt - ${receipt.receiptNumber}</title>
        <style>
          ${pageCss}
          @media print {
            ${pageCss}
            body {
              -webkit-print-color-adjust: exact;
              color-adjust: exact;
            }
          }
          body {
            ${bodyCss}
          }
          .business-name {
            font-size: ${businessNameFontPx}px;
            font-weight: bold;
            margin-bottom: 4px;
            letter-spacing: 0.5px;
          }
          .business-info {
            font-size: ${infoFontPx}px;
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
          ${layoutCss}
          .totals {
            margin-bottom: 8px;
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
          ${showGstOnReceipt ? `<div class="business-info">GST: ${businessSettings.gstNumber}</div>` : ''}
        </div>

        <div class="receipt-info">
          <div><strong>Receipt #:</strong> ${receipt.receiptNumber}</div>
          <div><strong>Date:</strong> ${new Date(receipt.date).toLocaleDateString()}</div>
          <div><strong>Time:</strong> ${receipt.time}</div>
          <div><strong>Client:</strong> ${receipt.clientName}</div>
          <div><strong>Phone:</strong> ${receipt.clientPhone}</div>
        </div>

        ${itemsHtml}

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
          ${thermalTipRowsHtml(receipt)}
          ${receipt.roundOff && Math.abs(receipt.roundOff) > 0.01 ? `
            <div class="total-line round-off">
              <span>Round Off:</span>
              <span>₹${receipt.roundOff.toFixed(2)}</span>
            </div>
          ` : ''}
          ${buildThermalSettlementTotals(receipt)}
        </div>

        <div class="payments">
          <div style="font-weight: bold; margin-bottom: 4px;">Payment Method(s):</div>
          ${receipt.payments
            .map((payment) => {
              const displayName = receiptPaymentTypeDisplayName(payment.type)
              const d = formatPaymentRecordedDateLabelFromIso(payment.recordedAt)
              const label = d ? `${displayName} (${d})` : displayName
              return `
            <div class="payment-line">
              <span>${label}:</span>
              <span>₹${payment.amount.toFixed(2)}</span>
            </div>
          `
            })
            .join("")}
        </div>
        ${buildReceiptRefundsSectionHtml(getReceiptSettlementSummary(receipt).refundLines, thermalFormat)}

        <div class="footer">
          <div>Thank you for visiting!</div>
          <div>We appreciate your business</div>
          <div style="margin-top: 8px;">
            Follow us on social media<br>
            ${businessSettings.socialMedia || "@glamoursalon"}
          </div>
        </div>
        ${(() => {
          const stamp = getReceiptPaymentStamp(receipt as any, getReceiptSettlementSummary(receipt).billTotal)
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
