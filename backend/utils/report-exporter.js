const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { logger } = require('./logger');
const { billChangeCreditedToWalletCashAddition } = require('./bill-change-wallet-cash');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');
const { toDateStringIST } = require('./date-utils');
const { throwIfPlatformEmailDisabled } = require('../lib/business-email-policy');

/**
 * Report export delivery: all tenant Users with role admin (login admins) plus Staff with
 * role manager/staff who have email on and preferences.allowReportsDelivery.
 */
async function getReportExportRecipientList(branchId, mainConnection, businessModels) {
  const User = mainConnection.model('User', require('../models/User').schema);
  const { Staff } = businessModels;
  const [adminUsers, reportStaff] = await Promise.all([
    User.find({
      branchId,
      role: 'admin',
      email: { $exists: true, $ne: '' },
    }).lean(),
    Staff.find({
      branchId,
      role: { $in: ['manager', 'staff'] },
      isActive: true,
      email: { $exists: true, $ne: '' },
      'emailNotifications.enabled': true,
      'emailNotifications.preferences.allowReportsDelivery': true,
    })
      .select('email')
      .lean(),
  ]);
  const seen = new Set();
  const recipients = [];
  for (const u of adminUsers) {
    const e = (u.email || '').trim().toLowerCase();
    if (e && !seen.has(e)) {
      seen.add(e);
      recipients.push({ email: u.email.trim() });
    }
  }
  for (const s of reportStaff) {
    const e = (s.email || '').trim().toLowerCase();
    if (e && !seen.has(e)) {
      seen.add(e);
      recipients.push({ email: s.email.trim() });
    }
  }
  return recipients;
}

/**
 * Shared PDF design tokens used by all report exports.
 * Keep these in sync with the rest of the product styling (slate + blue accent).
 */
const PDF_THEME = {
  accent: '#2563EB',      // blue-600 – stripes, accent bar, table header underline
  accentSoft: '#DBEAFE',  // blue-100 – tint backgrounds (reserved)
  textPrimary: '#0F172A', // slate-900 – titles, values, body text
  textMuted: '#475569',   // slate-600 – subtitles, secondary labels
  textSubtle: '#94A3B8',  // slate-400 – footer chrome
  border: '#E2E8F0',      // slate-200 – cards, table dividers
  rowAlt: '#F8FAFC',      // slate-50 – zebra rows
  headerBg: '#F1F5F9',    // slate-100 – table header background
  cardBg: '#FFFFFF',
};

const PDF_MARGIN = 50;

/** PDF standard fonts (Helvetica) omit ₹ (U+20B9); viewers often draw a bogus glyph resembling a superscript "1". */
const PDF_RS = 'Rs. ';

function pdfRsAmount(amount) {
  const n = Number(amount);
  return `${PDF_RS}${Number.isFinite(n) ? n.toFixed(2) : '0.00'}`;
}

/**
 * Paint page chrome (top accent bar + bottom brand/page-number).
 *
 * Every text call here uses `lineBreak: true, height: ...` — PDFKit will
 * silently auto-paginate any `.text` near the page bottom unless a height
 * is bounded, which would cascade pages and break the layout.
 */
function _paintPageChrome(doc) {
  const w = doc.page.width;
  const h = doc.page.height;

  doc.save();
  doc.rect(0, 0, w, 3).fill(PDF_THEME.accent);
  doc.restore();

  const footerY = h - 18;
  const halfW = (w - PDF_MARGIN * 2) / 2;

  doc.save();
  doc.fillColor(PDF_THEME.textSubtle).font('Helvetica').fontSize(7.5);
  doc.text('EaseMySalon', PDF_MARGIN, footerY, {
    width: halfW,
    align: 'left',
    lineBreak: true,
    height: 10,
  });
  const pageNo = doc._emsPageCount || 1;
  doc.text(`Page ${pageNo}`, w / 2, footerY, {
    width: halfW,
    align: 'right',
    lineBreak: true,
    height: 10,
  });
  doc.restore();

  doc.fillColor(PDF_THEME.textPrimary).font('Helvetica').fontSize(10);
}

/**
 * Hook chrome onto every page exactly once per document.
 *
 * We listen for `pageAdded` (so any new page – ours or one PDFKit creates
 * internally – gets the same chrome), with a re-entry guard so chrome
 * painting itself can never trigger more `pageAdded` events.
 */
function _attachPageChromeOnce(doc) {
  if (doc._emsChromeAttached) return;
  doc._emsChromeAttached = true;
  doc._emsPaintingChrome = false;
  doc._emsPageCount = 1;

  doc.on('pageAdded', () => {
    if (doc._emsPaintingChrome) return;
    doc._emsPaintingChrome = true;
    try {
      doc._emsPageCount += 1;
      _paintPageChrome(doc);
    } finally {
      doc._emsPaintingChrome = false;
    }
  });

  doc._emsPaintingChrome = true;
  try {
    _paintPageChrome(doc);
  } finally {
    doc._emsPaintingChrome = false;
  }
}

/** Explicit page break – chrome is painted by the `pageAdded` listener. */
function _addPageWithChrome(doc) {
  doc.addPage();
}

/**
 * Cover-style header drawn on the first page of every report.
 * Returns the Y coordinate where body content should begin.
 */
function addPDFHeader(doc, title, subtitle = null) {
  _attachPageChromeOnce(doc);
  const x = PDF_MARGIN;
  const w = doc.page.width - PDF_MARGIN * 2;
  let y = 32;

  doc.fillColor(PDF_THEME.textPrimary)
     .font('Helvetica-Bold')
     .fontSize(20)
     .text(String(title || ''), x, y, {
       width: w,
       align: 'left',
       lineBreak: true,
       height: 30,
     });
  y = doc.y;

  if (subtitle) {
    doc.fillColor(PDF_THEME.textMuted)
       .font('Helvetica')
       .fontSize(9.5)
       .text(String(subtitle), x, y + 3, {
         width: w,
         align: 'left',
         lineBreak: true,
         height: 14,
       });
    y = doc.y;
  }

  doc.save();
  doc.rect(x, y + 10, w, 0.6).fill(PDF_THEME.border);
  doc.restore();

  doc.fillColor(PDF_THEME.textPrimary).font('Helvetica').fontSize(10);
  return y + 24;
}

/**
 * Card-style summary tile: white card with subtle border + colored left stripe.
 * Signature preserved for backward compatibility with existing call sites.
 */
function addSummaryBox(doc, x, y, label, value, color = PDF_THEME.accent, boxWidth = null) {
  if (!boxWidth) {
    boxWidth = (doc.page.width - PDF_MARGIN * 2) / 2;
  }
  const boxHeight = 58;

  // Card + border
  doc.save();
  doc.roundedRect(x, y, boxWidth, boxHeight, 6)
     .lineWidth(0.6)
     .fillAndStroke(PDF_THEME.cardBg, PDF_THEME.border);
  doc.restore();

  // Accent stripe (left edge)
  doc.save();
  doc.rect(x, y, 3, boxHeight).fill(color);
  doc.restore();

  doc.fillColor(PDF_THEME.textMuted)
     .font('Helvetica')
     .fontSize(8)
     .text(String(label || '').toUpperCase(), x + 14, y + 12, {
       width: boxWidth - 22,
       characterSpacing: 0.6,
       lineBreak: true,
       height: 11,
     });

  doc.fillColor(PDF_THEME.textPrimary)
     .font('Helvetica-Bold')
     .fontSize(16)
     .text(String(value == null ? '' : value), x + 14, y + 28, {
       width: boxWidth - 22,
       lineBreak: true,
       height: 20,
     });

  doc.fillColor(PDF_THEME.textPrimary).font('Helvetica').fontSize(10);
  return boxHeight;
}

/**
 * Modern table renderer used by every export.
 *
 * options:
 *   colWidths    number[]      Relative widths per column (auto-scaled to page width)
 *   headerAligns ('left'|'center'|'right')[]  Optional per-column header alignment
 *   rowAligns    ('left'|'center'|'right')[]  Optional per-column row alignment
 *
 * Backward compatible: legacy options (headerColor / rowColor / textColor) are
 * accepted but no longer used – the helper now follows the shared theme.
 */
