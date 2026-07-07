'use strict';

const { generateMonthlyInsight, momPercent, yoyPercent, growthBand } = require('./monthly-summary-insight');

const BRAND = '#6366f1';
const BRAND_DARK = '#4f46e5';
const TEXT = '#334155';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const BG = '#f8fafc';
const GREEN = '#16a34a';
const AMBER = '#d97706';

function fmtCurrency(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '₹0';
  if (x >= 100000) return `₹${(x / 100000).toFixed(x >= 1000000 ? 1 : 2)}L`;
  return `₹${x.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtCurrencyFull(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '₹0';
  return `₹${x.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtInt(n) {
  return String(Math.round(Number(n) || 0));
}

function insightBg(tone) {
  if (tone === 'positive') return '#ecfdf5';
  if (tone === 'warning') return '#fffbeb';
  return '#eef2ff';
}

function insightBorder(tone) {
  if (tone === 'positive') return '#86efac';
  if (tone === 'warning') return '#fcd34d';
  return '#c7d2fe';
}

function goalBarHtml(revenue, goal) {
  const current = Number(revenue) || 0;
  const target = Number(goal) || 0;
  if (target <= 0) return '';
  const pct = Math.min(100, Math.round((current / target) * 100));
  return `
    <tr><td style="padding:0 0 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:6px;">Revenue vs goal</div>
          <div style="font-size:13px;color:${MUTED};margin-bottom:10px;">You're ${pct}% to goal · ${fmtCurrencyFull(current)} of ${fmtCurrencyFull(target)}</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#e2e8f0;border-radius:999px;height:14px;">
            <tr><td width="${pct}%" style="background:${pct >= 100 ? GREEN : BRAND};border-radius:999px;height:14px;font-size:0;">&nbsp;</td><td></td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>`;
}

function vipListHtml(topClients) {
  const rows = (topClients || []).slice(0, 5);
  if (!rows.length) return '';
  const items = rows
    .map(
      (c, i) => `
      <tr><td style="padding:10px 0;border-bottom:1px solid ${BORDER};">
        <span style="color:${BRAND};font-weight:700;margin-right:8px;">${i + 1}.</span>
        <strong style="color:#0f172a;">${c.name}</strong>
        <span style="color:${MUTED};font-size:13px;"> — ${fmtCurrencyFull(c.totalSpend)} · ${fmtInt(c.visitCount)} visits</span>
      </td></tr>`
    )
    .join('');
  return `
    <tr><td style="padding:0 0 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
        <tr><td style="padding:16px 18px 8px;font-size:14px;font-weight:700;color:#0f172a;">Your VIPs this month 🌟</td></tr>
        <tr><td style="padding:0 18px 16px;font-size:14px;">${items}</td></tr>
      </table>
    </td></tr>`;
}

function statChip(label, value, color) {
  return `
    <td width="33%" style="padding:4px;vertical-align:top;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:10px;">
        <tr><td style="padding:12px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:${color};">${fmtInt(value)}</div>
          <div style="font-size:11px;font-weight:600;color:${MUTED};text-transform:uppercase;margin-top:4px;">${label}</div>
        </td></tr>
      </table>
    </td>`;
}

function milestoneBanner(milestones) {
  const m = milestones?.[0];
  if (!m?.message) return '';
  return `
    <tr><td style="padding:0 0 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:2px solid #f59e0b;border-radius:14px;">
        <tr><td style="padding:18px 20px;text-align:center;font-size:16px;font-weight:700;color:#92400e;">🏅 ${m.message}</td></tr>
      </table>
    </td></tr>`;
}

/**
 * @param {object} data
 * @param {object} charts
 * @param {{ ownerName?: string, logoUrl?: string, dashboardUrl?: string, settingsUrl?: string, narrativeParagraph?: string, isRollup?: boolean, branchLines?: string[] }} options
 */
function renderMonthlySummaryEmail(data, charts = {}, options = {}) {
  const ownerName = options.ownerName || 'there';
  const logoUrl = options.logoUrl || '';
  const dashboardUrl = options.dashboardUrl || '#';
  const settingsUrl = options.settingsUrl || '#';
  const reportUrl = options.reportUrl || `${dashboardUrl}${dashboardUrl.includes('?') ? '&' : '?'}month=${data.monthKey || ''}`;

  const insight = generateMonthlyInsight(data);
  const mom = momPercent(data.monthTotalRevenue, data.previousMonthTotalRevenue);
  const yoy = yoyPercent(data.monthTotalRevenue, data.sameMonthLastYearRevenue);
  const band = growthBand(mom);

  const title = options.isRollup
    ? `All branches — ${data.monthName} ${data.year}`
    : `${data.branchName || 'Your salon'}`;

  const headerSub = options.isRollup
    ? 'Multi-branch monthly rollup'
    : `${data.monthName} ${data.year} Summary`;

  const categoryCallout = data.fastestGrowingCategory
    ? `<p style="margin:8px 0 0;font-size:13px;color:${MUTED};text-align:center;"><strong style="color:#0f172a;">${data.fastestGrowingCategory}</strong> grew fastest vs last month</p>`
    : '';

  const narrativeBlock = options.narrativeParagraph
    ? `<tr><td style="padding:0 0 16px;"><p style="margin:0;font-size:14px;line-height:1.6;color:${TEXT};font-style:italic;border-left:3px solid ${BRAND};padding:12px 16px;background:#fff;border-radius:0 8px 8px 0;">${options.narrativeParagraph}</p></td></tr>`
    : '';

  const branchRollupBlock =
    options.isRollup && options.branchLines?.length
      ? `<tr><td style="padding:0 0 16px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid ${BORDER};border-radius:12px;"><tr><td style="padding:14px 18px;font-size:13px;color:${TEXT};line-height:1.8;">${options.branchLines.map((l) => `<div>${l}</div>`).join('')}</td></tr></table></td></tr>`
      : '';

  const profitLine =
    data.netProfit != null && data.expenseTotal != null
      ? `<div style="font-size:12px;color:${MUTED};margin-top:8px;">Expenses ${fmtCurrencyFull(data.expenseTotal)} · Net ${fmtCurrencyFull(data.netProfit)}</div>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.monthName} Summary — ${data.branchName || 'EaseMySalon'}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TEXT};">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BG};padding:24px 12px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">

<tr><td style="padding:0 0 8px;text-align:center;">
${logoUrl ? `<img src="${logoUrl}" alt="EaseMySalon" width="140" style="max-width:140px;height:auto;margin:0 auto 12px;display:block;opacity:0.9;" />` : `<div style="font-size:20px;font-weight:800;color:${BRAND};margin-bottom:8px;">EaseMySalon</div>`}
<div style="font-size:22px;font-weight:800;color:#0f172a;">${title}</div>
<div style="font-size:14px;color:${MUTED};margin-top:4px;">${headerSub}</div>
<div style="font-size:16px;color:#0f172a;margin-top:14px;line-height:1.5;">Congratulations <strong>${ownerName}</strong> — what a month! 🎊</div>
</td></tr>

${narrativeBlock}

<tr><td style="padding:0 0 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${insightBg(insight.tone)};border:1px solid ${insightBorder(insight.tone)};border-radius:12px;">
<tr><td style="padding:14px 18px;font-size:15px;font-weight:600;color:#0f172a;text-align:center;">${insight.text}</td></tr>
</table></td></tr>

<tr><td style="padding:0 0 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;box-shadow:0 6px 20px rgba(99,102,241,0.1);">
<tr><td style="padding:28px 20px;text-align:center;">
<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${MUTED};">Month Net Revenue</div>
<div style="font-size:42px;font-weight:900;color:${BRAND_DARK};line-height:1;margin:10px 0;">${fmtCurrencyFull(data.monthTotalRevenue)}</div>
<div style="font-size:13px;color:${MUTED};">${fmtInt(data.monthTotalBills)} bills · ${fmtInt(data.monthTotalAppointments)} appointments</div>
${profitLine}
</td></tr></table></td></tr>

${branchRollupBlock}

<tr><td style="padding:0 0 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
<td width="50%" style="padding-right:6px;vertical-align:top;">
${charts.growthGaugeUrl ? `<img src="${charts.growthGaugeUrl}" alt="MoM growth" width="260" style="max-width:100%;height:auto;display:block;margin:0 auto;" />` : ''}
<div style="text-align:center;font-size:12px;font-weight:600;color:${band.color};margin-top:4px;">${band.label} · MoM</div>
</td>
<td width="50%" style="padding-left:6px;vertical-align:middle;text-align:center;">
<div style="font-size:13px;color:${MUTED};margin-bottom:8px;">vs last month</div>
<div style="font-size:28px;font-weight:800;color:${band.color};">${mom > 0 ? '+' : ''}${Math.round(mom)}%</div>
${yoy != null ? `<div style="font-size:12px;color:${MUTED};margin-top:12px;">YoY ${yoy > 0 ? '+' : ''}${Math.round(yoy)}%</div>` : ''}
</td>
</tr></table></td></tr>

${goalBarHtml(data.monthTotalRevenue, data.monthlyRevenueGoal)}

${charts.categoryDonutUrl ? `<tr><td style="padding:0 0 16px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid ${BORDER};border-radius:12px;"><tr><td style="padding:16px 16px 4px;font-size:14px;font-weight:700;color:#0f172a;">Revenue breakdown</td></tr><tr><td style="padding:0 8px 12px;text-align:center;"><img src="${charts.categoryDonutUrl}" alt="Category breakdown" width="400" style="max-width:100%;height:auto;" />${categoryCallout}</td></tr></table></td></tr>` : ''}

${charts.trendLineUrl ? `<tr><td style="padding:0 0 16px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid ${BORDER};border-radius:12px;"><tr><td style="padding:16px 16px 8px;font-size:14px;font-weight:700;color:#0f172a;">6-month trajectory</td></tr><tr><td style="padding:0 8px 12px;text-align:center;"><img src="${charts.trendLineUrl}" alt="Trend" width="520" style="max-width:100%;height:auto;" /></td></tr></table></td></tr>` : ''}

${vipListHtml(data.topClients)}

<tr><td style="padding:0 0 16px;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
${statChip('New', data.newCustomersThisMonth, GREEN)}
${statChip('Returning', data.returningCustomers, GREEN)}
${statChip('Churned', data.churnedCustomers, AMBER)}
</tr></table></td></tr>

${milestoneBanner(data.milestones)}

<tr><td style="padding:0 0 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;">
<tr><td style="padding:14px 18px;font-size:13px;color:#3730a3;line-height:1.5;">
<strong>Next month forecast (estimate):</strong> At this pace, expect ~${fmtCurrencyFull(data.nextMonthForecast)} next month. Not a guarantee — use it as a planning guide.
</td></tr></table></td></tr>

<tr><td style="padding:8px 0 24px;text-align:center;">
<a href="${reportUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px;margin-bottom:10px;">Open full monthly report in dashboard →</a>
<div style="font-size:12px;color:${MUTED};margin:12px 0;"><a href="${reportUrl}" style="color:${BRAND};">Download PDF</a> · <a href="${settingsUrl}" style="color:${MUTED};">Notification settings</a></div>
<p style="margin:16px 0 0;font-size:10px;color:#94a3b8;">EaseMySalon · Share your wins 🎉</p>
</td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    `${data.monthName} ${data.year} — ${data.branchName}`,
    insight.text,
    `Revenue: ${fmtCurrencyFull(data.monthTotalRevenue)} (MoM ${Math.round(mom)}%)`,
    `Forecast next month: ~${fmtCurrencyFull(data.nextMonthForecast)} (estimate)`,
    reportUrl,
  ].join('\n');

  return { html, text };
}

module.exports = { renderMonthlySummaryEmail };
