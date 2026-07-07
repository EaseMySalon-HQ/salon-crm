'use strict';

const PDFDocument = require('pdfkit');

function fmtMoney(amount, currency = 'INR') {
  const value = Math.abs(Number(amount) || 0);
  const formatted = value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const prefix = currency === 'INR' ? 'Rs.' : currency;
  return Number(amount) < 0 ? `- ${prefix} ${formatted}` : `${prefix} ${formatted}`;
}

function formatPayPeriodMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return String(month || '');
  const [y, m] = String(month).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function buildBusinessLines(businessSettings = {}) {
  const lines = [];
  if (businessSettings.name) lines.push({ text: businessSettings.name, bold: true, size: 16 });
  if (businessSettings.address) lines.push({ text: businessSettings.address, size: 9 });
  const cityLine = [businessSettings.city, businessSettings.state, businessSettings.zipCode]
    .filter(Boolean)
    .join(', ');
  if (cityLine) lines.push({ text: cityLine, size: 9 });
  const contact = [];
  if (businessSettings.phone) contact.push(`Phone: ${businessSettings.phone}`);
  if (businessSettings.email) contact.push(`Email: ${businessSettings.email}`);
  if (contact.length) lines.push({ text: contact.join('  |  '), size: 9 });
  if (businessSettings.gstNumber) lines.push({ text: `GSTIN: ${businessSettings.gstNumber}`, size: 9 });
  return lines;
}

/**
 * Generate salary slip PDF buffer (A4, ASCII-safe currency).
 * @param {object} row - Payroll record fields
 * @param {object} businessSettings - Tenant business settings
 * @param {string} periodLabel
 */
async function generatePayslipPdfBuffer(row, businessSettings = {}, periodLabel = '') {
  const currency = businessSettings.currency || 'INR';
  const money = (n) => fmtMoney(n, currency);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      let y = doc.y;

      for (const line of buildBusinessLines(businessSettings)) {
        doc.font(line.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(line.size || 10);
        doc.text(line.text, 40, y, { width: 515 });
        y = doc.y + 4;
      }

      y += 8;
      doc.rect(40, y, 515, 28).fill('#334155');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13);
      doc.text('SALARY SLIP', 40, y + 6, { width: 515, align: 'center' });
      doc.font('Helvetica').fontSize(9);
      doc.text(periodLabel || formatPayPeriodMonth(row.month), 40, y + 18, { width: 515, align: 'center' });
      doc.fillColor('#000000');
      y += 36;

      const generatedOn = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      doc.font('Helvetica').fontSize(10);
      const info = [
        ['Employee', row.staffName || '—', 'Pay period', formatPayPeriodMonth(row.month)],
        ['Designation', row.role || '—', 'Slip date', generatedOn],
        ['Phone', row.phone || '—', 'Status', row.status === 'paid' ? 'Paid' : 'Pending'],
      ];
      for (const [l1, v1, l2, v2] of info) {
        doc.font('Helvetica-Bold').text(l1, 40, y, { continued: true, width: 90 });
        doc.font('Helvetica').text(`  ${v1}`, { width: 170 });
        const x2 = 310;
        doc.font('Helvetica-Bold').text(l2, x2, y, { continued: true, width: 80 });
        doc.font('Helvetica').text(`  ${v2}`);
        y = doc.y + 6;
      }

      y += 8;
      doc.font('Helvetica-Bold').fontSize(11).text('Earnings', 40, y);
      y += 16;
      const earnings = [
        ['Base salary', money(row.baseSalary || 0)],
        ['Commission / incentive', money(row.incentive || 0)],
      ];
      if ((row.bonus || 0) > 0) earnings.push(['Bonus', money(row.bonus)]);
      if ((row.overtimePay || 0) > 0) earnings.push(['Overtime pay', money(row.overtimePay)]);

      for (const [label, amt] of earnings) {
        doc.font('Helvetica').fontSize(10).text(label, 40, y, { width: 350, continued: false });
        doc.text(amt, 400, y, { width: 155, align: 'right' });
        y += 16;
      }

      const totalEarnings =
        (row.baseSalary || 0) + (row.incentive || 0) + (row.bonus || 0) + (row.overtimePay || 0);
      doc.font('Helvetica-Bold').text('Total earnings', 40, y, { width: 350 });
      doc.text(money(totalEarnings), 400, y, { width: 155, align: 'right' });
      y += 20;

      if ((row.deductions || 0) > 0) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#b91c1c').text('Deductions', 40, y);
        doc.fillColor('#000000');
        y += 16;
        const deductionLines = [];
        if ((row.leaveDeduction || 0) > 0) {
          deductionLines.push([
            `Leave without pay (${row.unpaidLeaveDays || 0} day(s))`,
            money(-(row.leaveDeduction || 0)),
          ]);
        }
        if ((row.advanceRecovery || 0) > 0) {
          deductionLines.push(['Advance recovery', money(-(row.advanceRecovery || 0))]);
        }
        if ((row.latePenalty || 0) > 0) {
          deductionLines.push(['Late penalty', money(-(row.latePenalty || 0))]);
        }
        if ((row.manualDeductions || 0) > 0) {
          deductionLines.push(['Other deductions', money(-(row.manualDeductions || 0))]);
        }
        if (deductionLines.length === 0) {
          deductionLines.push(['Total deductions', money(-(row.deductions || 0))]);
        }
        for (const [label, amt] of deductionLines) {
          doc.font('Helvetica').fontSize(10).text(label, 40, y, { width: 350 });
          doc.fillColor('#b91c1c').text(amt, 400, y, { width: 155, align: 'right' });
          doc.fillColor('#000000');
          y += 16;
        }
        doc.font('Helvetica-Bold').text('Total deductions', 40, y, { width: 350 });
        doc.fillColor('#b91c1c').text(money(-(row.deductions || 0)), 400, y, { width: 155, align: 'right' });
        doc.fillColor('#000000');
        y += 20;
      }

      doc.rect(40, y, 515, 24).fill('#ecfdf5');
      doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(12);
      doc.text('Net pay', 48, y + 7);
      doc.text(money(row.netPay || 0), 400, y + 7, { width: 147, align: 'right' });
      doc.fillColor('#000000');
      y += 32;

      if (row.status === 'paid') {
        doc.font('Helvetica').fontSize(9).fillColor('#475569');
        const paidDate = row.paidAt
          ? new Date(row.paidAt).toLocaleDateString('en-IN')
          : '—';
        doc.text(`Paid via ${row.paymentMethod || 'cash'} on ${paidDate}`, 40, y);
        y += 14;
      }

      if (row.deductionNote) {
        doc.text(`Deduction note: ${String(row.deductionNote).replace(/\u20B9/g, 'Rs.').replace(/₹/g, 'Rs.')}`, 40, y, {
          width: 515,
        });
        y = doc.y + 6;
      }

      doc.fontSize(8).fillColor('#94a3b8');
      doc.text('This is a computer-generated salary slip.', 40, 780, { width: 515, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generatePayslipPdfBuffer,
  fmtMoney,
  formatPayPeriodMonth,
};