function addTable(doc, startY, headers, rows, options = {}) {
  _attachPageChromeOnce(doc);

  const pageWidth = doc.page.width - PDF_MARGIN * 2;
  const numCols = headers.length;

  const providedWidths = Array.isArray(options.colWidths) && options.colWidths.length === numCols
    ? options.colWidths
    : Array(numCols).fill(pageWidth / numCols);

  // Normalize requested widths to fit the page exactly, preserving ratios.
  const sumWidths = providedWidths.reduce((sum, w) => sum + (Number(w) || 0), 0);
  const scale = sumWidths > 0 ? pageWidth / sumWidths : 1;
  const widths = providedWidths.map((w) => (Number(w) || 0) * scale);

  const headerAligns = Array.isArray(options.headerAligns) ? options.headerAligns : null;
  const rowAligns = Array.isArray(options.rowAligns) ? options.rowAligns : null;

  const padX = 6;
  const padY = 6;
  const headerHeight = 26;
  const minRowHeight = 22;
  const maxRowHeight = 60; // cap to ~3-4 lines per cell to keep layout sane
  // Reserve space at bottom for chrome footer + small per-export footers
  const bottomLimit = doc.page.height - 50;

  let y = startY;

  const drawHeader = () => {
    doc.save();
    doc.rect(PDF_MARGIN, y, pageWidth, headerHeight).fill(PDF_THEME.headerBg);
    doc.rect(PDF_MARGIN, y + headerHeight - 0.8, pageWidth, 0.8).fill(PDF_THEME.accent);
    doc.restore();

    doc.fillColor(PDF_THEME.textPrimary)
       .font('Helvetica-Bold')
       .fontSize(9.5);

    let x = PDF_MARGIN;
    headers.forEach((header, i) => {
      const align = (headerAligns && headerAligns[i]) || 'left';
      const cw = Math.max(12, widths[i] - padX * 2);
      doc.text(String(header == null ? '' : header), x + padX, y + 8, {
        width: cw,
        align,
        lineBreak: true,
        height: headerHeight - 12,
      });
      x += widths[i];
    });

    y += headerHeight;
  };

  drawHeader();
  doc.fillColor(PDF_THEME.textPrimary).font('Helvetica').fontSize(9);

  rows.forEach((row, rowIndex) => {
    // Measure tallest cell so multi-line content doesn't clip
    let cellHeight = minRowHeight;
    for (let i = 0; i < numCols; i++) {
      const text = String(row[i] == null ? '' : row[i]);
      const cw = Math.max(12, widths[i] - padX * 2);
      const h = doc.heightOfString(text, { width: cw });
      cellHeight = Math.max(cellHeight, h + padY * 2);
    }
    cellHeight = Math.min(cellHeight, maxRowHeight);

    if (y + cellHeight > bottomLimit) {
      _addPageWithChrome(doc);
      y = PDF_MARGIN;
      drawHeader();
      doc.fillColor(PDF_THEME.textPrimary).font('Helvetica').fontSize(9);
    }

    // Zebra fill
    if (rowIndex % 2 === 0) {
      doc.save();
      doc.rect(PDF_MARGIN, y, pageWidth, cellHeight).fill(PDF_THEME.rowAlt);
      doc.restore();
    }

    // Row text – bounded height stops PDFKit from auto-paginating per cell
    let x = PDF_MARGIN;
    for (let i = 0; i < numCols; i++) {
      const align = (rowAligns && rowAligns[i]) || 'left';
      const cw = Math.max(12, widths[i] - padX * 2);
      doc.fillColor(PDF_THEME.textPrimary)
         .text(String(row[i] == null ? '' : row[i]), x + padX, y + padY, {
           width: cw,
           align,
           lineBreak: true,
           height: cellHeight - padY * 2,
         });
      x += widths[i];
    }

    // Row separator
    doc.save();
    doc.rect(PDF_MARGIN, y + cellHeight - 0.3, pageWidth, 0.3).fill(PDF_THEME.border);
    doc.restore();

    y += cellHeight;
  });

  doc.fillColor(PDF_THEME.textPrimary).font('Helvetica').fontSize(10);
  return y;
}

/**
 * Generate and email products report
 */
async function exportProductsReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    // Get business database connection
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Product } = businessModels;
    
    // Initialize email service
    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }
    
    // Get products with filters
    let query = { isActive: true };
    if (filters.category) {
      query.category = filters.category;
    }
    if (filters.productType) {
      query.productType = filters.productType;
    }
    if (filters.search) {
      query.name = { $regex: filters.search, $options: 'i' };
    }
    
    const products = await Product.find(query).lean();
    
    // Get business info
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    
    // Report export recipients (admins + staff opted in)
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }
    
    let attachment;
    let fileName;
    let exportType = 'Products Report';
    
    if (format === 'xlsx') {
      // Generate Excel file
      const data = products.map(product => {
        // Calculate status based on stock level (same as PDF)
        const stock = product.stock || 0;
        const minStock = product.minimumStock || product.minStock || 0;
        const status = stock < minStock ? 'Low' : 'OK';
        
        return {
          "Product Name": product.name,
          "Category": product.category,
          "Product Type": product.productType || "retail",
          "Price": parseFloat(product.price) || 0,
          "Stock": parseInt(product.stock) || 0,
          "Minimum Stock": parseInt(product.minimumStock || product.minStock) || 0,
          "SKU/Barcode": product.barcode || product.sku || "",
          "Supplier": product.supplier || "",
          "Description": product.description || "",
          "Status": status
        };
      });
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products Report");
      
      // Add summary sheet
      const summaryData = [
        { Metric: "Total Products", Value: products.length },
        { Metric: "Generated Date", Value: new Date().toISOString() }
      ];
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
      
      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `products-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = {
        filename: fileName,
        content: buffer  // Pass Buffer directly, email service will handle encoding
      };
    } else if (format === 'pdf') {
      // Generate PDF with enhanced formatting
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {});
      
      // Header
      let y = addPDFHeader(doc, 'Products Inventory Report', `Generated: ${new Date().toLocaleString()}`);
      
      // Summary boxes
      const totalProducts = products.length;
      const lowStock = products.filter(p => (p.stock || 0) < (p.minimumStock || p.minStock || 0)).length;
      const totalValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0);
      
      y += 20;
      const boxWidth = (doc.page.width - 100) / 2;
      const boxHeight = addSummaryBox(doc, 50, y, 'Total Products', totalProducts.toString(), '#3b82f6', boxWidth);
      addSummaryBox(doc, 50 + boxWidth + 10, y, 'Low Stock Items', lowStock.toString(), lowStock > 0 ? '#ef4444' : '#10b981', boxWidth);
      y += boxHeight + 16;
      
      // Table headers and data
      const headers = ['#', 'Product Name', 'Category', 'Stock', 'Price', 'Status'];
      const rows = products.map((product, index) => [
        (index + 1).toString(),
        product.name || 'N/A',
        product.category || 'N/A',
        (product.stock || 0).toString(),
        pdfRsAmount(product.price || 0),
        (product.stock || 0) < (product.minimumStock || product.minStock || 0) ? '⚠️ Low' : '✓ OK'
      ]);
      
      const colWidths = [30, 200, 100, 60, 80, 60];
      y = addTable(doc, y, headers, rows, { colWidths });
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Total Inventory Value: ${pdfRsAmount(totalValue)}`, 50, doc.page.height - 36, { align: 'center', width: doc.page.width - 100, lineBreak: true, height: 12 });
      
      doc.end();
      
      // Wait for PDF to finish
      await new Promise((resolve) => {
        doc.on('end', resolve);
      });
      
      const buffer = Buffer.concat(chunks);
      fileName = `products-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = {
        filename: fileName,
        content: buffer
      };
    }
    
    // Send export to all recipients (admins + staff with allow reports delivery)
    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        logger.debug(`✅ Products report sent to ${recipient.email}`);
      } catch (emailError) {
        logger.error(`❌ Error sending products report to ${recipient.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Products report sent to recipient(s)` };
  } catch (error) {
    logger.error('Error exporting products report:', error);
    throw error;
  }
}

/**
 * Generate and email sales report
 */
async function exportSalesReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    // Get business database connection
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Sale } = businessModels;
    
    // Initialize email service
    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }
    
    // Build query from filters
    let query = {};
    if (filters.dateFrom && filters.dateTo) {
      query.date = {
        $gte: new Date(filters.dateFrom),
        $lte: new Date(filters.dateTo)
      };
    }
    if (filters.status) {
      query.status = filters.status;
    }
    
    const sales = await Sale.find(query).sort({ date: -1 }).lean();
    
    // Get business info
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    
    // Report export recipients (admins + staff opted in)
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }
    
    let attachment;
    let fileName;
    let exportType = 'Sales Report';
    
    if (format === 'xlsx') {
      // Generate Excel file
      // Net Total = bill + tip (incl tip); Gross Total = bill only (excl tip)
      const data = sales.map(sale => {
        const gross = parseFloat(sale.grossTotal) || 0;
        const tip = parseFloat(sale.tip) || 0;
        return {
          "Bill No.": sale.billNo,
          "Customer Name": sale.customerName,
          "Date": sale.date ? new Date(sale.date).toLocaleDateString() : '',
          "Status": String(sale.status || '').trim(),
          "Payment Mode": sale.paymentMode || 'N/A',
          "Net Total": gross + tip,
          "Tax Amount": parseFloat(sale.taxAmount) || 0,
          "Gross Total": gross,
          "Staff Name": sale.staffName || 'N/A'
        };
      });
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
      
      // Calculate totals
      const totalRevenue = sales.reduce((sum, s) => sum + (s.grossTotal || 0), 0);
      const completedSales = sales.filter(s => s.status === 'completed' || s.status === 'Completed').length;
      
      const summaryData = [
        { Metric: "Total Revenue", Value: totalRevenue },
        { Metric: "Completed Sales", Value: completedSales },
        { Metric: "Total Sales", Value: sales.length },
        { Metric: "Generated Date", Value: new Date().toISOString() }
      ];
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
      
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `sales-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = {
        filename: fileName,
        content: buffer  // Pass Buffer directly, email service will handle encoding
      };
    } else if (format === 'pdf') {
      // Generate PDF with enhanced formatting
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {});
      
      // Header
      const periodText = filters.dateFrom && filters.dateTo 
        ? `${new Date(filters.dateFrom).toLocaleDateString()} - ${new Date(filters.dateTo).toLocaleDateString()}`
        : 'All Time';
      let y = addPDFHeader(doc, 'Sales Report', `Period: ${periodText} | Generated: ${new Date().toLocaleString()}`);
      
      // Calculate summary
      const totalRevenue = sales.reduce((sum, s) => sum + (s.grossTotal || 0), 0);
      const completedSales = sales.filter(s => s.status === 'completed' || s.status === 'Completed').length;
      const partialSales = sales.filter(s => s.status === 'partial' || s.status === 'Partial').length;
      const unpaidSales = sales.filter(s => s.status === 'unpaid' || s.status === 'Unpaid').length;
      
      // Summary boxes
      y += 20;
      const boxWidth = (doc.page.width - 100) / 4;
      const boxHeight = addSummaryBox(doc, 50, y, 'Total Revenue', pdfRsAmount(totalRevenue), '#10b981', boxWidth);
      addSummaryBox(doc, 50 + boxWidth + 10, y, 'Completed', completedSales.toString(), '#3b82f6', boxWidth);
      addSummaryBox(doc, 50 + (boxWidth + 10) * 2, y, 'Partial', partialSales.toString(), '#f59e0b', boxWidth);
      addSummaryBox(doc, 50 + (boxWidth + 10) * 3, y, 'Unpaid', unpaidSales.toString(), '#ef4444', boxWidth);
      y += boxHeight + 16;
      
      // Table
      const headers = ['Bill No', 'Customer', 'Date', 'Amount', 'Status', 'Payment'];
      const rows = sales.map((sale) => [
        sale.billNo || 'N/A',
        (sale.customerName || 'N/A').substring(0, 20),
        sale.date ? new Date(sale.date).toLocaleDateString() : 'N/A',
        pdfRsAmount(sale.grossTotal || 0),
        sale.status || 'N/A',
        sale.paymentMode || 'N/A'
      ]);
      
      const colWidths = [60, 120, 80, 80, 60, 80];
      y = addTable(doc, y, headers, rows, { colWidths });
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Total Sales: ${sales.length} | Total Revenue: ${pdfRsAmount(totalRevenue)}`, 50, doc.page.height - 36, { align: 'center', width: doc.page.width - 100, lineBreak: true, height: 12 });
      
      doc.end();
      
      // Wait for PDF to finish
      await new Promise((resolve) => {
        doc.on('end', resolve);
      });
      
      const buffer = Buffer.concat(chunks);
      fileName = `sales-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = {
        filename: fileName,
        content: buffer
      };
    }
    
    if (!attachment) {
      throw new Error(`Unsupported format: ${format}. Supported formats: xlsx, pdf`);
    }
    
    // Send export to all recipients (admins + staff with allow reports delivery)
    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        logger.debug(`✅ Sales report sent to ${recipient.email}`);
      } catch (emailError) {
        logger.error(`❌ Error sending sales report to ${recipient.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Sales report sent to recipient(s)` };
  } catch (error) {
    logger.error('Error exporting sales report:', error);
    throw error;
  }
}

