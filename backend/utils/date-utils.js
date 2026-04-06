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
 * Get YYYY-MM-DD string in IST for a Date, ISO string, or YYYY-MM-DD (interpreted as IST midnight).
 * @param {Date|string} date - Value to convert
 * @returns {string} YYYY-MM-DD in IST
 */
function toDateStringIST(date) {
  const d = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? parseDateIST(date)
    : new Date(date);
  const parts = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/');
  const [dd, mm, yyyy] = parts.map(p => p.trim().padStart(2, '0'));
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Get start of day in IST for a given date
 * @param {Date|string} date - Date or YYYY-MM-DD string
 * @returns {Date} Start of day IST (00:00:00.000)
 */
function getStartOfDayIST(date) {
  const ymd =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : toDateStringIST(date);
  return parseDateIST(ymd);
}

/**
 * Get end of day in IST for a given date
 * @param {Date|string} date - Date or YYYY-MM-DD string
 * @returns {Date} End of day IST (23:59:59.999)
 *
 * Important: query params often pass full ISO strings (e.g. …T23:59:59.999+05:30).
 * We must normalize to the IST calendar day first; adding 24h to that instant would
 * incorrectly include the next calendar day.
 */
function getEndOfDayIST(date) {
  const ymd =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : toDateStringIST(date);
  const start = parseDateIST(ymd);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
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
 * Get today's date string (YYYY-MM-DD) in IST
 * @returns {string}
 */
function getTodayIST() {
  return toDateStringIST(new Date());
}

/**
 * Parse time string (e.g. "9:00 AM", "9:30 AM") to minutes from midnight
 * @param {string} timeStr - Time in "9:00 AM" or "09:00" format
 * @returns {number} Minutes from midnight
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const cleaned = timeStr.replace(/\s*(am|pm)/i, '').trim();
  const parts = cleaned.split(':');
  let h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  if (/pm/i.test(timeStr) && h < 12) h += 12;
  if (/am/i.test(timeStr) && h === 12) h = 0;
  return h * 60 + m;
}

/**
 * Convert minutes from midnight to "9:30 AM" format
 * @param {number} totalMinutes - Minutes from midnight
 * @returns {string} Time string
 */
function minutesToTimeString(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * ISO 8601 instant with explicit Asia/Kolkata offset (+05:30) for API payloads.
 * @param {Date|string|number} dateInput
 * @returns {string|null}
 */
function toIsoStringIST(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const y = get('year');
  const m = get('month');
  const day = get('day');
  const h = get('hour');
  const min = get('minute');
  const sec = get('second');
  const frac = d.getMilliseconds();
  const ms = frac ? `.${String(frac).padStart(3, '0')}` : '';
  return `${y}-${m}-${day}T${h}:${min}:${sec}${ms}+05:30`;
}

/**
 * Parse scheduling API datetimes. Naive `YYYY-MM-DDTHH:mm(:ss)` (no Z / no offset) is **IST wall time**.
 * Values with `Z` or `±offset` are parsed as standard ISO 8601.
 * @param {Date|string|number|null|undefined} val
 * @returns {Date|null}
 */
function parseSchedulingInstant(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) return val;
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return parseDateIST(s);
  }
  const hasExplicitZone =
    /Z$/i.test(s) ||
    /[+-]\d{2}:\d{2}$/.test(s) ||
    /[+-]\d{4}$/.test(s);
  if (hasExplicitZone) {
    const t = new Date(s);
    return Number.isNaN(t.getTime()) ? null : t;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
    const t = new Date(`${s}+05:30`);
    return Number.isNaN(t.getTime()) ? null : t;
  }
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}

module.exports = {
  parseDateIST,
  getStartOfDayIST,
  getEndOfDayIST,
  formatInIST,
  toDateStringIST,
  getTodayIST,
  parseTimeToMinutes,
  minutesToTimeString,
  toIsoStringIST,
  parseSchedulingInstant,
  IST_TIMEZONE: 'Asia/Kolkata'
};
