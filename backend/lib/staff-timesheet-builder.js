'use strict';

const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { toDateStringIST, formatInIST, getPreviousMonthRangeIST } = require('../utils/date-utils');
const { mergeAttendancePayrollSettings, resolveStaffShiftHoursForDay } = require('./attendance-payroll-settings');
const { evaluateDay } = require('./attendance-evaluator');

const TIMESHEET_HEADERS = [
  'Date',
  'Day',
  'Scheduled hours',
  'Check in',
  'Check out',
  'Duration',
  'Status',
  'Block times',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return toDateStringIST(d);
}

function datesInRangeIST(startYmd, endYmd) {
  const out = [];
  if (!startYmd || !endYmd || startYmd > endYmd) return out;
  let cur = startYmd;
  while (cur <= endYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function formatTimeIso(iso) {
  if (!iso) return '';
  return formatInIST(iso, { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

function durationLabel(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '';
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (ms <= 0) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatScheduleForDay(workSchedule, dayIndex) {
  const dayRow = (workSchedule || []).find((r) => r.day === dayIndex);
  if (!dayRow || dayRow.enabled === false) return 'Weekoff';
  const start = dayRow.startTime || '09:00';
  const end = dayRow.endTime || '21:00';
  return `${start} – ${end}`;
}

function blockAppliesOnDate(block, dateStr) {
  const rec = block.recurringFrequency || 'none';
  if (rec === 'none') return block.startDate === dateStr;
  const end = block.endDate;
  if (!end || dateStr < block.startDate || dateStr > end) return false;
  if (rec === 'daily') return true;
  if (rec === 'weekly') {
    return (
      new Date(`${block.startDate}T12:00:00+05:30`).getDay() ===
      new Date(`${dateStr}T12:00:00+05:30`).getDay()
    );
  }
  if (rec === 'monthly') {
    return (
      new Date(`${block.startDate}T12:00:00+05:30`).getDate() ===
      new Date(`${dateStr}T12:00:00+05:30`).getDate()
    );
  }
  return false;
}

function attendanceStatusLabel(att, evaluation) {
  if (!att) return '';
  if (evaluation?.status) return String(evaluation.status).replace(/_/g, ' ');
  if (att.checkOutAt) return 'Completed';
  if (att.checkInAt) return 'On duty';
  return '';
}

function buildStaffTimesheetRows(staff, periodDates, attendanceRows, blocks, mergedSettings) {
  const attendanceMap = new Map();
  attendanceRows.forEach((a) => attendanceMap.set(a.date, a));

  const rows = [];
  for (const dateStr of periodDates) {
    const dayIndex = new Date(`${dateStr}T12:00:00+05:30`).getDay();
    const att = attendanceMap.get(dateStr);
    const staffSchedule = resolveStaffShiftHoursForDay(staff, dayIndex, mergedSettings);
    const evaluation = att
      ? evaluateDay({
          checkInAt: att.checkInAt,
          checkOutAt: att.checkOutAt,
          rules: mergedSettings,
          staffSchedule: staffSchedule || undefined,
        })
      : null;

    const dayBlocks = blocks.filter((b) => blockAppliesOnDate(b, dateStr));
    const blockSummary = dayBlocks
      .map((b) => `${b.title} (${b.startTime}–${b.endTime})`)
      .join('; ');

    rows.push([
      dateStr,
      DAY_NAMES[dayIndex] || '',
      formatScheduleForDay(staff.workSchedule, dayIndex),
      att ? formatTimeIso(att.checkInAt) : '',
      att ? formatTimeIso(att.checkOutAt) : '',
      att ? durationLabel(att.checkInAt, att.checkOutAt) : '',
      attendanceStatusLabel(att, evaluation),
      blockSummary,
    ]);
  }
  return rows;
}

function summarizeTimesheetRows(rows) {
  let daysWithCheckIn = 0;
  let totalMinutes = 0;
  for (const row of rows) {
    if (row[3]) daysWithCheckIn += 1;
    const dur = row[5];
    if (dur) {
      const hm = dur.match(/(\d+)h\s*(\d+)m/);
      const mOnly = dur.match(/^(\d+)m$/);
      if (hm) totalMinutes += parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
      else if (mOnly) totalMinutes += parseInt(mOnly[1], 10);
    }
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const totalHoursLabel = hours > 0 ? `${hours}h ${mins}m` : mins > 0 ? `${mins}m` : '0m';
  return { daysWithCheckIn, totalHoursLabel, rowCount: rows.length };
}

async function loadTimesheetContext(businessModels, branchId, startYmd, endYmd) {
  const { Staff, StaffAttendance, BlockTime, BusinessSettings } = businessModels;
  const settingsDoc = BusinessSettings
    ? await BusinessSettings.findOne().select('attendancePayroll name').lean()
    : null;
  const mergedSettings = mergeAttendancePayrollSettings(settingsDoc?.attendancePayroll);

  const [staffList, attendanceRows, blocks] = await Promise.all([
    Staff.find({ branchId, isActive: { $ne: false } })
      .select('name role email workSchedule shiftId payrollOverrides')
      .lean(),
    StaffAttendance.find({
      branchId,
      date: { $gte: startYmd, $lte: endYmd },
    }).lean(),
    BlockTime.find({
      branchId,
      startDate: { $lte: endYmd },
      $or: [{ endDate: { $gte: startYmd } }, { endDate: null }, { recurringFrequency: { $ne: 'none' } }],
    }).lean(),
  ]);

  const attendanceByStaff = new Map();
  for (const row of attendanceRows) {
    const key = String(row.staffId);
    if (!attendanceByStaff.has(key)) attendanceByStaff.set(key, []);
    attendanceByStaff.get(key).push(row);
  }

  const blocksByStaff = new Map();
  for (const block of blocks) {
    const key = String(block.staffId);
    if (!blocksByStaff.has(key)) blocksByStaff.set(key, []);
    blocksByStaff.get(key).push(block);
  }

  return {
    mergedSettings,
    staffList,
    attendanceByStaff,
    blocksByStaff,
    businessName: settingsDoc?.name || '',
  };
}

function buildTimesheetXlsxBuffer(staffName, periodLabel, rows) {
  const sheetRows = [TIMESHEET_HEADERS, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
  const meta = XLSX.utils.aoa_to_sheet([
    ['Staff', staffName],
    ['Period', periodLabel],
    ['Generated', new Date().toISOString()],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, 'Info');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildTimesheetPdfBuffer(staffName, periodLabel, rows) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.font('Helvetica-Bold').fontSize(16).text('Staff Timesheet Report', { align: 'center' });
      doc.font('Helvetica').fontSize(11).text(staffName, { align: 'center' });
      doc.fontSize(10).fillColor('#64748b').text(periodLabel, { align: 'center' });
      doc.fillColor('#000000').moveDown(1);

      const colWidths = [62, 32, 78, 52, 52, 48, 58, 100];
      const startX = 40;
      let y = doc.y;

      doc.font('Helvetica-Bold').fontSize(8);
      let x = startX;
      TIMESHEET_HEADERS.forEach((h, i) => {
        doc.text(h, x, y, { width: colWidths[i], lineBreak: false });
        x += colWidths[i];
      });
      y += 14;
      doc.moveTo(startX, y).lineTo(555, y).stroke('#e2e8f0');
      y += 4;

      doc.font('Helvetica').fontSize(7);
      for (const row of rows) {
        if (y > 760) {
          doc.addPage();
          y = 40;
        }
        x = startX;
        row.forEach((cell, i) => {
          doc.text(String(cell || ''), x, y, { width: colWidths[i], lineBreak: false });
          x += colWidths[i];
        });
        y += 12;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function previousTimesheetMonthRange(referenceDate = new Date()) {
  const range = getPreviousMonthRangeIST(referenceDate);
  return {
    startYmd: range.startYmd,
    endYmd: range.endYmd,
    periodLabel: range.periodLabel,
    monthKey: range.startYmd.slice(0, 7),
  };
}

async function buildStaffTimesheetAttachment(staff, context, periodDates, periodLabel, format = 'xlsx') {
  const staffId = String(staff._id);
  const rows = buildStaffTimesheetRows(
    staff,
    periodDates,
    context.attendanceByStaff.get(staffId) || [],
    context.blocksByStaff.get(staffId) || [],
    context.mergedSettings
  );
  const summary = summarizeTimesheetRows(rows);
  const safeName = String(staff.name || 'staff').replace(/[/\\?%*:|"<>]/g, '-');
  const monthKey = periodDates[0]?.slice(0, 7) || 'period';

  if (format === 'pdf') {
    const content = await buildTimesheetPdfBuffer(staff.name, periodLabel, rows);
    return {
      rows,
      summary,
      attachment: {
        filename: `timesheet-${safeName}-${monthKey}.pdf`,
        content,
        contentType: 'application/pdf',
      },
    };
  }

  const content = buildTimesheetXlsxBuffer(staff.name, periodLabel, rows);
  return {
    rows,
    summary,
    attachment: {
      filename: `timesheet-${safeName}-${monthKey}.xlsx`,
      content,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  };
}

/** Build Excel + PDF attachments for monthly timesheet emails (single row build). */
async function buildStaffTimesheetAttachments(staff, context, periodDates, periodLabel) {
  const staffId = String(staff._id);
  const rows = buildStaffTimesheetRows(
    staff,
    periodDates,
    context.attendanceByStaff.get(staffId) || [],
    context.blocksByStaff.get(staffId) || [],
    context.mergedSettings
  );
  const summary = summarizeTimesheetRows(rows);
  const safeName = String(staff.name || 'staff').replace(/[/\\?%*:|"<>]/g, '-');
  const monthKey = periodDates[0]?.slice(0, 7) || 'period';
  const xlsxContent = buildTimesheetXlsxBuffer(staff.name, periodLabel, rows);
  const pdfContent = await buildTimesheetPdfBuffer(staff.name, periodLabel, rows);

  return {
    summary,
    attachments: [
      {
        filename: `timesheet-${safeName}-${monthKey}.xlsx`,
        content: xlsxContent,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      {
        filename: `timesheet-${safeName}-${monthKey}.pdf`,
        content: pdfContent,
        contentType: 'application/pdf',
      },
    ],
  };
}

module.exports = {
  TIMESHEET_HEADERS,
  datesInRangeIST,
  previousTimesheetMonthRange,
  loadTimesheetContext,
  buildStaffTimesheetRows,
  buildStaffTimesheetAttachment,
  buildStaffTimesheetAttachments,
  summarizeTimesheetRows,
};
