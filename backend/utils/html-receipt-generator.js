const puppeteer = require('puppeteer');

/**
 * Format currency (backend version of frontend formatCurrency)
 */
function formatCurrency(amount, businessSettings) {
  if (!businessSettings?.enableCurrency) {
    return amount.toFixed(2);
  }

  const currency = businessSettings.currency || 'INR';
  const symbols = {
    'INR': '₹',
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'CAD': 'C$'
  };
  
  const symbol = symbols[currency] || currency;
  
  try {
    // Use Intl.NumberFormat for proper formatting
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    // Fallback to simple formatting
    return `${symbol}${amount.toFixed(2)}`;
  }
}

/**
 * Generate HTML receipt (same as frontend ReceiptGenerator)
 */
function generateReceiptHTML(receipt, businessSettings) {
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
    `;
  }

  // Calculate correct tax amounts
  const calculateCorrectTaxAmount = () => {
    if (receipt.taxBreakdown) {
      const serviceTax = receipt.taxBreakdown.serviceTax || 0;
      const productTaxTotal = Object.values(receipt.taxBreakdown.productTaxByRate || {}).reduce((sum, amount) => sum + amount, 0);
      return serviceTax + productTaxTotal;
    }
    return receipt.tax || 0;
  };

  const calculateCorrectTotal = () => {
    const preRoundTotal = (receipt.subtotal || 0) - (receipt.discount || 0) + (receipt.tip || 0);
    const roundedTotal = Math.round(preRoundTotal);
    return roundedTotal;
  };

  const correctTaxAmount = calculateCorrectTaxAmount();
  const correctTotal = calculateCorrectTotal();

  // Format address
  const addressLine = businessSettings.address 
    ? `${businessSettings.address}, ${businessSettings.city || ''}, ${businessSettings.state || ''} ${businessSettings.zipCode || ''}`.replace(/,\s*,/g, ',').replace(/,\s*$/, '')
    : '';

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
        <div class="salon-name">${businessSettings.name || 'Business'}</div>
        ${addressLine ? `<div class="salon-info">${addressLine}</div>` : ''}
        ${businessSettings.phone ? `<div class="salon-info">Phone: ${businessSettings.phone}</div>` : ''}
        ${businessSettings.email ? `<div class="salon-info">Email: ${businessSettings.email}</div>` : ''}
        ${businessSettings.gstNumber ? `<div class="salon-info" style="font-weight: bold;">GST: ${businessSettings.gstNumber}</div>` : ''}
      </div>

      <div class="receipt-info">
        <div><strong>Receipt #:</strong> ${receipt.receiptNumber}</div>
        <div><strong>Date:</strong> ${receipt.date ? new Date(receipt.date).toLocaleDateString() : new Date().toLocaleDateString()}</div>
        ${receipt.time ? `<div><strong>Time:</strong> ${receipt.time}</div>` : ''}
        <div><strong>Client:</strong> ${receipt.clientName || receipt.customerName || 'N/A'}</div>
        ${(receipt.clientPhone || receipt.customerPhone) ? `<div><strong>Phone:</strong> ${receipt.clientPhone || receipt.customerPhone}</div>` : ''}
      </div>

      <div class="items">
        ${(receipt.items || []).map((item) => {
          return `
            <div class="item">
              <div class="item-header">
                <span>${item.name || 'Item'}</span>
                <span>${formatCurrency(item.total || item.price || 0, businessSettings)}</span>
              </div>
              <div class="item-details">
                ${item.quantity || 1} x ${formatCurrency(item.price || 0, businessSettings)}
                ${item.discount > 0 ? ` (${item.discountType === "percentage" ? item.discount + "%" : formatCurrency(item.discount, businessSettings)} off)` : ""}
                ${item.staffName ? ` - ${item.staffName}` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <div class="totals">
        <div class="total-line">
          <span>Subtotal:</span>
          <span>${formatCurrency(receipt.subtotal || 0, businessSettings)}</span>
        </div>
        ${(receipt.discount || 0) > 0 ? `
          <div class="total-line">
            <span>Discount:</span>
            <span>-${formatCurrency(receipt.discount, businessSettings)}</span>
          </div>
        ` : ""}
        ${correctTaxAmount > 0 ? `
          <div class="total-line">
            <span>Tax (GST):</span>
            <span>${formatCurrency(correctTaxAmount, businessSettings)}</span>
          </div>
          ${(() => {
            if (receipt.taxBreakdown) {
              let breakdown = '';
              
              if (receipt.taxBreakdown.serviceTax > 0) {
                const serviceTax = receipt.taxBreakdown.serviceTax;
                const serviceRate = receipt.taxBreakdown.serviceRate || 5;
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
                `;
              }
              
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
                    `;
                  }
                });
              }
              
              return breakdown;
            }
            
            return `
              <div class="total-line" style="margin-left: 10px; font-size: 11px;">
                <span>CGST (${(businessSettings.taxRate || 18) / 2}%):</span>
                <span>${formatCurrency((receipt.tax || 0) / 2, businessSettings)}</span>
              </div>
              <div class="total-line" style="margin-left: 10px; font-size: 11px;">
                <span>SGST (${(businessSettings.taxRate || 18) / 2}%):</span>
                <span>${formatCurrency((receipt.tax || 0) / 2, businessSettings)}</span>
              </div>
            `;
          })()}
        ` : ""}
        ${(receipt.tip || 0) > 0 ? `
          <div class="total-line">
            <span>${receipt.tipStaffName ? `Tip (${receipt.tipStaffName}):` : 'Tip:'}</span>
            <span>${formatCurrency(receipt.tip, businessSettings)}</span>
          </div>
        ` : ""}
        ${receipt.roundOff && Math.abs(receipt.roundOff) > 0.01 ? `
          <div class="total-line">
            <span>Round Off:</span>
            <span>${formatCurrency(receipt.roundOff, businessSettings)}</span>
          </div>
        ` : ""}
        <div class="total-line grand-total">
          <span>TOTAL:</span>
          <span>${formatCurrency(correctTotal, businessSettings)}</span>
        </div>
      </div>

      <div class="payments">
        <div style="font-weight: bold; margin-bottom: 5px;">Payment Method(s):</div>
        ${(receipt.payments || []).map((payment) => {
          if (!payment || !payment.type) {
            return `
              <div class="payment-line">
                <span>Unknown:</span>
                <span>${formatCurrency(payment?.amount || 0, businessSettings)}</span>
              </div>
            `;
          }
          
          let displayName = 'Unknown';
          if (payment.type === 'cash') displayName = 'Cash';
          if (payment.type === 'card') displayName = 'Card';
          if (payment.type === 'online') displayName = 'Online';
          if (payment.type === 'unknown') displayName = 'Unknown';
          
          return `
            <div class="payment-line">
              <span>${displayName}:</span>
              <span>${formatCurrency(payment.amount || 0, businessSettings)}</span>
            </div>
          `;
        }).join("")}
      </div>

      <div class="footer">
        <div>Thank you for visiting!</div>
        <div>We appreciate your business</div>
        ${businessSettings.socialMedia ? `
          <div style="margin-top: 10px;">
            Follow us on social media<br>
            ${businessSettings.socialMedia}
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate PDF from HTML receipt using Puppeteer
 */
async function generateReceiptPDFFromHTML(receipt, businessSettings) {
  let browser;
  try {
    const html = generateReceiptHTML(receipt, businessSettings);
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set content
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm'
      }
    });
    
    await browser.close();
    
    return pdfBuffer;
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

module.exports = {
  generateReceiptHTML,
  generateReceiptPDFFromHTML,
  formatCurrency
};



