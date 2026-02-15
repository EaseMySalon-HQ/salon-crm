/**
 * Date utilities - All dates use IST (Asia/Kolkata, UTC+5:30)
 * Use these helpers wherever date parsing, ranges, or display is required.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5h 30m in ms

/**
 * Parse "YYYY-MM-DD" string as midnight IST, return Date (stored as UTC)
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Date} Date object (midnight IST in UTC)
 */
function parseDateIST(dateStr) {
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // "2025-02-15" -> Feb 15 00:00:00 IST = Feb 14 18:30:00 UTC
    return new Date(dateStr + 'T00:00:00+05:30');
  }
  return new Date(dateStr);
}

/**
 * Get start of day in IST for a given date
 * @param {Date|string} date - Date or YYYY-MM-DD string
 * @returns {Date} Start of day IST (00:00:00.000)
 */
function getStartOfDayIST(date) {
  const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? parseDateIST(date)
    : new Date(date);
  return new Date(d.getTime());
}

/**
 * Get end of day in IST for a given date
 * @param {Date|string} date - Date or YYYY-MM-DD string
 * @returns {Date} End of day IST (23:59:59.999)
 */
function getEndOfDayIST(date) {
  const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? parseDateIST(date)
    : new Date(date);
  const start = new Date(d.getTime());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return end;
}

/**
 * Format date for display in IST
 * @param {Date} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string in IST
 */
function formatInIST(date, options = {}) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    ...options
  });
}

/**
 * Get YYYY-MM-DD string in IST for a date
 * @param {Date} date - Date to convert
 * @returns {string} YYYY-MM-DD in IST
 */
function toDateStringIST(date) {
  const d = new Date(date);
  const parts = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/');
  const [dd, mm, yyyy] = parts.map(p => p.trim().padStart(2, '0'));
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get today's date string (YYYY-MM-DD) in IST
 * @returns {string}
 */
function getTodayIST() {
  return toDateStringIST(new Date());
}

module.exports = {
  parseDateIST,
  getStartOfDayIST,
  getEndOfDayIST,
  formatInIST,
  toDateStringIST,
  getTodayIST,
  IST_TIMEZONE: 'Asia/Kolkata'
};
