/**
 * MongoDB `archivedAt` range for deleted-invoice reports.
 * The client sends IST boundaries as full ISO strings (e.g. 2026-03-30T00:00:00+05:30).
 * Using YYYY-MM-DD + T00:00:00.000Z incorrectly treated the calendar day as UTC and
 * excluded deletions that occurred in the IST morning (still "yesterday" in UTC).
 */

function archivedAtRangeFromParams({ dateFrom, dateTo, date }) {
  if (dateFrom && dateTo) {
    const s = String(dateFrom);
    const e = String(dateTo);
    const start = s.includes('T') ? new Date(s) : new Date(`${s.split('T')[0]}T00:00:00+05:30`);
    const end = e.includes('T') ? new Date(e) : new Date(`${e.split('T')[0]}T23:59:59.999+05:30`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { $gte: start, $lte: end };
    }
  }
  if (date) {
    const d = String(date);
    const dateStr = d.split('T')[0];
    return {
      $gte: new Date(`${dateStr}T00:00:00+05:30`),
      $lte: new Date(`${dateStr}T23:59:59.999+05:30`),
    };
  }
  return null;
}

module.exports = { archivedAtRangeFromParams };
