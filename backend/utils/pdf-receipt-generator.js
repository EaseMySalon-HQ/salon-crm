const PDFDocument = require('pdfkit');

/**
 * Generate PDF receipt buffer from receipt data
 * @param {Object} receiptData - Receipt data object
 * @param {Object} businessSettings - Business settings (name, address, etc.)
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateReceiptPDF(receiptData, businessSettings = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [300, 600], // Thermal receipt size (80mm width)
        margins: { top: 20, bottom: 20, left: 15, right: 15 }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Business Header
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .text(businessSettings.name || 'Business', { align: 'center' });
      
      doc.moveDown(0.3);
      
      // Address (format properly if it's a string)
      if (businessSettings.address) {
        const addressText = typeof businessSettings.address === 'string' 
          ? businessSettings.address 
          : '';
        if (addressText) {
          doc.fontSize(9)
             .font('Helvetica')
             .text(addressText, { align: 'center' });
        }
      }
      
      // Phone and Email on same line if both exist
      const contactInfo = [];
      if (businessSettings.phone) contactInfo.push(`Tel: ${businessSettings.phone}`);
      if (businessSettings.email) contactInfo.push(`Email: ${businessSettings.email}`);
      
      if (contactInfo.length > 0) {
        doc.fontSize(9)
           .font('Helvetica')
           .text(contactInfo.join(' | '), { align: 'center' });
      }

      doc.moveDown(0.5);
      
      // Separator line
      doc.fontSize(10)
         .font('Helvetica')
         .text('─'.repeat(32), { align: 'center' });
      
      doc.moveDown(0.5);

      // Receipt Info
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text('RECEIPT DETAILS', { align: 'center' });
      
      doc.moveDown(0.3);
      
      doc.fontSize(9)
         .font('Helvetica')
         .text(`Receipt No: ${receiptData.receiptNumber}`, { align: 'left' });
      
      if (receiptData.date) {
        doc.text(`Date: ${receiptData.date}`, { align: 'left' });
      }
      
      if (receiptData.clientName) {
        doc.text(`Customer: ${receiptData.clientName}`, { align: 'left' });
      }

      doc.moveDown(0.5);
      doc.fontSize(10)
         .text('─'.repeat(32), { align: 'center' });
      doc.moveDown(0.5);

      // Items
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .text('ITEMS', { align: 'left' });
      doc.moveDown(0.3);

      if (receiptData.items && receiptData.items.length > 0) {
        receiptData.items.forEach((item, index) => {
          const itemName = item.name || 'Item';
          const quantity = item.quantity || 1;
          const price = item.price || 0;
          const total = item.total || (price * quantity);
          
          // Item name and quantity on first line
          doc.fontSize(9)
             .font('Helvetica')
             .text(`${index + 1}. ${itemName}`, { align: 'left' });
          
          if (quantity > 1) {
            doc.fontSize(8)
               .text(`   ${quantity} x ₹${price.toFixed(2)}`, { align: 'left' });
          }
          
          // Total aligned to right
          doc.fontSize(9)
             .font('Helvetica-Bold')
             .text(`₹${total.toFixed(2)}`, { align: 'right' });
          
          doc.moveDown(0.25);
        });
      } else {
        doc.fontSize(9)
           .font('Helvetica')
           .text('No items', { align: 'left' });
      }

      doc.moveDown(0.5);
      doc.fontSize(10)
         .text('─'.repeat(32), { align: 'center' });
      doc.moveDown(0.5);

      // Totals Section
      doc.fontSize(9)
         .font('Helvetica')
         .text(`Subtotal:`, { align: 'left', continued: true })
         .text(`₹${(receiptData.subtotal || 0).toFixed(2)}`, { align: 'right' });
      
      if (receiptData.tax && receiptData.tax > 0) {
        doc.text(`Tax:`, { align: 'left', continued: true })
           .text(`₹${receiptData.tax.toFixed(2)}`, { align: 'right' });
      }
      
      if (receiptData.discount && receiptData.discount > 0) {
        doc.text(`Discount:`, { align: 'left', continued: true })
           .text(`-₹${receiptData.discount.toFixed(2)}`, { align: 'right' });
      }
      
      if (receiptData.tip && receiptData.tip > 0) {
        doc.text(`Tip:`, { align: 'left', continued: true })
           .text(`₹${receiptData.tip.toFixed(2)}`, { align: 'right' });
      }

      doc.moveDown(0.3);
      doc.fontSize(10)
         .text('─'.repeat(32), { align: 'center' });
      doc.moveDown(0.3);
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text(`TOTAL:`, { align: 'left', continued: true })
         .text(`₹${(receiptData.total || 0).toFixed(2)}`, { align: 'right' });

      doc.moveDown(0.5);
      doc.fontSize(9)
         .font('Helvetica')
         .text(`Payment Method: ${receiptData.paymentMethod || 'N/A'}`, { align: 'left' });

      doc.moveDown(1);
      doc.fontSize(10)
         .text('─'.repeat(32), { align: 'center' });
      doc.moveDown(0.5);

      // Footer
      doc.fontSize(9)
         .font('Helvetica')
         .text('Thank you for your visit!', { align: 'center' });
      
      doc.moveDown(0.3);
      doc.fontSize(8)
         .font('Helvetica')
         .text('We appreciate your business', { align: 'center' });
      
      if (businessSettings.name) {
        doc.moveDown(0.3);
        doc.text(`Visit us again at ${businessSettings.name}`, { align: 'center' });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generateReceiptPDF
};

