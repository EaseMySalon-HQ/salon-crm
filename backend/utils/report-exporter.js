const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const databaseManager = require('../config/database-manager');
const modelFactory = require('../models/model-factory');

/**
 * Helper function to add a styled header to PDF
 */
function addPDFHeader(doc, title, subtitle = null) {
  // Header background
  doc.rect(0, 0, doc.page.width, 80)
     .fillColor('#1e40af')
     .fill();
  
  // Title
  doc.fillColor('#ffffff')
     .fontSize(24)
     .font('Helvetica-Bold')
     .text(title, 50, 30, { align: 'center', width: doc.page.width - 100 });
  
  if (subtitle) {
    doc.fontSize(12)
       .font('Helvetica')
       .text(subtitle, 50, 60, { align: 'center', width: doc.page.width - 100 });
  }
  
  // Reset fill color
  doc.fillColor('#000000');
  
  return 100; // Return Y position after header
}

/**
 * Helper function to add a summary box
 */
function addSummaryBox(doc, x, y, label, value, color = '#3b82f6', boxWidth = null) {
  if (!boxWidth) {
    boxWidth = (doc.page.width - 100) / 2;
  }
  const boxHeight = 50;
  
  // Box background
  doc.rect(x, y, boxWidth, boxHeight)
     .fillColor(color)
     .fill();
  
  // Label
  doc.fillColor('#ffffff')
     .fontSize(10)
     .font('Helvetica')
     .text(label, x + 10, y + 10, { width: boxWidth - 20 });
  
  // Value
  doc.fontSize(18)
     .font('Helvetica-Bold')
     .text(value, x + 10, y + 25, { width: boxWidth - 20 });
  
  // Reset fill color
  doc.fillColor('#000000');
  
  return boxHeight;
}

/**
 * Helper function to add a table with headers
 */
