/**
 * Mirror of lib/receipt-staff-format.ts for Node receipt generators.
 * @param {{ staffName?: string, staffContributions?: Array<{ staffName?: string }> }} item
 * @returns {string}
 */
function formatReceiptItemStaffNames(item) {
  if (!item) return '';
  const contributions = item.staffContributions;
  if (Array.isArray(contributions) && contributions.length > 0) {
    const seen = new Set();
    const names = [];
    for (const c of contributions) {
      const n = (c && c.staffName && String(c.staffName).trim()) || '';
      if (!n) continue;
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(n);
    }
    if (names.length === 0) {
      const fallback = item.staffName && String(item.staffName).trim();
      return fallback || '';
    }
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' & ' + names[1];
    return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
  }
  return (item.staffName && String(item.staffName).trim()) || '';
}

module.exports = { formatReceiptItemStaffNames };