/**
 * Generate and email services report
 */
async function exportServicesReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Service } = businessModels;
    
    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }
    
    let query = { isActive: true };
    if (filters.search) {
      query.name = { $regex: filters.search, $options: 'i' };
    }
    if (filters.category) {
      query.category = filters.category;
    }
    
    const services = await Service.find(query).lean();
    
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }
    
    let attachment;
    let fileName;
    let exportType = 'Services Report';
    
    if (format === 'xlsx') {
      const data = services.map(service => ({
        "Service Name": service.name,
        "Category": service.category,
        "Price": parseFloat(service.price) || 0,
        "Duration": service.duration || 'N/A',
        "Description": service.description || "",
        "Status": String(service.status || "active").trim()
      }));
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Services Report");
      
      const summaryData = [
        { Metric: "Total Services", Value: services.length },
        { Metric: "Generated Date", Value: new Date().toISOString() }
      ];
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
      
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `services-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = {
        filename: fileName,
        content: buffer  // Pass Buffer directly, email service will handle encoding
      };
    } else if (format === 'pdf') {
      // Generate PDF with enhanced formatting
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {});
      
      // Header
      let y = addPDFHeader(doc, 'Services Report', `Generated: ${new Date().toLocaleString()}`);
      
      // Summary
      const totalServices = services.length;
      const avgPrice = services.length > 0 
        ? services.reduce((sum, s) => sum + (s.price || 0), 0) / services.length 
        : 0;
      
      y += 20;
      const boxWidth = (doc.page.width - 100) / 2;
      const boxHeight = addSummaryBox(doc, 50, y, 'Total Services', totalServices.toString(), '#3b82f6', boxWidth);
      addSummaryBox(doc, 50 + boxWidth + 10, y, 'Average Price', pdfRsAmount(avgPrice), '#10b981', boxWidth);
      y += boxHeight + 16;
      
      // Table
      const headers = ['#', 'Service Name', 'Category', 'Price', 'Duration', 'Status'];
      const rows = services.map((service, index) => [
        (index + 1).toString(),
        service.name || 'N/A',
        service.category || 'N/A',
        pdfRsAmount(service.price || 0),
        service.duration ? `${service.duration} min` : 'N/A',
        service.status || 'active'
      ]);
      
      const colWidths = [30, 180, 100, 80, 80, 60];
      y = addTable(doc, y, headers, rows, { colWidths });
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Total Services: ${totalServices}`, 50, doc.page.height - 36, { align: 'center', width: doc.page.width - 100, lineBreak: true, height: 12 });
      
      doc.end();
      
      await new Promise((resolve) => {
        doc.on('end', resolve);
      });
      
      const buffer = Buffer.concat(chunks);
      fileName = `services-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = {
        filename: fileName,
        content: buffer
      };
    }
    
    if (!attachment) {
      throw new Error(`Unsupported format: ${format}. Supported formats: xlsx, pdf`);
    }
    
    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        logger.debug(`✅ Services report sent to ${recipient.email}`);
      } catch (emailError) {
        logger.error(`❌ Error sending services report to ${recipient.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Services report sent to recipient(s)` };
  } catch (error) {
    logger.error('Error exporting services report:', error);
    throw error;
  }
}

/**
 * Generate and email clients report
 */
async function exportClientsReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Client } = businessModels;
    
    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }
    
    let query = {};
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { phone: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } }
      ];
    }
    if (filters.status) {
      query.status = filters.status;
    }
    
    const clients = await Client.find(query).lean();
    
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }
    
    let attachment;
    let fileName;
    let exportType = 'Clients Report';
    
    if (format === 'xlsx') {
      const data = clients.map(client => ({
        "Client Name": client.name,
        "Phone": client.phone || "",
        "Email": client.email || "",
        "Address": client.address || "",
        "Status": String(client.status || "active").trim(),
        "Created Date": client.createdAt ? new Date(client.createdAt).toLocaleDateString() : ""
      }));
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clients Report");
      
      const summaryData = [
        { Metric: "Total Clients", Value: clients.length },
        { Metric: "Generated Date", Value: new Date().toISOString() }
      ];
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
      
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `clients-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = {
        filename: fileName,
        content: buffer  // Pass Buffer directly, email service will handle encoding
      };
    } else if (format === 'pdf') {
      // Generate PDF with enhanced formatting
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {});
      
      // Header
      let y = addPDFHeader(doc, 'Clients Report', `Generated: ${new Date().toLocaleString()}`);
      
      // Summary
      const totalClients = clients.length;
      const activeClients = clients.filter(c => c.status === 'active' || !c.status).length;
      
      y += 20;
      const boxWidth = (doc.page.width - 100) / 2;
      const boxHeight = addSummaryBox(doc, 50, y, 'Total Clients', totalClients.toString(), '#3b82f6', boxWidth);
      addSummaryBox(doc, 50 + boxWidth + 10, y, 'Active Clients', activeClients.toString(), '#10b981', boxWidth);
      y += boxHeight + 16;
      
      // Table
      const headers = ['#', 'Client Name', 'Phone', 'Email', 'Status'];
      const rows = clients.map((client, index) => [
        (index + 1).toString(),
        client.name || 'N/A',
        client.phone || 'N/A',
        (client.email || 'N/A').substring(0, 25),
        client.status || 'active'
      ]);
      
      const colWidths = [30, 150, 100, 150, 60];
      y = addTable(doc, y, headers, rows, { colWidths });
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Total Clients: ${totalClients} | Active: ${activeClients}`, 50, doc.page.height - 36, { align: 'center', width: doc.page.width - 100, lineBreak: true, height: 12 });
      
      doc.end();
      
      await new Promise((resolve) => {
        doc.on('end', resolve);
      });
      
      const buffer = Buffer.concat(chunks);
      fileName = `clients-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = {
        filename: fileName,
        content: buffer
      };
    }
    
    if (!attachment) {
      throw new Error(`Unsupported format: ${format}. Supported formats: xlsx, pdf`);
    }
    
    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        logger.debug(`✅ Clients report sent to ${recipient.email}`);
      } catch (emailError) {
        logger.error(`❌ Error sending clients report to ${recipient.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Clients report sent to recipient(s)` };
  } catch (error) {
    logger.error('Error exporting clients report:', error);
    throw error;
  }
}

/**
 * Generate and email expense report
 */
