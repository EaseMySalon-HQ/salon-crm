/**
 * GST tax-invoice PDF generator for wallet recharges.
 *
 * Emits an A4 invoice buffer with:
 *   - Seller / buyer blocks (with GSTIN when available)
 *   - A single line item ("Wallet recharge — prepaid messaging credits",
 *     HSN/SAC 998399) at the pre-tax base amount
 *   - GST split: CGST + SGST (intra-state) or IGST (inter-state), based on
 *     seller vs buyer state
 *   - Payment reference block (provider, payment id, order id, date)
 *
 * Inputs are plain JS objects; callers are responsible for looking up the
 * Business / WalletTransaction / AdminSettings and assembling the `context`.
 */

'use strict';

const PDFDocument = require('pdfkit');

// Standard SAC code for OIDAR / information technology services in India.
// 998399 = "Other professional, technical and business services".
const DEFAULT_SAC = '998399';

// ──────────────────────────────────────────────────────────────────────────
// Small formatting helpers
// ──────────────────────────────────────────────────────────────────────────

function paiseToRupeesNumber(p) {
  return Math.round(Number(p || 0)) / 100;
}

function formatRupees(p, { withSymbol = true } = {}) {
  const value = paiseToRupeesNumber(p);
  const formatted = value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `Rs. ${formatted}` : formatted;
}

function formatDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function safeString(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function joinTruthy(parts, sep = ', ') {
  return parts.map(safeString).filter(Boolean).join(sep);
}

// ──────────────────────────────────────────────────────────────────────────
// GST split helper
// ──────────────────────────────────────────────────────────────────────────

/**
 * Decide the CGST/SGST vs IGST split for a given GST amount.
 *   - Same-state supply (seller.stateCode === buyer.stateCode): CGST + SGST,
 *     each at half the overall rate.
 *   - Otherwise: IGST at the full rate.
 * Returns paise amounts that always sum to gstPaise exactly (the 1-paise
 * rounding slop between `half` and `gstPaise - half` is absorbed into SGST).
 */
function splitGst({ gstPaise, gstRate, sellerStateCode, buyerStateCode }) {
  const totalPaise = Math.max(0, Math.round(Number(gstPaise) || 0));
  const rate = Number(gstRate) || 0;

  const a = safeString(sellerStateCode).toLowerCase();
  const b = safeString(buyerStateCode).toLowerCase();
  const sameState = a && b && a === b;

  if (sameState) {
    const half = Math.round(totalPaise / 2);
    return {
      mode: 'cgst_sgst',
      cgstPaise: half,
      sgstPaise: totalPaise - half,
      igstPaise: 0,
      cgstRate: rate / 2,
      sgstRate: rate / 2,
      igstRate: 0,
    };
  }

  return {
    mode: 'igst',
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: totalPaise,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: rate,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// PDF layout helpers
// ──────────────────────────────────────────────────────────────────────────

function drawHR(doc, y) {
  doc.save()
    .strokeColor('#e2e8f0')
    .lineWidth(0.5)
    .moveTo(40, y)
    .lineTo(doc.page.width - 40, y)
    .stroke()
    .restore();
}

function drawTableRow(doc, y, columns, { bold = false, fillColor = null } = {}) {
  const pageLeft = 40;
  const pageRight = doc.page.width - 40;

  if (fillColor) {
    doc.save()
      .rect(pageLeft, y - 2, pageRight - pageLeft, 22)
      .fillColor(fillColor)
      .fill()
      .restore();
  }

  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);

  let x = pageLeft + 6;
  columns.forEach(col => {
    const width = col.width;
    const align = col.align || 'left';
    doc.fillColor('#0f172a').text(safeString(col.text), x, y + 3, {
      width: width - 12,
      align,
      ellipsis: true,
    });
    x += width;
  });
  doc.fillColor('#0f172a');
}

// ──────────────────────────────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────────────────────────────

/**
 * Generate the wallet-recharge tax invoice PDF.
 *
 * @param {Object} context
 * @param {Object} context.seller
 *   { name, addressLines[], gstin, stateCode, state, email, phone, website }
 * @param {Object} context.buyer
 *   { name, addressLines[], gstin, stateCode, state, email, phone }
 * @param {Object} context.invoice
 *   { number, date, placeOfSupply }
 * @param {Object} context.amounts
 *   { basePaise, gstPaise, gstRate, totalPaise }
 * @param {Object} context.payment
 *   { provider, orderId, paymentId, capturedAt }
 * @returns {Promise<Buffer>} PDF buffer
 */
function generateWalletInvoicePDF(context) {
  return new Promise((resolve, reject) => {
    try {
      const {
        seller = {},
        buyer = {},
        invoice = {},
        amounts = {},
        payment = {},
      } = context || {};

      // Line-item description / PDF subject are both overridable so this
      // generator can be reused for other tax-invoice surfaces (subscription
      // renewals, etc.) without duplicating the layout code.
      const lineItemDescription =
        safeString(invoice.lineItemDescription) ||
        'Wallet recharge — prepaid messaging credits';
      const subject =
        safeString(invoice.subject) || lineItemDescription;

      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Tax Invoice ${invoice.number || ''}`.trim(),
          Author: seller.name || 'EaseMySalon',
          Subject: subject,
        },
      });

      const buffers = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageLeft = 40;
      const pageRight = doc.page.width - 40;

      // ── Header ──────────────────────────────────────────────────────────
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(20).text(
        seller.name || 'EaseMySalon',
        pageLeft,
        40
      );

      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      const sellerLines = [
        ...(Array.isArray(seller.addressLines) ? seller.addressLines : []),
        joinTruthy([seller.email, seller.phone], ' • '),
        seller.website ? `Web: ${seller.website}` : '',
        seller.gstin ? `GSTIN: ${seller.gstin}` : '',
        seller.state ? `State: ${seller.state}${seller.stateCode ? ` (${seller.stateCode})` : ''}` : '',
      ].map(safeString).filter(Boolean);
      sellerLines.forEach((line, i) => {
        doc.text(line, pageLeft, 64 + i * 12);
      });

      // Top-right "TAX INVOICE" block
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16).text(
        'TAX INVOICE',
        pageLeft,
        40,
        { width: pageRight - pageLeft, align: 'right' }
      );
      doc.font('Helvetica').fontSize(10).fillColor('#475569');
      doc.text(`Invoice #: ${invoice.number || '—'}`, pageLeft, 62, {
        width: pageRight - pageLeft,
        align: 'right',
      });
      doc.text(`Date: ${formatDate(invoice.date)}`, pageLeft, 76, {
        width: pageRight - pageLeft,
        align: 'right',
      });
      if (invoice.placeOfSupply) {
        doc.text(
          `Place of Supply: ${invoice.placeOfSupply}`,
          pageLeft,
          90,
          { width: pageRight - pageLeft, align: 'right' }
        );
      }

      const headerBottomY = Math.max(
        64 + sellerLines.length * 12,
        110
      );
      drawHR(doc, headerBottomY + 4);

      // ── Bill To ────────────────────────────────────────────────────────
      const billStartY = headerBottomY + 16;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(
        'Bill To',
        pageLeft,
        billStartY
      );
      doc.font('Helvetica').fontSize(10).fillColor('#0f172a').text(
        safeString(buyer.name) || '—',
        pageLeft,
        billStartY + 14
      );
      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      const buyerLines = [
        ...(Array.isArray(buyer.addressLines) ? buyer.addressLines : []),
        joinTruthy([buyer.email, buyer.phone], ' • '),
        buyer.gstin ? `GSTIN: ${buyer.gstin}` : '',
        buyer.state ? `State: ${buyer.state}${buyer.stateCode ? ` (${buyer.stateCode})` : ''}` : '',
      ].map(safeString).filter(Boolean);
      buyerLines.forEach((line, i) => {
        doc.text(line, pageLeft, billStartY + 30 + i * 12);
      });

      const buyerBlockBottomY = billStartY + 30 + Math.max(1, buyerLines.length) * 12;

      // ── Line-item table ─────────────────────────────────────────────────
      const tableY = buyerBlockBottomY + 14;
      const columns = [
        { key: 'desc', label: 'Description', width: 260, align: 'left' },
        { key: 'sac', label: 'HSN/SAC', width: 70, align: 'center' },
        { key: 'qty', label: 'Qty', width: 40, align: 'center' },
        { key: 'rate', label: 'Rate', width: 85, align: 'right' },
        { key: 'amount', label: 'Amount', width: 60, align: 'right' },
      ];

      drawTableRow(
        doc,
        tableY,
        columns.map(c => ({ text: c.label, width: c.width, align: c.align })),
        { bold: true, fillColor: '#f1f5f9' }
      );

      const rowY = tableY + 24;
      const basePaise = Math.round(Number(amounts.basePaise) || 0);
      drawTableRow(
        doc,
        rowY,
        [
          { text: lineItemDescription, width: 260, align: 'left' },
          { text: invoice.sac || DEFAULT_SAC, width: 70, align: 'center' },
          { text: '1', width: 40, align: 'center' },
          { text: formatRupees(basePaise), width: 85, align: 'right' },
          { text: formatRupees(basePaise), width: 60, align: 'right' },
        ]
      );
      drawHR(doc, rowY + 20);

      // ── Totals block ───────────────────────────────────────────────────
      const gstPaise = Math.round(Number(amounts.gstPaise) || 0);
      const gstRate = Number(amounts.gstRate) || 0;
      const totalPaise = Math.round(
        Number(amounts.totalPaise) || basePaise + gstPaise
      );

      const gstSplit = splitGst({
        gstPaise,
        gstRate,
        sellerStateCode: seller.stateCode,
        buyerStateCode: buyer.stateCode,
      });

      const totalsStartY = rowY + 30;
      const labelX = pageRight - 260;
      const valueX = pageRight - 110;
      const labelWidth = 160;
      const valueWidth = 110;
      let cursorY = totalsStartY;

      function totalsRow(label, value, { bold = false } = {}) {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#0f172a');
        doc.text(label, labelX, cursorY, { width: labelWidth, align: 'left' });
        doc.text(value, valueX, cursorY, { width: valueWidth, align: 'right' });
        cursorY += 16;
      }

      totalsRow('Subtotal (Taxable Value)', formatRupees(basePaise));
      if (gstSplit.mode === 'cgst_sgst') {
        totalsRow(
          `CGST @ ${(gstSplit.cgstRate * 100).toFixed(2)}%`,
          formatRupees(gstSplit.cgstPaise)
        );
        totalsRow(
          `SGST @ ${(gstSplit.sgstRate * 100).toFixed(2)}%`,
          formatRupees(gstSplit.sgstPaise)
        );
      } else {
        totalsRow(
          `IGST @ ${(gstSplit.igstRate * 100).toFixed(2)}%`,
          formatRupees(gstSplit.igstPaise)
        );
      }

      // Grand total row — highlighted
      doc.save()
        .rect(labelX - 10, cursorY - 4, pageRight - (labelX - 10), 24)
        .fillColor('#0f172a')
        .fill()
        .restore();
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff');
      doc.text('Grand Total', labelX, cursorY + 2, {
        width: labelWidth,
        align: 'left',
      });
      doc.text(formatRupees(totalPaise), valueX, cursorY + 2, {
        width: valueWidth,
        align: 'right',
      });
      cursorY += 32;

      // ── Payment details ────────────────────────────────────────────────
      drawHR(doc, cursorY + 6);
      cursorY += 20;

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(
        'Payment Details',
        pageLeft,
        cursorY
      );
      cursorY += 18;

      doc.font('Helvetica').fontSize(9.5).fillColor('#334155');
      const paymentRows = [
        ['Provider', safeString(payment.provider).toUpperCase() || '—'],
        ['Order ID', safeString(payment.orderId) || '—'],
        ['Payment ID', safeString(payment.paymentId) || '—'],
        ['Captured At', formatDate(payment.capturedAt || invoice.date)],
      ];
      paymentRows.forEach(([k, v]) => {
        doc.font('Helvetica').fillColor('#64748b').text(k, pageLeft, cursorY, {
          width: 120,
          align: 'left',
        });
        doc.font('Helvetica').fillColor('#0f172a').text(v, pageLeft + 120, cursorY, {
          width: pageRight - pageLeft - 120,
          align: 'left',
        });
        cursorY += 14;
      });

      // ── Footer notes ───────────────────────────────────────────────────
      cursorY += 14;
      drawHR(doc, cursorY);
      cursorY += 10;
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#64748b').text(
        'This is a computer-generated invoice. No signature required.\n' +
          'Amounts are in Indian Rupees (INR). GST collected is payable to the Government.',
        pageLeft,
        cursorY,
        { width: pageRight - pageLeft, align: 'left' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateWalletInvoicePDF,
  splitGst,
};
