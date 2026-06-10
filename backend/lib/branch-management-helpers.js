/**
 * Shared helpers for /api/branch-management Phase 2.
 *
 * Merge keys: inventory uses SKU when present, else lowercased product/service name.
 */

const COMPLETED = { $regex: /^completed$/i };

function catalogKey(name, sku) {
  const s = (sku || '').trim();
  if (s) return s.toLowerCase();
  return (name || '').toLowerCase().trim();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function parseHm(hm) {
  const parts = String(hm || '09:00').split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

function ymd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Available minutes for one staff member across [start, end] from workSchedule. */
function availableMinutesInRange(workSchedule, start, end) {
  const schedule = Array.isArray(workSchedule) ? workSchedule : [];
  let total = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= endDay) {
    const dow = cur.getDay();
    const entry = schedule.find((w) => w.day === dow && w.enabled !== false);
    if (entry) {
      const mins = parseHm(entry.endTime) - parseHm(entry.startTime);
      if (mins > 0) total += mins;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

function pct(n, d) {
  if (!d || d <= 0) return 0;
  return Math.min(100, Math.round((n / d) * 100));
}

/** Prorate monthly revenue target to a custom date range (inclusive days). */
function prorateRevenueTarget(monthlyTarget, rangeStart, rangeEnd) {
  const monthly = Number(monthlyTarget) || 0;
  if (monthly <= 0) return 0;
  const daysInRange = Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000) + 1);
  const monthStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const monthEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0);
  const daysInMonth = Math.max(1, Math.round((monthEnd - monthStart) / 86400000) + 1);
  return Math.round((monthly / daysInMonth) * daysInRange);
}

function deriveClientSegment(totalVisits, totalSpent, lastVisit, vipThreshold) {
  const visits = Number(totalVisits) || 0;
  const spent = Number(totalSpent) || 0;
  if (visits <= 0) return 'new';
  if (lastVisit) {
    const daysSince = (Date.now() - new Date(lastVisit).getTime()) / 86400000;
    if (daysSince > 90) return 'at_risk';
  }
  if (spent >= (vipThreshold || 50000)) return 'vip';
  if (visits <= 3) return 'returning';
  return 'returning';
}

function buildStaffRevenueMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const lineTotal = Math.max(0, Number(row?.lineTotal ?? row?.total) || 0);
    const contributions = Array.isArray(row?.staffContributions) ? row.staffContributions : [];
    if (contributions.length > 0) {
      for (const c of contributions) {
        const sid = String(c?.staffId || '').trim();
        const sname = String(c?.staffName || 'Unassigned').trim() || 'Unassigned';
        const key = sid || `name:${sname.toLowerCase()}`;
        const amountFromContribution = Number(c?.amount);
        const percentage = Number(c?.percentage);
        const amount = Number.isFinite(amountFromContribution)
          ? Math.max(0, amountFromContribution)
          : Number.isFinite(percentage)
            ? Math.max(0, (lineTotal * percentage) / 100)
            : 0;
        const existing = map.get(key) || { staffName: sname, amount: 0 };
        existing.amount += amount;
        if (!existing.staffName || existing.staffName === 'Unassigned') existing.staffName = sname;
        map.set(key, existing);
      }
    } else {
      const sid = String(row?.legacyStaffId ?? row?.staffId ?? '').trim();
      const sname = String(row?.legacyStaffName ?? row?.staffName ?? 'Unassigned').trim() || 'Unassigned';
      const key = sid || `name:${sname.toLowerCase()}`;
      const existing = map.get(key) || { staffName: sname, amount: 0 };
      existing.amount += lineTotal;
      if (!existing.staffName || existing.staffName === 'Unassigned') existing.staffName = sname;
      map.set(key, existing);
    }
  }
  return map;
}

module.exports = {
  COMPLETED,
  catalogKey,
  normalizePhone,
  availableMinutesInRange,
  pct,
  prorateRevenueTarget,
  deriveClientSegment,
  buildStaffRevenueMap,
  ymd,
  parseHm,
};
