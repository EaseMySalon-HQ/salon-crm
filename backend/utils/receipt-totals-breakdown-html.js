/**
 * Server-side receipt totals bifurcation HTML (mirrors lib/receipt-totals-breakdown.ts).
 */

const EPS = 0.015;

function fmt(amount, formatCurrency, businessSettings) {
  return formatCurrency(amount, businessSettings);
}

function renderRow(label, amount, formatCurrency, businessSettings, opts = {}) {
  const isDiscount = amount < -EPS;
  const display = isDiscount
    ? `-${fmt(Math.abs(amount), formatCurrency, businessSettings)}`
    : fmt(amount, formatCurrency, businessSettings);
  const color = opts.discount ? 'color: #047857;' : '';
  const style = opts.grand
    ? 'font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 6px; margin-top: 4px;'
    : '';
  return `
    <div class="total-line" style="${style}">
      <span style="${color}">${label}:</span>
      <span style="${color}">${display}</span>
    </div>`;
}

function renderTaxDetail(receipt, formatCurrency, businessSettings) {
  if (!(receipt.tax > EPS)) return '';
  if (receipt.taxBreakdown) {
    let html = '';
    if (receipt.taxBreakdown.serviceTax > EPS) {
      const serviceTax = receipt.taxBreakdown.serviceTax;
      const serviceRate = receipt.taxBreakdown.serviceRate || 5;
      html += `
        <div class="total-line" style="margin-left: 10px; font-size: 11px;">
          <span>Service Tax (${serviceRate}%):</span>
          <span>${fmt(serviceTax, formatCurrency, businessSettings)}</span>
        </div>`;
    }
    if (receipt.taxBreakdown.productTaxByRate) {
      for (const [rate, amount] of Object.entries(receipt.taxBreakdown.productTaxByRate)) {
        if (Number(amount) > EPS) {
          html += `
        <div class="total-line" style="margin-left: 10px; font-size: 11px;">
          <span>Product Tax (${rate}%):</span>
          <span>${fmt(Number(amount), formatCurrency, businessSettings)}</span>
        </div>`;
        }
      }
    }
    return html;
  }
  return `
    <div class="total-line" style="margin-left: 10px; font-size: 11px;">
      <span>CGST (2.5%):</span>
      <span>${fmt((receipt.tax || 0) / 2, formatCurrency, businessSettings)}</span>
    </div>`;
}

function renderReceiptTotalsBreakdownHtml(receipt, formatCurrency, businessSettings, correctTotal) {
  const b = receipt.receiptTotalsBreakdown || receipt.totalsBreakdown;
  if (!b) return null;

  let html = '';
  html += renderRow('Total Amount (Excl. GST)', b.grossPreTaxTotal, formatCurrency, businessSettings);
  if (b.lineDiscountAmount > EPS) {
    html += renderRow('Item Discount', -b.lineDiscountAmount, formatCurrency, businessSettings, { discount: true });
  }
  if (b.membershipDiscountAmount > EPS) {
    html += renderRow('Membership Discount', -b.membershipDiscountAmount, formatCurrency, businessSettings, {
      discount: true,
    });
  }
  if (b.totalBeforeCartInclTax != null && b.cartDiscountAmount > EPS) {
    html += renderRow('Due (incl. GST, before cart)', b.totalBeforeCartInclTax, formatCurrency, businessSettings);
  }
  if (b.cartDiscountAmount > EPS) {
    html += renderRow(b.cartDiscountLabel || 'Cart Discount', -b.cartDiscountAmount, formatCurrency, businessSettings, {
      discount: true,
    });
  }
  html += renderRow('Subtotal (Excl. GST)', b.subtotalPreTax, formatCurrency, businessSettings);
  if (b.taxAmount > EPS) {
    html += `
      <div class="total-line">
        <span>Tax (GST):</span>
        <span>${fmt(b.taxAmount, formatCurrency, businessSettings)}</span>
      </div>
      ${renderTaxDetail(receipt, formatCurrency, businessSettings)}`;
  }
  html += renderRow('Total', b.totalInclTax, formatCurrency, businessSettings);
  if (Math.abs(b.roundOff || 0) > EPS) {
    html += renderRow('Round Off', b.roundOff, formatCurrency, businessSettings);
  }
  if (b.loyaltyDiscountAmount > EPS) {
    html += renderRow('Points Discount', -b.loyaltyDiscountAmount, formatCurrency, businessSettings, {
      discount: true,
    });
  }
  if (b.tip > EPS) {
    html += renderRow('Tip', b.tip, formatCurrency, businessSettings);
  }
  html += renderRow('TOTAL', correctTotal ?? b.grandTotal, formatCurrency, businessSettings, { grand: true });
  return html;
}

module.exports = { renderReceiptTotalsBreakdownHtml };