async function exportExpenseReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Expense } = businessModels;
    
    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }
    
    let query = {};
    if (filters.dateFrom && filters.dateTo) {
      query.date = {
        $gte: new Date(filters.dateFrom),
        $lte: new Date(filters.dateTo)
      };
    }
    if (filters.category) {
      query.category = filters.category;
    }
    if (filters.paymentMethod) {
      query.paymentMethod = filters.paymentMethod;
    }
    
    const expenses = await Expense.find(query).sort({ date: -1 }).lean();
    
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }
    
    let attachment;
    let fileName;
    let exportType = 'Expense Report';
    
    if (format === 'xlsx') {
      const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      
      const data = expenses.map(expense => ({
        "Date": expense.date ? new Date(expense.date).toLocaleDateString() : "",
        "Category": expense.category || "",
        "Description": expense.description || "",
        "Amount": parseFloat(expense.amount) || 0,
        "Payment Method": expense.paymentMethod || "",
        "Notes": expense.notes || ""
      }));
      
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Expense Report");
      
      const summaryData = [
        { Metric: "Total Expenses", Value: totalExpenses },
        { Metric: "Total Records", Value: expenses.length },
        { Metric: "Generated Date", Value: new Date().toISOString() }
      ];
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");
      
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `expense-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = {
        filename: fileName,
        content: buffer  // Pass Buffer directly, email service will handle encoding
      };
    } else if (format === 'pdf') {
      // Generate PDF with enhanced formatting
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {});
      
      // Header
      const periodText = filters.dateFrom && filters.dateTo 
        ? `${new Date(filters.dateFrom).toLocaleDateString()} - ${new Date(filters.dateTo).toLocaleDateString()}`
        : 'All Time';
      let y = addPDFHeader(doc, 'Expense Report', `Period: ${periodText} | Generated: ${new Date().toLocaleString()}`);
      
      // Summary
      const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const avgExpense = expenses.length > 0 ? totalExpenses / expenses.length : 0;
      
      y += 20;
      const boxWidth = (doc.page.width - 100) / 2;
      const boxHeight = addSummaryBox(doc, 50, y, 'Total Expenses', pdfRsAmount(totalExpenses), '#ef4444', boxWidth);
      addSummaryBox(doc, 50 + boxWidth + 10, y, 'Average Expense', pdfRsAmount(avgExpense), '#f59e0b', boxWidth);
      y += boxHeight + 16;
      
      // Table
      const headers = ['#', 'Category', 'Description', 'Date', 'Amount', 'Payment Method'];
      const rows = expenses.map((expense, index) => [
        (index + 1).toString(),
        expense.category || 'N/A',
        (expense.description || '').substring(0, 30),
        expense.date ? new Date(expense.date).toLocaleDateString() : 'N/A',
        pdfRsAmount(expense.amount || 0),
        expense.paymentMethod || 'N/A'
      ]);
      
      const colWidths = [30, 100, 150, 80, 80, 100];
      y = addTable(doc, y, headers, rows, { colWidths });
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Total Expenses: ${pdfRsAmount(totalExpenses)} | Records: ${expenses.length}`, 50, doc.page.height - 36, { align: 'center', width: doc.page.width - 100, lineBreak: true, height: 12 });
      
      doc.end();
      
      await new Promise((resolve) => {
        doc.on('end', resolve);
      });
      
      const buffer = Buffer.concat(chunks);
      fileName = `expense-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = {
        filename: fileName,
        content: buffer
      };
    }
    
    if (!attachment) {
      throw new Error(`Unsupported format: ${format}. Supported formats: xlsx, pdf`);
    }
    
    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        logger.debug(`✅ Expense report sent to ${recipient.email}`);
      } catch (emailError) {
        logger.error(`❌ Error sending expense report to ${recipient.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Expense report sent to recipient(s)` };
  } catch (error) {
    logger.error('Error exporting expense report:', error);
    throw error;
  }
}

/**
 * Generate and email cash registry report
 */
async function exportCashRegistryReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { CashRegistry, Sale, Expense } = businessModels;
    
    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }
    
    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }
    
    const reportType = filters.reportType || 'summary';
    let query = {};
    
    if (filters.dateFrom && filters.dateTo) {
      query.date = {
        $gte: new Date(filters.dateFrom),
        $lte: new Date(filters.dateTo)
      };
    }
    
    let attachment;
    let fileName;
    let exportType = 'Cash Registry Report';
    
    if (format === 'xlsx') {
      if (reportType === 'summary') {
        // Get cash registry entries
        const entries = await CashRegistry.find(query).sort({ date: -1 }).lean();
        
        // Group by date and calculate summaries
        const dateMap = new Map();
        entries.forEach(entry => {
          const dateKey = new Date(entry.date).toISOString().split('T')[0];
          if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, {
              date: dateKey,
              openingBalance: 0,
              cashCollected: 0,
              onlineSales: 0,
              expenses: 0,
              closingBalance: 0
            });
          }
          const summary = dateMap.get(dateKey);
          if (entry.shiftType === 'opening') {
            summary.openingBalance = entry.openingBalance || 0;
          } else if (entry.shiftType === 'closing') {
            summary.closingBalance = entry.closingBalance || 0;
          }
        });
        
        // Get sales and expenses for each date
        // Cash Register uses PAYMENT DATE: new bills (sale date) + due collections (paymentHistory date)
        for (const [dateKey, summary] of dateMap.entries()) {
          const dateStart = new Date(dateKey);
          dateStart.setHours(0, 0, 0, 0);
          const dateEnd = new Date(dateKey);
          dateEnd.setHours(23, 59, 59, 999);
          
          const salesToday = await Sale.find({
            branchId,
            date: { $gte: dateStart, $lte: dateEnd },
            status: { $nin: ['cancelled', 'Cancelled'] }
          }).lean();
          const salesWithDuesToday = await Sale.find({
            branchId,
            paymentHistory: {
              $elemMatch: {
                date: { $gte: dateStart, $lte: dateEnd },
                method: 'Cash'
              }
            },
            status: { $nin: ['cancelled', 'Cancelled'] }
          }).lean();
          const salesWithCardOnlineDuesToday = await Sale.find({
            branchId,
            paymentHistory: {
              $elemMatch: {
                date: { $gte: dateStart, $lte: dateEnd },
                method: { $in: ['Card', 'Online'] }
              }
            },
            status: { $nin: ['cancelled', 'Cancelled'] }
          }).lean();
          let cashFromNewBills = 0;
          salesToday.forEach(s => {
            let cashAmt = 0;
            let isAllCash = false;
            if (s.payments && s.payments.length > 0) {
              cashAmt = s.payments.filter(p => (p.mode || '').toLowerCase() === 'cash')
                .reduce((pSum, p) => pSum + (p.amount || 0), 0);
              const hasNonCash = s.payments.some(p => {
                const m = (p.mode || '').toLowerCase();
                return m === 'card' || m === 'online';
              });
              isAllCash = cashAmt > 0 && !hasNonCash;
            } else {
              cashAmt = (s.netTotal || 0);
              isAllCash = (s.paymentMode || '').toLowerCase().includes('cash') &&
                !(s.paymentMode || '').toLowerCase().includes('card') &&
                !(s.paymentMode || '').toLowerCase().includes('online');
            }
            cashAmt += billChangeCreditedToWalletCashAddition(s);
            const tip = s.tip || 0;
            cashFromNewBills += cashAmt - (isAllCash ? tip : 0);
          });
          let cashFromDueCollected = 0;
          salesWithDuesToday.forEach(s => {
            (s.paymentHistory || []).forEach(ph => {
              if (!ph || (ph.method || '').toLowerCase() !== 'cash') return;
              const phDate = ph.date ? new Date(ph.date) : null;
              if (phDate && phDate >= dateStart && phDate <= dateEnd) {
                cashFromDueCollected += ph.amount || 0;
              }
            });
          });
          summary.cashCollected = cashFromNewBills + cashFromDueCollected;

          // Total Online Sales = Card/Online at checkout (invoice date = dateKey) + dues via paymentHistory (Card/Online)
          let onlineFromCheckout = 0;
          salesToday.forEach((s) => {
            if (s.payments && s.payments.length > 0) {
              onlineFromCheckout += s.payments
                .filter((p) => {
                  const mode = (p.mode || '').toLowerCase();
                  return mode === 'card' || mode === 'online';
                })
                .reduce((pSum, p) => pSum + (p.amount || 0), 0);
            } else {
              const pm = (s.paymentMode || '').toLowerCase();
              if (pm.includes('card') || pm.includes('online')) {
                onlineFromCheckout += s.netTotal || 0;
              }
            }
          });
          let onlineFromDues = 0;
          salesWithCardOnlineDuesToday.forEach((s) => {
            (s.paymentHistory || []).forEach((ph) => {
              if (!ph) return;
              const m = (ph.method || '').toLowerCase();
              if (m !== 'card' && m !== 'online') return;
              const phDate = ph.date ? new Date(ph.date) : null;
              if (phDate && phDate >= dateStart && phDate <= dateEnd) {
                onlineFromDues += ph.amount || 0;
              }
            });
          });
          summary.onlineSales = onlineFromCheckout + onlineFromDues;
          
          const expenses = await Expense.find({
            date: { $gte: dateStart, $lte: dateEnd }
          }).lean();
          
          summary.expenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        }
        
        const data = Array.from(dateMap.values()).map(summary => ({
          "Date": new Date(summary.date).toLocaleDateString(),
          "Opening Balance": parseFloat(summary.openingBalance) || 0,
          "Cash Collected": parseFloat(summary.cashCollected) || 0,
          "Online Sales": parseFloat(summary.onlineSales) || 0,
          "Expenses": parseFloat(summary.expenses) || 0,
          "Closing Balance": parseFloat(summary.closingBalance) || 0
        }));
        
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Cash Registry Summary");
        
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        fileName = `cash-registry-summary-${new Date().toISOString().split('T')[0]}.xlsx`;
        attachment = {
          filename: fileName,
          content: buffer  // Pass Buffer directly, email service will handle encoding
        };
      } else {
        // Activity report
        const entries = await CashRegistry.find(query).sort({ date: -1 }).lean();
        
        const data = entries.map(entry => ({
          "Date": entry.date ? new Date(entry.date).toLocaleDateString() : "",
          "Shift": entry.shiftType === "opening" ? "Opening" : "Closing",
          "Created By": entry.createdBy || "",
          "Opening Balance": parseFloat(entry.openingBalance) || 0,
          "Closing Balance": parseFloat(entry.closingBalance) || 0,
          "Total Balance": parseFloat(entry.totalBalance) || 0,
          "Status": entry.isVerified ? "Verified" : "Pending"
        }));
        
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Cash Registry Activity");
        
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        fileName = `cash-registry-activity-${new Date().toISOString().split('T')[0]}.xlsx`;
        attachment = {
          filename: fileName,
          content: buffer  // Pass Buffer directly, email service will handle encoding
        };
      }
    } else if (format === 'pdf') {
      // Generate PDF with enhanced formatting
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {});
      
      // Header
      const periodText = filters.dateFrom && filters.dateTo 
        ? `${new Date(filters.dateFrom).toLocaleDateString()} - ${new Date(filters.dateTo).toLocaleDateString()}`
        : 'All Time';
      let y = addPDFHeader(doc, 'Cash Registry Report', `${reportType === 'summary' ? 'Summary' : 'Activity'} Report | Period: ${periodText}`);
      
      if (reportType === 'summary') {
        const entries = await CashRegistry.find(query).sort({ date: -1 }).lean();
        const dateMap = new Map();
        
        entries.forEach(entry => {
          const dateKey = new Date(entry.date).toISOString().split('T')[0];
          if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, {
              date: dateKey,
              openingBalance: 0,
              closingBalance: 0
            });
          }
          const summary = dateMap.get(dateKey);
          if (entry.shiftType === 'opening') {
            summary.openingBalance = entry.openingBalance || 0;
          } else if (entry.shiftType === 'closing') {
            summary.closingBalance = entry.closingBalance || 0;
          }
        });
        
        const summaries = Array.from(dateMap.values());
        const totalDays = summaries.length;
        const avgOpening = summaries.length > 0 
          ? summaries.reduce((sum, s) => sum + s.openingBalance, 0) / summaries.length 
          : 0;
        const avgClosing = summaries.length > 0 
          ? summaries.reduce((sum, s) => sum + s.closingBalance, 0) / summaries.length 
          : 0;
        
        y += 20;
        const boxWidth = (doc.page.width - 100) / 3;
        const boxHeight = addSummaryBox(doc, 50, y, 'Total Days', totalDays.toString(), '#3b82f6', boxWidth);
        addSummaryBox(doc, 50 + boxWidth + 10, y, 'Avg Opening', pdfRsAmount(avgOpening), '#10b981', boxWidth);
        addSummaryBox(doc, 50 + (boxWidth + 10) * 2, y, 'Avg Closing', pdfRsAmount(avgClosing), '#f59e0b', boxWidth);
        y += boxHeight + 16;
        
        // Table
        const headers = ['#', 'Date', 'Opening Balance', 'Closing Balance', 'Difference'];
        const rows = summaries.map((summary, index) => [
          (index + 1).toString(),
          new Date(summary.date).toLocaleDateString(),
          pdfRsAmount(summary.openingBalance),
          pdfRsAmount(summary.closingBalance),
          pdfRsAmount(summary.closingBalance - summary.openingBalance)
        ]);
        
        const colWidths = [30, 100, 120, 120, 100];
        y = addTable(doc, y, headers, rows, { colWidths });
      } else {
        const entries = await CashRegistry.find(query).sort({ date: -1 }).lean();
        const totalEntries = entries.length;
        const verifiedEntries = entries.filter(e => e.isVerified).length;
        
        y += 20;
        const boxWidth = (doc.page.width - 100) / 2;
        const boxHeight = addSummaryBox(doc, 50, y, 'Total Entries', totalEntries.toString(), '#3b82f6', boxWidth);
        addSummaryBox(doc, 50 + boxWidth + 10, y, 'Verified', verifiedEntries.toString(), '#10b981', boxWidth);
        y += boxHeight + 16;
        
        // Table
        const headers = ['#', 'Date', 'Shift', 'Opening', 'Closing', 'Status'];
        const rows = entries.map((entry, index) => [
          (index + 1).toString(),
          entry.date ? new Date(entry.date).toLocaleDateString() : 'N/A',
          entry.shiftType === 'opening' ? 'Opening' : 'Closing',
          pdfRsAmount(entry.openingBalance || 0),
          pdfRsAmount(entry.closingBalance || 0),
          entry.isVerified ? '✓ Verified' : '⏳ Pending'
        ]);
        
        const colWidths = [30, 100, 80, 100, 100, 80];
        y = addTable(doc, y, headers, rows, { colWidths });
      }
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Generated: ${new Date().toLocaleString()}`, 50, doc.page.height - 36, { align: 'center', width: doc.page.width - 100, lineBreak: true, height: 12 });
      
      doc.end();
      
      await new Promise((resolve) => {
        doc.on('end', resolve);
      });
      
      const buffer = Buffer.concat(chunks);
      fileName = `cash-registry-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = {
        filename: fileName,
        content: buffer
      };
    }
    
    if (!attachment) {
      throw new Error(`Unsupported format: ${format}. Supported formats: xlsx, pdf`);
    }
    
    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        logger.debug(`✅ Cash registry report sent to ${recipient.email}`);
      } catch (emailError) {
        logger.error(`❌ Error sending cash registry report to ${recipient.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Cash registry report sent to recipient(s)` };
  } catch (error) {
    logger.error('Error exporting cash registry report:', error);
    throw error;
  }
}

/**
 * Generate and email summary report (same 10 metrics as daily summary / Summary Reports UI)
 */
async function exportSummaryReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Sale, Receipt, CashRegistry, Expense } = businessModels;

    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }

    let dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    let dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
    if (!dateFrom || !dateTo) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateFrom = dateFrom || today;
      dateTo = dateTo || new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
    } else {
      dateTo.setHours(23, 59, 59, 999);
    }
    const todayDateString = toDateStringIST(dateFrom);
    const tomorrowDate = new Date(dateTo.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowDateString = toDateStringIST(tomorrowDate);

    const invoiceDateRange = { $gte: dateFrom, $lte: dateTo };
    const sales = await Sale.find({
      branchId,
      status: { $nin: ['cancelled', 'Cancelled'] },
      $or: [
        { date: invoiceDateRange },
        { paymentHistory: { $elemMatch: { date: invoiceDateRange } } }
      ]
    }).lean();
    const salesInInvoiceRange = sales.filter((s) => {
      const d = s.date ? new Date(s.date) : null;
      return d && d >= dateFrom && d <= dateTo;
    });

    const receipts = await Receipt.find({
      branchId,
      date: { $gte: todayDateString, $lte: tomorrowDateString }
    }).lean();

    const closingRegistry = await CashRegistry.findOne({
      branchId,
      date: { $gte: dateFrom, $lte: dateTo },
      shiftType: 'closing'
    }).sort({ date: -1 }).lean();

    const cashExpenses = await Expense.find({
      branchId,
      date: { $gte: dateFrom, $lte: dateTo },
      paymentMode: 'Cash',
      status: { $in: ['approved', 'pending'] }
    }).lean();

    const pettyCashExpenses = await Expense.find({
      branchId,
      date: { $gte: dateFrom, $lte: dateTo },
      paymentMode: 'Petty Cash Wallet',
      status: { $in: ['approved', 'pending'] }
    }).lean();

    const totalBillCount = salesInInvoiceRange.length;
    const uniqueCustomers = new Set(salesInInvoiceRange.map(s => (s.customerName || '').trim()).filter(Boolean));
    const totalCustomerCount = uniqueCustomers.size || totalBillCount;
    const totalSales = salesInInvoiceRange.reduce((sum, s) => sum + (s.grossTotal || s.totalAmount || s.netTotal || 0), 0);
    let totalSalesCash = 0, totalSalesOnline = 0, totalSalesCard = 0;
    salesInInvoiceRange.forEach(s => {
      let cashAmt = 0;
      let isAllCash = false;
      if (s.payments && s.payments.length) {
        s.payments.forEach(p => {
          const amt = p.amount || 0;
          if (p.mode === 'Cash') { totalSalesCash += amt; cashAmt += amt; }
          else if (p.mode === 'Online') totalSalesOnline += amt;
          else if (p.mode === 'Card') totalSalesCard += amt;
        });
        const hasNonCash = (s.payments || []).some(p => p.mode === 'Card' || p.mode === 'Online');
        isAllCash = cashAmt > 0 && !hasNonCash;
      } else {
        const amt = s.grossTotal || s.netTotal || 0;
        if (s.paymentMode === 'Cash') { totalSalesCash += amt; cashAmt = amt; isAllCash = true; }
        else if (s.paymentMode === 'Online') totalSalesOnline += amt;
        else if (s.paymentMode === 'Card') totalSalesCard += amt;
      }
      const walletCashAdd = billChangeCreditedToWalletCashAddition(s);
      totalSalesCash += walletCashAdd;
      cashAmt += walletCashAdd;
      if (isAllCash && (s.tip || 0) > 0) totalSalesCash -= (s.tip || 0);
    });
    let duesCollected = 0;
    sales.forEach(s => {
      (s.paymentHistory || []).forEach(ph => {
        const d = ph.date ? new Date(ph.date) : null;
        if (d && d >= dateFrom && d <= dateTo) duesCollected += ph.amount || 0;
      });
    });
    // Use Expense collection as source of truth (matches /api/reports/summary)
    const cashExpense = cashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const pettyCashExpense = pettyCashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    // Tip collected: sum from Sales (Quick Sale) + Receipts (manual receipts), matches API
    const tipFromSales = salesInInvoiceRange.reduce((sum, s) => sum + (s.tip || 0), 0);
    const tipFromReceipts = receipts.reduce((sum, r) => sum + (r.tip || 0), 0);
    const tipCollected = tipFromSales + tipFromReceipts;
    // Use closingBalance (actual counted) when available, else cashBalance (calculated) - matches API & UI
    const cashBalance = closingRegistry?.closingBalance ?? closingRegistry?.cashBalance ?? 0;

    // Outstanding: invoices in date range with due_amount > 0
    let totalDue = 0;
    const customersWithDueSet = new Set();
    salesInInvoiceRange.forEach(s => {
      const totalBillAmount = s.paymentStatus?.totalAmount ?? s.grossTotal ?? s.netTotal ?? 0;
      const amountPaid = s.paymentStatus?.paidAmount ?? (s.payments?.reduce((sum, p) => sum + (p.amount || 0), 0) ?? 0);
      const dueAmount = totalBillAmount - amountPaid;
      if (dueAmount > 0) {
        totalDue += dueAmount;
        const customerKey = (s.customerName || '').trim() || s._id.toString();
        if (customerKey) customersWithDueSet.add(customerKey);
      }
    });
    const customersWithDue = customersWithDueSet.size;

    const summaryData = {
      totalBillCount,
      totalCustomerCount,
      totalSales,
      totalSalesCash,
      totalSalesOnline,
      totalSalesCard,
      duesCollected,
      cashExpense,
      pettyCashExpense,
      tipCollected,
      cashBalance,
      totalDue,
      customersWithDue
    };

    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }

    const periodText = `${dateFrom.toLocaleDateString()} - ${dateTo.toLocaleDateString()}`;
    let attachment;
    let fileName;
    const exportType = 'Summary Report';

    if (format === 'xlsx') {
      const rows = [
        ['Metric', 'Value'],
        ['Total Bill Count', summaryData.totalBillCount],
        ['Total Customer Count', summaryData.totalCustomerCount],
        ['Total Sales', summaryData.totalSales],
        ['Total Sales (Cash)', summaryData.totalSalesCash],
        ['Total Sales (Online)', summaryData.totalSalesOnline],
        ['Total Sales (Card)', summaryData.totalSalesCard],
        ['Dues Collected', summaryData.duesCollected],
        ['Cash Expense', summaryData.cashExpense],
        ['Petty Cash Expense', summaryData.pettyCashExpense],
        ['Tip Collected', summaryData.tipCollected],
        ['Cash Balance', summaryData.cashBalance],
        ['Total Due (Outstanding)', summaryData.totalDue],
        ['Customers with Due', summaryData.customersWithDue]
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Summary');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `summary-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = { filename: fileName, content: buffer };
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {});
      let y = addPDFHeader(doc, 'Summary Report', `Period: ${periodText} | Generated: ${new Date().toLocaleString()}`);
      y += 20;
      const fmt = (n) => (Number(n) || 0).toFixed(2);
      const metrics = [
        ['Total Bill Count', String(summaryData.totalBillCount)],
        ['Total Customer Count', String(summaryData.totalCustomerCount)],
        ['Total Sales', `${PDF_RS}${fmt(summaryData.totalSales)}`],
        ['Total Sales (Cash)', `${PDF_RS}${fmt(summaryData.totalSalesCash)}`],
        ['Total Sales (Online)', `${PDF_RS}${fmt(summaryData.totalSalesOnline)}`],
        ['Total Sales (Card)', `${PDF_RS}${fmt(summaryData.totalSalesCard)}`],
        ['Dues Collected', `${PDF_RS}${fmt(summaryData.duesCollected)}`],
        ['Cash Expense', `${PDF_RS}${fmt(summaryData.cashExpense)}`],
        ['Petty Cash Expense', `${PDF_RS}${fmt(summaryData.pettyCashExpense)}`],
        ['Tip Collected', `${PDF_RS}${fmt(summaryData.tipCollected)}`],
        ['Cash Balance', `${PDF_RS}${fmt(summaryData.cashBalance)}`],
        ['Total Due (Outstanding)', `${PDF_RS}${fmt(summaryData.totalDue)}`],
        ['Customers with Due', String(summaryData.customersWithDue)]
      ];
      const headers = ['Metric', 'Value'];
      const tableRows = metrics;
      const colWidths = [180, 120];
      y = addTable(doc, y, headers, tableRows, { colWidths });
      doc.end();
      await new Promise(resolve => { doc.on('end', resolve); });
      const buffer = Buffer.concat(chunks);
      fileName = `summary-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = { filename: fileName, content: buffer };
    } else {
      throw new Error(`Unsupported format: ${format}. Supported: xlsx, pdf`);
    }

    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
      } catch (emailError) {
        logger.error('Error sending summary export to', recipient.email, emailError);
      }
    }
    return { success: true, message: 'Summary report sent to recipient(s)' };
  } catch (error) {
    logger.error('Error exporting summary report:', error);
    throw error;
  }
}

/**
 * Generate and email staff performance report (data provided by frontend)
 */
async function exportStaffPerformanceReport({ branchId, format = 'xlsx', filters = {}, data = [] }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }

    const { dateFrom, dateTo, periodLabel } = filters;
    const periodText = periodLabel || (dateFrom && dateTo
      ? `${new Date(dateFrom).toLocaleDateString()} - ${new Date(dateTo).toLocaleDateString()}`
      : 'Period: N/A');

    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }

    const totalRevenue = data.reduce((sum, r) => sum + (r.totalRevenue || 0), 0);
    const totalTransactions = data.reduce((sum, r) => sum + (r.totalTransactions || 0), 0);
    const totalCommission = data.reduce((sum, r) => sum + (r.totalCommission || 0), 0);
    const avgScore = data.length > 0
      ? data.reduce((sum, r) => sum + (r.performanceScore || 0), 0) / data.length
      : 0;

    let attachment;
    let fileName;
    const exportType = 'Staff Performance Report';

    const fmt = (amount) => (amount != null ? pdfRsAmount(amount) : '—');

    if (format === 'xlsx') {
      const rows = data.map((r) => ({
        'Staff Name': r.staffName,
        'Total Revenue': r.totalRevenue,
        'Service Revenue': r.serviceRevenue,
        'Product Revenue': r.productRevenue,
        'Membership Revenue': r.membershipRevenue,
        'Package Revenue': r.packageRevenue,
        'Total Transactions': r.totalTransactions,
        'Service Count': r.serviceCount,
        'Product Count': r.productCount,
        'Service Commission': r.serviceCommission,
        'Product Commission': r.productCommission,
        'Total Commission': r.totalCommission,
        'Customer Count': r.customerCount,
        'Repeat Customers': r.repeatCustomers,
        'Performance Score': r.performanceScore,
        'Last Activity': r.lastActivity
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Staff Performance');
      const summaryWs = XLSX.utils.aoa_to_sheet([
        ['Metric', 'Value'],
        ['Total Revenue', totalRevenue],
        ['Total Transactions', totalTransactions],
        ['Total Commission', totalCommission],
        ['Average Performance Score', avgScore.toFixed(1)],
        ['Generated', new Date().toISOString()]
      ]);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `staff-performance-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = { filename: fileName, content: buffer };
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {});
      let y = addPDFHeader(doc, 'Staff Performance Report', `${periodText} | Generated: ${new Date().toLocaleString()}`);
      y += 20;
      doc.fontSize(11).text(`Total Revenue: ${fmt(totalRevenue)}`, 50, y);
      y += 16;
      doc.text(`Total Transactions: ${totalTransactions}`, 50, y);
      y += 16;
      doc.text(`Total Commission: ${fmt(totalCommission)}`, 50, y);
      y += 16;
      doc.text(`Average Performance Score: ${avgScore.toFixed(1)}`, 50, y);
      y += 24;
      const headers = ['Staff', 'Total Rev', 'Svc Rev', 'Prod Rev', 'Mem Rev', 'Pkg Rev', 'Txns', 'Svc', 'Prod', 'Comm', 'Cust', 'Score'];
      const tableRows = data.map((r) => [
        r.staffName || '—',
        fmt(r.totalRevenue),
        fmt(r.serviceRevenue),
        fmt(r.productRevenue),
        fmt(r.membershipRevenue),
        fmt(r.packageRevenue),
        String(r.totalTransactions ?? 0),
        String(r.serviceCount ?? 0),
        String(r.productCount ?? 0),
        fmt(r.totalCommission),
        String(r.customerCount ?? 0),
        (r.performanceScore != null ? r.performanceScore.toFixed(1) : '—')
      ]);
      const colWidths = [44, 36, 32, 32, 32, 32, 24, 22, 22, 36, 26, 24];
      y = addTable(doc, y, headers, tableRows, { colWidths });
      doc.end();
      await new Promise((resolve) => { doc.on('end', resolve); });
      const buffer = Buffer.concat(chunks);
      fileName = `staff-performance-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = { filename: fileName, content: buffer };
    } else {
      throw new Error(`Unsupported format: ${format}. Supported: xlsx, pdf`);
    }

    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
      } catch (emailError) {
        logger.error('Error sending staff performance export to', recipient.email, emailError);
      }
    }
    return { success: true, message: 'Staff performance report sent to recipient(s)' };
  } catch (error) {
    logger.error('Error exporting staff performance report:', error);
    throw error;
  }
}

/**
 * Get date range from period for service list
 */
function getServiceListDateRange(rangeFrom, rangeTo) {
  if (rangeFrom && rangeTo) {
    return { from: new Date(rangeFrom), to: new Date(rangeTo) };
  }
  return { from: undefined, to: undefined };
}

/**
 * Generate and email service list report (flattened service line items from sales)
 */
async function exportServiceListReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Sale, Service } = businessModels;

    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }

    const { dateFrom, dateTo, serviceId, staffId, status, paymentMode } = filters;
    const dateRange = getServiceListDateRange(dateFrom, dateTo);

    const query = { };
    if (dateRange.from && dateRange.to) {
      query.date = { $gte: dateRange.from, $lte: dateRange.to };
    }
    if (status) {
      query.status = new RegExp(`^${status}$`, 'i');
    }

    const sales = await Sale.find(query).sort({ date: -1 }).lean();

    const serviceDurationMap = {};
    if (Service) {
      const services = await Service.find({}).select('_id duration').lean();
      services.forEach((s) => {
        serviceDurationMap[s._id?.toString()] = s.duration || 0;
      });
    }

    const rows = [];
    for (const sale of sales) {
      const paymentModes = (sale.payments && sale.payments.length > 0)
        ? [...new Set(sale.payments.map((p) => p.mode))]
        : (sale.paymentMode ? [sale.paymentMode] : []);
      if (paymentMode && !paymentModes.includes(paymentMode)) continue;

      const totalAmount = sale.paymentStatus?.totalAmount ?? sale.grossTotal ?? 0;
      const paidAmount = sale.paymentStatus?.paidAmount ?? 0;
      const paidStatus = totalAmount <= 0 ? '—' : paidAmount >= totalAmount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
      const saleDate = sale.date ? new Date(sale.date) : null;
      const saleTimeStr = sale.time || '';

      (sale.items || []).forEach((item) => {
        if (item.type !== 'service') return;
        const staffName = (item.staffContributions && item.staffContributions[0])
          ? item.staffContributions[0].staffName
          : (item.staffName || sale.staffName || '—');
        const itemStaffId = (item.staffContributions && item.staffContributions[0])
          ? item.staffContributions[0].staffId
          : item.staffId;
        if (staffId && itemStaffId !== staffId) return;
        const sid = (item.serviceId && item.serviceId.toString) ? item.serviceId.toString() : item.serviceId;
        if (serviceId && sid !== serviceId) return;

        const lineQty = Math.max(1, Math.floor(Number(item.quantity)) || 1);
        const perUnitDur = (sid ? (serviceDurationMap[sid] || 0) : 0);
        const lineTotal = Number(item.total) || 0;
        const perUnitTotal = lineTotal / lineQty;
        for (let u = 0; u < lineQty; u++) {
          rows.push({
            billNo: sale.billNo || '—',
            service: item.name || '—',
            price: item.price ?? 0,
            total: perUnitTotal,
            quantity: 1,
            staff: staffName,
            durationMinutes: perUnitDur,
            customer: sale.customerName || '—',
            date: saleDate ? saleDate.toLocaleDateString() : '—',
            time: saleTimeStr || '—',
            status: (sale.status || '—').toLowerCase(),
            paidStatus,
            paymentMode: paymentModes.join(', ') || '—'
          });
        }
      });
    }

    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }

    let attachment;
    let fileName;
    const exportType = 'Service List Report';
    const periodText = dateRange.from && dateRange.to
      ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`
      : 'All time';

    if (format === 'xlsx') {
      const data = rows.map((r) => ({
        'Bill No.': r.billNo,
        'Service': r.service,
        'Price': r.price,
        'Total': r.total,
        'Qty': r.quantity,
        'Staff': r.staff,
        'Duration (min)': r.durationMinutes,
        'Customer': r.customer,
        'Date': r.date,
        'Time': r.time,
        'Status': r.status,
        'Paid Status': r.paidStatus,
        'Payment Mode': r.paymentMode
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Service List');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `service-list-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = { filename: fileName, content: buffer };
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {});
      let y = addPDFHeader(doc, 'Service List Report', `Period: ${periodText} | Generated: ${new Date().toLocaleString()}`);
      y += 20;
      const headers = ['Bill No.', 'Service', 'Price', 'Total', 'Qty', 'Staff', 'Duration', 'Customer', 'Date', 'Status', 'Paid', 'Mode'];
      const tableRows = rows.map((r) => [
        r.billNo,
        r.service,
        pdfRsAmount(r.price),
        pdfRsAmount(r.total),
        String(r.quantity),
        r.staff,
        `${r.durationMinutes} min`,
        r.customer,
        r.date,
        r.status,
        r.paidStatus,
        r.paymentMode
      ]);
      const colWidths = [50, 100, 50, 55, 30, 80, 50, 80, 70, 45, 45, 60];
      y = addTable(doc, y, headers, tableRows, { colWidths });
      doc.end();
      await new Promise((resolve) => { doc.on('end', resolve); });
      const buffer = Buffer.concat(chunks);
      fileName = `service-list-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = { filename: fileName, content: buffer };
    } else {
      throw new Error(`Unsupported format: ${format}. Supported: xlsx, pdf`);
    }

    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
      } catch (emailError) {
        logger.error('Error sending service list export to', recipient.email, emailError);
      }
    }
    return { success: true, message: 'Service list report sent to recipient(s)' };
  } catch (error) {
    logger.error('Error exporting service list report:', error);
    throw error;
  }
}

/**
 * Generate and email product list report (flattened product line items from sales)
 */
async function exportProductListReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Sale } = businessModels;

    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }

    const { dateFrom, dateTo, productId, staffId, status, paymentMode } = filters;
    const dateRange = getServiceListDateRange(dateFrom, dateTo);

    const query = {};
    if (dateRange.from && dateRange.to) {
      query.date = { $gte: dateRange.from, $lte: dateRange.to };
    }
    if (status) {
      query.status = new RegExp(`^${status}$`, 'i');
    }

    const sales = await Sale.find(query).sort({ date: -1 }).lean();

    const rows = [];
    for (const sale of sales) {
      const paymentModes = (sale.payments && sale.payments.length > 0)
        ? [...new Set(sale.payments.map((p) => p.mode))]
        : (sale.paymentMode ? [sale.paymentMode] : []);
      if (paymentMode && !paymentModes.includes(paymentMode)) continue;

      const totalAmount = sale.paymentStatus?.totalAmount ?? sale.grossTotal ?? 0;
      const paidAmount = sale.paymentStatus?.paidAmount ?? 0;
      const paidStatus = totalAmount <= 0 ? '—' : paidAmount >= totalAmount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
      const saleDate = sale.date ? new Date(sale.date) : null;
      const saleTimeStr = sale.time || '';

      (sale.items || []).forEach((item) => {
        if (item.type !== 'product') return;
        const staffName = (item.staffContributions && item.staffContributions[0])
          ? item.staffContributions[0].staffName
          : (item.staffName || sale.staffName || '—');
        const itemStaffId = (item.staffContributions && item.staffContributions[0])
          ? item.staffContributions[0].staffId
          : item.staffId;
        if (staffId && itemStaffId !== staffId) return;
        const pid = (item.productId && item.productId.toString) ? item.productId.toString() : item.productId;
        if (productId && pid !== productId) return;

        const lineQty = Math.max(1, Math.floor(Number(item.quantity)) || 1);
        const lineTotal = Number(item.total) || 0;
        const perUnitTotal = lineTotal / lineQty;
        for (let u = 0; u < lineQty; u++) {
          rows.push({
            billNo: sale.billNo || '—',
            product: item.name || '—',
            price: item.price ?? 0,
            total: perUnitTotal,
            quantity: 1,
            staff: staffName,
            customer: sale.customerName || '—',
            date: saleDate ? saleDate.toLocaleDateString() : '—',
            time: saleTimeStr || '—',
            status: (sale.status || '—').toLowerCase(),
            paidStatus,
            paymentMode: paymentModes.join(', ') || '—'
          });
        }
      });
    }

    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }

    let attachment;
    let fileName;
    const exportType = 'Product List Report';
    const periodText = dateRange.from && dateRange.to
      ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`
      : 'All time';

    if (format === 'xlsx') {
      const data = rows.map((r) => ({
        'Bill No.': r.billNo,
        'Product': r.product,
        'Price': r.price,
        'Total': r.total,
        'Qty': r.quantity,
        'Staff': r.staff,
        'Customer': r.customer,
        'Date': r.date,
        'Time': r.time,
        'Status': r.status,
        'Paid Status': r.paidStatus,
        'Payment Mode': r.paymentMode
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Product List');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `product-list-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = { filename: fileName, content: buffer };
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {});
      let y = addPDFHeader(doc, 'Product List Report', `Period: ${periodText} | Generated: ${new Date().toLocaleString()}`);
      y += 20;
      const headers = ['Bill No.', 'Product', 'Price', 'Total', 'Qty', 'Staff', 'Customer', 'Date', 'Time', 'Status', 'Paid', 'Mode'];
      const tableRows = rows.map((r) => [
        r.billNo,
        r.product,
        pdfRsAmount(r.price),
        pdfRsAmount(r.total),
        String(r.quantity),
        r.staff,
        r.customer,
        r.date,
        r.time,
        r.status,
        r.paidStatus,
        r.paymentMode
      ]);
      const colWidths = [50, 90, 45, 50, 28, 70, 70, 65, 45, 45, 45, 55];
      y = addTable(doc, y, headers, tableRows, { colWidths });
      doc.end();
      await new Promise((resolve) => { doc.on('end', resolve); });
      const buffer = Buffer.concat(chunks);
      fileName = `product-list-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = { filename: fileName, content: buffer };
    } else {
      throw new Error(`Unsupported format: ${format}. Supported: xlsx, pdf`);
    }

    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
      } catch (emailError) {
        logger.error('Error sending product list export to', recipient.email, emailError);
      }
    }
    return { success: true, message: 'Product list report sent to recipient(s)' };
  } catch (error) {
    logger.error('Error exporting product list report:', error);
    throw error;
  }
}

/**
 * Generate and email appointment list report
 */
async function exportAppointmentListReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Appointment, Client, Sale } = businessModels;

    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }

    const { dateFrom, dateTo, dateFilterType = 'appointment_date', status, showWalkIn } = filters;
    const query = {};
    if (dateFrom && dateTo) {
      const fromStr = String(dateFrom).split('T')[0];
      const toStr = String(dateTo).split('T')[0];
      if (dateFilterType === 'created_date') {
        query.createdAt = {
          $gte: new Date(fromStr + 'T00:00:00.000Z'),
          $lte: new Date(toStr + 'T23:59:59.999Z')
        };
      } else {
        query.date = { $gte: fromStr, $lte: toStr };
      }
    }
    if (status && status !== 'all') {
      if (status === 'new') {
        query.status = { $in: ['scheduled', 'confirmed'] };
      } else {
        const statusMap = { arrived: 'arrived', started: 'service_started', completed: 'completed', cancelled: 'cancelled' };
        const dbStatus = statusMap[status] || status;
        query.status = dbStatus;
      }
    }
    if (showWalkIn === false || showWalkIn === 'false') {
      query.$nor = [{ leadSource: new RegExp('^walk-in$', 'i') }];
    }

    const rawAppointments = await Appointment.find(query).sort({ date: -1, time: -1 }).limit(5000).lean();
    const clientIds = [...new Set(rawAppointments.map((a) => a.clientId).filter(Boolean))];
    const clients = clientIds.length ? await Client.find({ _id: { $in: clientIds } }).select('name').lean() : [];
    const clientMap = new Map(clients.map((c) => [c._id.toString(), c.name || '—']));

    const appointmentIds = rawAppointments.map((a) => a._id);
    const sales = appointmentIds.length ? await Sale.find({ appointmentId: { $in: appointmentIds } }).lean() : [];
    const saleByAppointmentId = new Map(sales.map((s) => [s.appointmentId?.toString(), s]));

    const rows = rawAppointments.map((apt) => {
      const sale = saleByAppointmentId.get(apt._id.toString());
      const totalAmount = sale?.paymentStatus?.totalAmount ?? sale?.grossTotal ?? 0;
      const paidAmount = sale?.paymentStatus?.paidAmount ?? 0;
      const paymentStatus = totalAmount <= 0 ? '—' : paidAmount >= totalAmount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
      const statusLabel = { scheduled: 'New', confirmed: 'New', arrived: 'Arrived', service_started: 'Started', completed: 'Completed', cancelled: 'Cancelled' }[apt.status] || apt.status;
      return {
        customerName: clientMap.get(apt.clientId?.toString()) || '—',
        createdAt: apt.createdAt ? new Date(apt.createdAt).toLocaleDateString() : '—',
        startDate: apt.date ? `${apt.date} ${apt.time || ''}`.trim() : '—',
        price: apt.price ?? 0,
        status: statusLabel,
        paymentStatus,
        billNo: null
      };
    });

    if (showWalkIn !== false && showWalkIn !== 'false') {
      const saleQuery = {
        $or: [{ appointmentId: null }, { appointmentId: { $exists: false } }],
        'items.type': 'service'
      };
      if (dateFrom && dateTo) {
        const fromStr = String(dateFrom).split('T')[0];
        const toStr = String(dateTo).split('T')[0];
        if (dateFilterType === 'created_date') {
          saleQuery.createdAt = {
            $gte: new Date(fromStr + 'T00:00:00.000Z'),
            $lte: new Date(toStr + 'T23:59:59.999Z')
          };
        } else {
          saleQuery.date = { $gte: new Date(fromStr + 'T00:00:00.000Z'), $lte: new Date(toStr + 'T23:59:59.999Z') };
        }
      }
      if (status && status !== 'all') {
        if (status === 'cancelled') saleQuery.status = new RegExp('^cancelled$', 'i');
        else if (status === 'completed') saleQuery.status = new RegExp('^completed$', 'i');
      }
      const walkInSales = await Sale.find(saleQuery).sort({ date: -1, time: -1 }).limit(5000).lean();
      walkInSales.forEach((sale) => {
        const saleDate = sale.date ? new Date(sale.date) : null;
        const dateStr = saleDate ? saleDate.toISOString().slice(0, 10) : '';
        const totalAmount = sale.paymentStatus?.totalAmount ?? sale.grossTotal ?? 0;
        const paidAmount = sale.paymentStatus?.paidAmount ?? 0;
        const paymentStatus = totalAmount <= 0 ? '—' : paidAmount >= totalAmount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
        const statusStr = String(sale.status || '').toLowerCase();
        const statusLabel = statusStr === 'cancelled' ? 'Cancelled' : 'Completed';
        rows.push({
          customerName: sale.customerName || '—',
          createdAt: sale.createdAt ? new Date(sale.createdAt).toLocaleDateString() : '—',
          startDate: dateStr ? `${dateStr} ${sale.time || ''}`.trim() : '—',
          price: sale.grossTotal ?? 0,
          status: statusLabel,
          paymentStatus
        });
      });
      rows.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    }

    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }

    let attachment;
    let fileName;
    const exportType = 'Appointment List Report';
    const periodText = dateFrom && dateTo ? `${String(dateFrom).split('T')[0]} - ${String(dateTo).split('T')[0]}` : 'All time';

    if (format === 'xlsx') {
      const data = rows.map((r) => ({
        'Customer Name': r.customerName,
        'Created Date': r.createdAt,
        'Start Date': r.startDate,
        'Price': r.price,
        'Status': r.status,
        'Payment Status': r.paymentStatus
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Appointment List');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `appointment-list-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = { filename: fileName, content: buffer };
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {});
      let y = addPDFHeader(doc, 'Appointment List Report', `Period: ${periodText} | Generated: ${new Date().toLocaleString()}`);
      y += 20;
      const headers = ['Customer', 'Created', 'Start Date', 'Price', 'Status', 'Payment'];
      const tableRows = rows.map((r) => [
        r.customerName,
        r.createdAt,
        r.startDate,
        pdfRsAmount(r.price),
        r.status,
        r.paymentStatus
      ]);
      const colWidths = [100, 80, 100, 60, 70, 60];
      y = addTable(doc, y, headers, tableRows, { colWidths });
      doc.end();
      await new Promise((resolve) => { doc.on('end', resolve); });
      const buffer = Buffer.concat(chunks);
      fileName = `appointment-list-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = { filename: fileName, content: buffer };
    } else {
      throw new Error(`Unsupported format: ${format}. Supported: xlsx, pdf`);
    }

    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
      } catch (emailError) {
        logger.error('Error sending appointment list export to', recipient.email, emailError);
      }
    }
    return { success: true, message: 'Appointment list report sent to recipient(s)' };
  } catch (error) {
    logger.error('Error exporting appointment list report:', error);
    throw error;
  }
}

/**
 * Generate and email unpaid/part-paid report
 */
async function exportUnpaidPartPaidReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { Sale } = businessModels;

    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }

    const { dateFrom, dateTo, status } = filters;
    const { fetchUnpaidPartPaidReportData } = require('../lib/unpaid-part-paid-report');
    const { rows: rawRows } = await fetchUnpaidPartPaidReportData({
      Sale,
      branchId,
      dateFrom,
      dateTo,
      status: status != null ? String(status) : 'all'
    });
    const rows = rawRows.map((r) => ({
      billNo: r.billNo,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      date: r.date ? new Date(r.date).toLocaleDateString() : '—',
      invoiceAmount: r.invoiceAmount,
      outstandingAmount: r.outstandingAmount,
      duesSettledInPeriod: r.duesSettledInPeriod,
      status: r.status
    }));

    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }

    let attachment;
    let fileName;
    const exportType = 'Unpaid/Part-Paid Report';
    const periodText = dateFrom && dateTo ? `${String(dateFrom).split('T')[0]} - ${String(dateTo).split('T')[0]}` : 'All time';

    if (format === 'xlsx') {
      const data = rows.map((r) => ({
        'Invoice Number': r.billNo,
        'Customer Name': r.customerName,
        'Phone': r.customerPhone,
        'Date': r.date,
        'Invoice Amount': r.invoiceAmount,
        'Dues settled (period)': r.duesSettledInPeriod,
        'Outstanding Amount': r.outstandingAmount,
        'Status': r.status
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Unpaid Part-Paid');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `unpaid-part-paid-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = { filename: fileName, content: buffer };
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {});
      let y = addPDFHeader(doc, exportType, `Period: ${periodText} | Generated: ${new Date().toLocaleString()}`);
      y += 20;
      const headers = ['Invoice', 'Customer', 'Date', 'Inv Amt', 'Dues settled', 'Outstanding', 'Status'];
      const tableRows = rows.map((r) => [
        r.billNo,
        r.customerName,
        r.date,
        pdfRsAmount(r.invoiceAmount),
        pdfRsAmount(r.duesSettledInPeriod),
        pdfRsAmount(r.outstandingAmount),
        r.status
      ]);
      const colWidths = [68, 84, 68, 64, 68, 64, 56];
      y = addTable(doc, y, headers, tableRows, { colWidths });
      doc.end();
      await new Promise((resolve) => { doc.on('end', resolve); });
      const buffer = Buffer.concat(chunks);
      fileName = `unpaid-part-paid-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = { filename: fileName, content: buffer };
    } else {
      throw new Error(`Unsupported format: ${format}. Supported: xlsx, pdf`);
    }

    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
      } catch (emailError) {
        logger.error('Error sending unpaid/part-paid export to', recipient.email, emailError);
      }
    }
    return { success: true, message: 'Unpaid/Part-Paid report sent to recipient(s)' };
  } catch (error) {
    logger.error('Error exporting unpaid/part-paid report:', error);
    throw error;
  }
}

/**
 * Generate and email deleted invoices report (archived bills)
 */
async function exportDeletedInvoicesReport({ branchId, format = 'xlsx', filters = {} }) {
  try {
    const mainConnection = await databaseManager.getMainConnection();
    const businessDb = await databaseManager.getConnection(branchId, mainConnection);
    const businessModels = modelFactory.createBusinessModels(businessDb);
    const { BillArchive } = businessModels;

    const emailService = require('../services/email-service');
    if (!emailService.initialized) {
      await emailService.initialize();
    }

    const { archivedAtRangeFromParams } = require('./archived-date-query');
    const { date, dateFrom, dateTo } = filters;
    const query = {};
    const range = archivedAtRangeFromParams({ dateFrom, dateTo, date });
    if (range) {
      query.archivedAt = range;
    }
    const archives = await BillArchive.find(query).sort({ archivedAt: -1 }).limit(5000).lean();
    const rows = archives.map((a) => ({
      customerName: a.originalBill?.customerName || '—',
      date: a.archivedAt ? new Date(a.archivedAt).toLocaleDateString() : '—',
      reason: a.reason || '—',
      cancelledBy: a.archivedByName || '—',
      grossTotal: a.originalBill?.grossTotal ?? 0
    }));

    const Business = mainConnection.model('Business', require('../models/Business').schema);
    const business = await Business.findById(branchId);
    if (business) throwIfPlatformEmailDisabled(business);
    const recipients = await getReportExportRecipientList(branchId, mainConnection, businessModels);
    if (recipients.length === 0) {
      throw new Error('No recipient email found to send export to. Ensure an admin user has an email, or enable "Allow reports delivery" for a staff member with email notifications on.');
    }

    let attachment;
    let fileName;
    const exportType = 'Deleted Invoice Report';
    const periodText = dateFrom && dateTo ? `${String(dateFrom).split('T')[0]} - ${String(dateTo).split('T')[0]}` : date ? String(date).split('T')[0] : 'All time';

    if (format === 'xlsx') {
      const data = rows.map((r) => ({
        'Customer Name': r.customerName,
        'Date': r.date,
        'Reason': r.reason,
        'Cancelled By': r.cancelledBy,
        'Gross Total': r.grossTotal
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Deleted Invoices');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      fileName = `deleted-invoices-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      attachment = { filename: fileName, content: buffer };
    } else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {});
      let y = addPDFHeader(doc, 'Deleted Invoice Report', `Date: ${periodText} | Generated: ${new Date().toLocaleString()}`);
      y += 20;
      const headers = ['Customer', 'Date', 'Reason', 'Cancelled By', 'Gross Total'];
      const tableRows = rows.map((r) => [
        r.customerName,
        r.date,
        r.reason,
        r.cancelledBy,
        pdfRsAmount(r.grossTotal)
      ]);
      const colWidths = [100, 80, 120, 80, 80];
      y = addTable(doc, y, headers, tableRows, { colWidths });
      doc.end();
      await new Promise((resolve) => { doc.on('end', resolve); });
      const buffer = Buffer.concat(chunks);
      fileName = `deleted-invoices-report-${new Date().toISOString().split('T')[0]}.pdf`;
      attachment = { filename: fileName, content: buffer };
    } else {
      throw new Error(`Unsupported format: ${format}. Supported: xlsx, pdf`);
    }

    for (const recipient of recipients) {
      try {
        await emailService.sendExportReady({
          to: recipient.email,
          exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
      } catch (emailError) {
        logger.error('Error sending deleted invoice export to', recipient.email, emailError);
      }
    }
    return { success: true, message: 'Deleted invoice report sent to recipient(s)' };
  } catch (error) {
    logger.error('Error exporting deleted invoice report:', error);
    throw error;
  }
}

module.exports = {
  exportProductsReport,
  exportSalesReport,
  exportServicesReport,
  exportClientsReport,
  exportExpenseReport,
  exportCashRegistryReport,
  exportSummaryReport,
  exportStaffPerformanceReport,
  exportServiceListReport,
  exportProductListReport,
  exportAppointmentListReport,
  exportDeletedInvoicesReport,
  exportUnpaidPartPaidReport
};

