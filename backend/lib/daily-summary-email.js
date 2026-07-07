'use strict';

const { generateInsight, revenueDeltaPercent } = require('./daily-summary-insight');

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
  return `₹${x.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtCurrencyDetailed(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '₹0';
  return `₹${x.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function fmtInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return String(Math.round(x));
}

function fmtDelta(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return { label: '—', color: MUTED, arrow: '' };
  const abs = Math.abs(Math.round(n));
  if (n > 0) return { label: `▲ ${abs}% vs yesterday`, color: GREEN, arrow: '▲' };
  if (n < 0) return { label: `▼ ${abs}% vs yesterday`, color: AMBER, arrow: '▼' };
  return { label: '— flat vs yesterday', color: MUTED, arrow: '—' };
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

function statCell(icon, label, value) {
  return `
    <td width="50%" style="padding:8px;vertical-align:top;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
        <tr>
          <td style="padding:14px 16px;">
            <div style="font-size:20px;line-height:1;margin-bottom:8px;">${icon}</div>
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${MUTED};margin-bottom:4px;">${label}</div>
            <div style="font-size:18px;font-weight:700;color:#0f172a;">${value}</div>
          </td>
        </tr>
      </table>
    </td>`;
}

/**
 * Render daily summary email (table-based inline CSS for Gmail/Outlook).
 *
 * @param {object} data - from buildDailySummaryData
 * @param {object} charts - { categoryBarChartUrl, paymentDonutChartUrl }
 * @param {object} options
 * @param {string} [options.ownerName]
 * @param {string} [options.logoUrl]
 * @param {string} [options.dashboardUrl]
 * @param {string} [options.settingsUrl]
 */
function renderDailySummaryEmail(data, charts = {}, options = {}) {
  const ownerName = options.ownerName || 'there';
  const logoUrl = options.logoUrl || '';
  const dashboardUrl = options.dashboardUrl || '#';
  const settingsUrl = options.settingsUrl || '#';

  const insight = generateInsight({
    todayNetRevenue: data.todayNetRevenue,
    last7DayAvgRevenue: data.last7DayAvgRevenue,
    todayAppointments: data.todayAppointments,
    todayBills: data.todayBills,
  });

  const delta = fmtDelta(revenueDeltaPercent(data.todayNetRevenue, data.yesterdayNetRevenue));

  const statRows = [
    [
      statCell('🧾', 'Total Bills', fmtInt(data.todayBills)),
      statCell('📅', 'Appointments', fmtInt(data.todayAppointments)),
    ],
    [
      statCell('📊', 'Avg Bill Value', fmtCurrency(data.averageBillValue)),
      statCell('💰', 'Dues Collected', fmtCurrency(data.duesCollected)),
    ],
    [
      statCell('💸', 'Cash Expense', fmtCurrency(data.cashExpense)),
      statCell('🎁', 'Tip Collected', fmtCurrency(data.tipCollected)),
    ],
  ]
    .map(
      (pair) => `
    <tr>${pair.join('')}</tr>`
    )
    .join('');

  const engagementLine =
    data.feedbackReceived > 0 || data.consentFormReceived > 0
      ? `<p style="margin:12px 0 0;font-size:13px;color:${MUTED};text-align:center;">
          💬 ${fmtInt(data.feedbackReceived)} feedback · 📝 ${fmtInt(data.consentFormReceived)} consent updates today
        </p>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Summary — ${data.branchName || 'EaseMySalon'}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TEXT};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BG};padding:24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 20px;text-align:center;">
              ${logoUrl ? `<img src="${logoUrl}" alt="EaseMySalon" width="160" style="max-width:160px;height:auto;display:block;margin:0 auto 16px;" />` : `<div style="font-size:22px;font-weight:800;color:${BRAND};margin-bottom:12px;">EaseMySalon</div>`}
              <div style="font-size:20px;font-weight:700;color:#0f172a;margin-bottom:4px;">${data.branchName || 'Your salon'}</div>
              <div style="font-size:14px;color:${MUTED};margin-bottom:16px;">${data.dateFormatted || data.date}</div>
              <div style="font-size:16px;color:#0f172a;line-height:1.5;">
                Namaste <strong>${ownerName}</strong>, yahan hai aaj ka summary 👇
              </div>
            </td>
          </tr>

          <!-- Insight -->
          <tr>
            <td style="padding:0 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${insightBg(insight.tone)};border:1px solid ${insightBorder(insight.tone)};border-radius:12px;">
                <tr><td style="padding:14px 18px;font-size:15px;font-weight:600;color:#0f172a;text-align:center;">${insight.text}</td></tr>
              </table>
            </td>
          </tr>

          <!-- Hero revenue -->
          <tr>
            <td style="padding:0 0 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;box-shadow:0 4px 14px rgba(99,102,241,0.08);">
                <tr>
                  <td style="padding:24px 20px;text-align:center;">
                    <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${MUTED};margin-bottom:8px;">Today's Net Revenue</div>
                    <div style="font-size:36px;font-weight:800;color:${BRAND_DARK};line-height:1.1;margin-bottom:6px;">${fmtCurrencyDetailed(data.todayNetRevenue)}</div>
                    <div style="font-size:14px;font-weight:600;color:${delta.color};">${delta.label}</div>
                    <div style="font-size:12px;color:${MUTED};margin-top:8px;">Gross ${fmtCurrencyDetailed(data.todayGrossRevenue)}${data.todayCancelledBills ? ` · ${fmtInt(data.todayCancelledBills)} cancelled bills` : ''}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${
            charts.categoryBarChartUrl
              ? `<!-- Category chart -->
          <tr>
            <td style="padding:0 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
                <tr>
                  <td style="padding:16px 16px 8px;font-size:14px;font-weight:700;color:#0f172a;">Revenue by category</td>
                </tr>
                <tr>
                  <td style="padding:0 8px 12px;text-align:center;">
                    <img src="${charts.categoryBarChartUrl}" alt="Revenue by category chart" width="520" style="max-width:100%;height:auto;border-radius:8px;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
              : ''
          }

          ${
            charts.paymentDonutChartUrl
              ? `<!-- Payment donut -->
          <tr>
            <td style="padding:0 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
                <tr>
                  <td style="padding:16px 16px 8px;font-size:14px;font-weight:700;color:#0f172a;">Payment mode split</td>
                </tr>
                <tr>
                  <td style="padding:0 8px 12px;text-align:center;">
                    <img src="${charts.paymentDonutChartUrl}" alt="Payment mode chart" width="400" style="max-width:100%;height:auto;border-radius:8px;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
              : ''
          }

          <!-- Stat grid -->
          <tr>
            <td style="padding:0 0 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${statRows}</table>
              ${engagementLine}
            </td>
          </tr>

          <!-- Month context -->
          <tr>
            <td style="padding:16px 0 24px;text-align:center;">
              <div style="display:inline-block;background:#ffffff;border:1px solid ${BORDER};border-radius:999px;padding:10px 18px;font-size:13px;color:${MUTED};">
                This month so far: <strong style="color:#0f172a;">${fmtCurrency(data.monthToDateRevenue)}</strong> across <strong style="color:#0f172a;">${fmtInt(data.monthToDateBills)}</strong> bills
              </div>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 0 24px;text-align:center;">
              <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,${BRAND} 0%,${BRAND_DARK} 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;box-shadow:0 4px 12px rgba(99,102,241,0.35);">
                View full dashboard →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 0 0;border-top:1px solid ${BORDER};text-align:center;font-size:12px;color:#94a3b8;line-height:1.6;">
              <p style="margin:0 0 8px;">Automated daily summary from <strong style="color:${BRAND};">EaseMySalon</strong></p>
              <p style="margin:0;">
                <a href="${settingsUrl}" style="color:${MUTED};text-decoration:underline;">Email notification settings</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `EaseMySalon — ${data.branchName || 'Branch'}`,
    data.dateFormatted || data.date,
    '',
    `Namaste ${ownerName}, yahan hai aaj ka summary`,
    '',
    insight.text,
    '',
    `Today's Net Revenue: ${fmtCurrencyDetailed(data.todayNetRevenue)} (${delta.label})`,
    `Gross: ${fmtCurrencyDetailed(data.todayGrossRevenue)}`,
    '',
    `Bills: ${fmtInt(data.todayBills)} | Appointments: ${fmtInt(data.todayAppointments)} | Avg bill: ${fmtCurrency(data.averageBillValue)}`,
    `Dues collected: ${fmtCurrency(data.duesCollected)} | Cash expense: ${fmtCurrency(data.cashExpense)} | Tips: ${fmtCurrency(data.tipCollected)}`,
    '',
    `Month to date: ${fmtCurrency(data.monthToDateRevenue)} across ${fmtInt(data.monthToDateBills)} bills`,
    '',
    `Dashboard: ${dashboardUrl}`,
    `Settings: ${settingsUrl}`,
  ].join('\n');

  return { html, text, insight, delta };
}

module.exports = {
  renderDailySummaryEmail,
};