function addTable(doc, startY, headers, rows, options = {}) {
  const { headerColor = '#1e40af', rowColor = '#f3f4f6', textColor = '#000000' } = options;
  const colWidths = options.colWidths || [];
  const pageWidth = doc.page.width - 100;
  const numCols = headers.length;
  const colWidth = colWidths.length === numCols 
    ? colWidths 
    : Array(numCols).fill(pageWidth / numCols);
  
  let y = startY;
  const rowHeight = 25;
  const headerHeight = 30;
  
  // Table header
  let x = 50;
  doc.rect(x, y, pageWidth, headerHeight)
     .fillColor(headerColor)
     .fill();
  
  doc.fillColor('#ffffff')
     .fontSize(11)
     .font('Helvetica-Bold');
  
  headers.forEach((header, i) => {
    const cellX = x + colWidth.slice(0, i).reduce((sum, w) => sum + w, 0);
    doc.text(header, cellX + 5, y + 8, { width: colWidth[i] - 10, align: 'left' });
  });
  
  doc.fillColor(textColor);
  y += headerHeight;
  
  // Table rows
  rows.forEach((row, rowIndex) => {
    if (y + rowHeight > doc.page.height - 50) {
      doc.addPage();
      y = 50;
    }
    
    // Alternate row color
    if (rowIndex % 2 === 0) {
      doc.rect(50, y, pageWidth, rowHeight)
         .fillColor(rowColor)
         .fill();
    }
    
    doc.fontSize(9)
       .font('Helvetica');
    
    row.forEach((cell, i) => {
      const cellX = 50 + colWidth.slice(0, i).reduce((sum, w) => sum + w, 0);
      doc.fillColor(textColor)
         .text(String(cell || ''), cellX + 5, y + 7, { width: colWidth[i] - 10, align: 'left' });
    });
    
    y += rowHeight;
  });
  
  // Reset fill color
  doc.fillColor('#000000');
  
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
    
    // Get admin users
    const User = mainConnection.model('User', require('../models/User').schema);
    const adminUsers = await User.find({
      branchId: branchId,
      role: 'admin',
      email: { $exists: true, $ne: '' }
    }).lean();
    
    if (adminUsers.length === 0) {
      throw new Error('No admin email found to send export to');
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
      y += boxHeight + 20;
      
      doc.addPage();
      y = 50;
      
      // Table headers and data
      const headers = ['#', 'Product Name', 'Category', 'Stock', 'Price', 'Status'];
      const rows = products.map((product, index) => [
        (index + 1).toString(),
        product.name || 'N/A',
        product.category || 'N/A',
        (product.stock || 0).toString(),
        `₹${(product.price || 0).toFixed(2)}`,
        (product.stock || 0) < (product.minimumStock || product.minStock || 0) ? '⚠️ Low' : '✓ OK'
      ]);
      
      const colWidths = [30, 200, 100, 60, 80, 60];
      y = addTable(doc, y, headers, rows, { colWidths });
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Total Inventory Value: ₹${totalValue.toFixed(2)}`, 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });
      
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
    
    // Send email to all admin users
    for (const admin of adminUsers) {
      try {
        await emailService.sendExportReady({
          to: admin.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        console.log(`✅ Products report sent to ${admin.email}`);
      } catch (emailError) {
        console.error(`❌ Error sending products report to ${admin.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Products report sent to admin email(s)` };
  } catch (error) {
    console.error('Error exporting products report:', error);
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
    
    // Get admin users
    const User = mainConnection.model('User', require('../models/User').schema);
    const adminUsers = await User.find({
      branchId: branchId,
      role: 'admin',
      email: { $exists: true, $ne: '' }
    }).lean();
    
    if (adminUsers.length === 0) {
      throw new Error('No admin email found to send export to');
    }
    
    let attachment;
    let fileName;
    let exportType = 'Sales Report';
    
    if (format === 'xlsx') {
      // Generate Excel file
      const data = sales.map(sale => ({
        "Bill No.": sale.billNo,
        "Customer Name": sale.customerName,
        "Date": sale.date ? new Date(sale.date).toLocaleDateString() : '',
        "Status": String(sale.status || '').trim(),
        "Payment Mode": sale.paymentMode || 'N/A',
        "Net Total": parseFloat(sale.netTotal) || 0,
        "Tax Amount": parseFloat(sale.taxAmount) || 0,
        "Gross Total": parseFloat(sale.grossTotal) || 0,
        "Staff Name": sale.staffName || 'N/A'
      }));
      
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
      const boxHeight = addSummaryBox(doc, 50, y, 'Total Revenue', `₹${totalRevenue.toFixed(2)}`, '#10b981', boxWidth);
      addSummaryBox(doc, 50 + boxWidth + 10, y, 'Completed', completedSales.toString(), '#3b82f6', boxWidth);
      addSummaryBox(doc, 50 + (boxWidth + 10) * 2, y, 'Partial', partialSales.toString(), '#f59e0b', boxWidth);
      addSummaryBox(doc, 50 + (boxWidth + 10) * 3, y, 'Unpaid', unpaidSales.toString(), '#ef4444', boxWidth);
      y += boxHeight + 20;
      
      doc.addPage();
      y = 50;
      
      // Table
      const headers = ['Bill No', 'Customer', 'Date', 'Amount', 'Status', 'Payment'];
      const rows = sales.slice(0, 100).map(sale => [
        sale.billNo || 'N/A',
        (sale.customerName || 'N/A').substring(0, 20),
        sale.date ? new Date(sale.date).toLocaleDateString() : 'N/A',
        `₹${(sale.grossTotal || 0).toFixed(2)}`,
        sale.status || 'N/A',
        sale.paymentMode || 'N/A'
      ]);
      
      const colWidths = [60, 120, 80, 80, 60, 80];
      y = addTable(doc, y, headers, rows, { colWidths });
      
      if (sales.length > 100) {
        doc.fontSize(10)
           .fillColor('#6b7280')
           .text(`... and ${sales.length - 100} more sales`, 50, y + 10, { align: 'center', width: doc.page.width - 100 });
      }
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Total Sales: ${sales.length} | Total Revenue: ₹${totalRevenue.toFixed(2)}`, 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });
      
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
    
    // Send email to all admin users
    for (const admin of adminUsers) {
      try {
        await emailService.sendExportReady({
          to: admin.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        console.log(`✅ Sales report sent to ${admin.email}`);
      } catch (emailError) {
        console.error(`❌ Error sending sales report to ${admin.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Sales report sent to admin email(s)` };
  } catch (error) {
    console.error('Error exporting sales report:', error);
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
    
    const User = mainConnection.model('User', require('../models/User').schema);
    const adminUsers = await User.find({
      branchId: branchId,
      role: 'admin',
      email: { $exists: true, $ne: '' }
    }).lean();
    
    if (adminUsers.length === 0) {
      throw new Error('No admin email found to send export to');
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
      addSummaryBox(doc, 50 + boxWidth + 10, y, 'Average Price', `₹${avgPrice.toFixed(2)}`, '#10b981', boxWidth);
      y += boxHeight + 20;
      
      doc.addPage();
      y = 50;
      
      // Table
      const headers = ['#', 'Service Name', 'Category', 'Price', 'Duration', 'Status'];
      const rows = services.map((service, index) => [
        (index + 1).toString(),
        service.name || 'N/A',
        service.category || 'N/A',
        `₹${(service.price || 0).toFixed(2)}`,
        service.duration ? `${service.duration} min` : 'N/A',
        service.status || 'active'
      ]);
      
      const colWidths = [30, 180, 100, 80, 80, 60];
      y = addTable(doc, y, headers, rows, { colWidths });
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Total Services: ${totalServices}`, 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });
      
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
    
    for (const admin of adminUsers) {
      try {
        await emailService.sendExportReady({
          to: admin.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        console.log(`✅ Services report sent to ${admin.email}`);
      } catch (emailError) {
        console.error(`❌ Error sending services report to ${admin.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Services report sent to admin email(s)` };
  } catch (error) {
    console.error('Error exporting services report:', error);
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
    
    const User = mainConnection.model('User', require('../models/User').schema);
    const adminUsers = await User.find({
      branchId: branchId,
      role: 'admin',
      email: { $exists: true, $ne: '' }
    }).lean();
    
    if (adminUsers.length === 0) {
      throw new Error('No admin email found to send export to');
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
      y += boxHeight + 20;
      
      doc.addPage();
      y = 50;
      
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
         .text(`Total Clients: ${totalClients} | Active: ${activeClients}`, 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });
      
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
    
    for (const admin of adminUsers) {
      try {
        await emailService.sendExportReady({
          to: admin.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        console.log(`✅ Clients report sent to ${admin.email}`);
      } catch (emailError) {
        console.error(`❌ Error sending clients report to ${admin.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Clients report sent to admin email(s)` };
  } catch (error) {
    console.error('Error exporting clients report:', error);
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
    
    const User = mainConnection.model('User', require('../models/User').schema);
    const adminUsers = await User.find({
      branchId: branchId,
      role: 'admin',
      email: { $exists: true, $ne: '' }
    }).lean();
    
    if (adminUsers.length === 0) {
      throw new Error('No admin email found to send export to');
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
      const boxHeight = addSummaryBox(doc, 50, y, 'Total Expenses', `₹${totalExpenses.toFixed(2)}`, '#ef4444', boxWidth);
      addSummaryBox(doc, 50 + boxWidth + 10, y, 'Average Expense', `₹${avgExpense.toFixed(2)}`, '#f59e0b', boxWidth);
      y += boxHeight + 20;
      
      doc.addPage();
      y = 50;
      
      // Table
      const headers = ['#', 'Category', 'Description', 'Date', 'Amount', 'Payment Method'];
      const rows = expenses.map((expense, index) => [
        (index + 1).toString(),
        expense.category || 'N/A',
        (expense.description || '').substring(0, 30),
        expense.date ? new Date(expense.date).toLocaleDateString() : 'N/A',
        `₹${(expense.amount || 0).toFixed(2)}`,
        expense.paymentMethod || 'N/A'
      ]);
      
      const colWidths = [30, 100, 150, 80, 80, 100];
      y = addTable(doc, y, headers, rows, { colWidths });
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Total Expenses: ₹${totalExpenses.toFixed(2)} | Records: ${expenses.length}`, 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });
      
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
    
    for (const admin of adminUsers) {
      try {
        await emailService.sendExportReady({
          to: admin.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        console.log(`✅ Expense report sent to ${admin.email}`);
      } catch (emailError) {
        console.error(`❌ Error sending expense report to ${admin.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Expense report sent to admin email(s)` };
  } catch (error) {
    console.error('Error exporting expense report:', error);
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
    
    const User = mainConnection.model('User', require('../models/User').schema);
    const adminUsers = await User.find({
      branchId: branchId,
      role: 'admin',
      email: { $exists: true, $ne: '' }
    }).lean();
    
    if (adminUsers.length === 0) {
      throw new Error('No admin email found to send export to');
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
        for (const [dateKey, summary] of dateMap.entries()) {
          const dateStart = new Date(dateKey);
          dateStart.setHours(0, 0, 0, 0);
          const dateEnd = new Date(dateKey);
          dateEnd.setHours(23, 59, 59, 999);
          
          const sales = await Sale.find({
            date: { $gte: dateStart, $lte: dateEnd },
            status: { $ne: 'cancelled' }
          }).lean();
          
          summary.cashCollected = sales
            .filter(s => s.paymentMode?.toLowerCase().includes('cash') || 
                       s.payments?.some(p => p.mode?.toLowerCase() === 'cash'))
            .reduce((sum, s) => {
              if (s.payments && s.payments.length > 0) {
                return sum + (s.payments.filter(p => p.mode?.toLowerCase() === 'cash')
                  .reduce((pSum, p) => pSum + (p.amount || 0), 0));
              }
              return sum + (s.netTotal || 0);
            }, 0);
          
          summary.onlineSales = sales
            .filter(s => s.paymentMode?.toLowerCase().includes('online') || 
                       s.paymentMode?.toLowerCase().includes('card') ||
                       s.payments?.some(p => p.mode?.toLowerCase() === 'online' || p.mode?.toLowerCase() === 'card'))
            .reduce((sum, s) => {
              if (s.payments && s.payments.length > 0) {
                return sum + (s.payments.filter(p => 
                  p.mode?.toLowerCase() === 'online' || p.mode?.toLowerCase() === 'card')
                  .reduce((pSum, p) => pSum + (p.amount || 0), 0));
              }
              return sum + (s.netTotal || 0);
            }, 0);
          
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
        addSummaryBox(doc, 50 + boxWidth + 10, y, 'Avg Opening', `₹${avgOpening.toFixed(2)}`, '#10b981', boxWidth);
        addSummaryBox(doc, 50 + (boxWidth + 10) * 2, y, 'Avg Closing', `₹${avgClosing.toFixed(2)}`, '#f59e0b', boxWidth);
        y += boxHeight + 20;
        
        doc.addPage();
        y = 50;
        
        // Table
        const headers = ['#', 'Date', 'Opening Balance', 'Closing Balance', 'Difference'];
        const rows = summaries.map((summary, index) => [
          (index + 1).toString(),
          new Date(summary.date).toLocaleDateString(),
          `₹${summary.openingBalance.toFixed(2)}`,
          `₹${summary.closingBalance.toFixed(2)}`,
          `₹${(summary.closingBalance - summary.openingBalance).toFixed(2)}`
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
        y += boxHeight + 20;
        
        doc.addPage();
        y = 50;
        
        // Table
        const headers = ['#', 'Date', 'Shift', 'Opening', 'Closing', 'Status'];
        const rows = entries.map((entry, index) => [
          (index + 1).toString(),
          entry.date ? new Date(entry.date).toLocaleDateString() : 'N/A',
          entry.shiftType === 'opening' ? 'Opening' : 'Closing',
          `₹${(entry.openingBalance || 0).toFixed(2)}`,
          `₹${(entry.closingBalance || 0).toFixed(2)}`,
          entry.isVerified ? '✓ Verified' : '⏳ Pending'
        ]);
        
        const colWidths = [30, 100, 80, 100, 100, 80];
        y = addTable(doc, y, headers, rows, { colWidths });
      }
      
      // Footer
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text(`Generated: ${new Date().toLocaleString()}`, 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });
      
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
    
    for (const admin of adminUsers) {
      try {
        await emailService.sendExportReady({
          to: admin.email,
          exportType: exportType,
          businessName: business?.name || 'Business',
          attachments: [attachment]
        });
        console.log(`✅ Cash registry report sent to ${admin.email}`);
      } catch (emailError) {
        console.error(`❌ Error sending cash registry report to ${admin.email}:`, emailError);
      }
    }
    
    return { success: true, message: `Cash registry report sent to admin email(s)` };
  } catch (error) {
    console.error('Error exporting cash registry report:', error);
    throw error;
  }
}

module.exports = {
  exportProductsReport,
  exportSalesReport,
  exportServicesReport,
  exportClientsReport,
  exportExpenseReport,
  exportCashRegistryReport
};

