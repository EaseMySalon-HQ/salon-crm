'use strict';

const { generateWeeklyInsight, wowPercent } = require('./weekly-summary-insight');
const { DAY_GRADIENT } = require('./weekly-summary-charts');

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

function fmtInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return String(Math.round(x));
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

function fmtWow(weekTotalRevenue, previousWeekTotalRevenue) {
  const pct = wowPercent(weekTotalRevenue, previousWeekTotalRevenue);
  if (!Number.isFinite(pct) || pct === 0) return { label: '— flat vs last week', color: MUTED };
  const abs = Math.abs(Math.round(pct));
  if (pct > 0) return { label: `▲ ${abs}% vs last week`, color: GREEN };
  return { label: `▼ ${abs}% vs last week`, color: AMBER };
}

function goalProgressHtml(weekTotalRevenue, weeklyRevenueGoal) {
  const current = Number(weekTotalRevenue) || 0;
  const goal = Number(weeklyRevenueGoal) || 0;
  if (goal <= 0) return '';
  const pct = Math.min(100, Math.round((current / goal) * 100));
  const barColor = pct >= 100 ? GREEN : BRAND;
  return `
    <tr>
      <td style="padding:0 0 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
          <tr>
            <td style="padding:16px 18px;">
              <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;">Weekly goal progress</div>
              <div style="font-size:13px;color:${MUTED};margin-bottom:10px;">${fmtCurrency(current)} of ${fmtCurrency(goal)} (${pct}%)</div>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#e2e8f0;border-radius:999px;height:12px;">
                <tr>
                  <td width="${pct}%" style="background:${barColor};border-radius:999px;height:12px;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function dayCard(title, emoji, dayLabel, date, revenue, highlight) {
  const bg = highlight === 'best' ? '#ecfdf5' : highlight === 'slow' ? '#f8fafc' : '#ffffff';
  const border = highlight === 'best' ? '#86efac' : BORDER;
  return `
    <td width="50%" style="padding:6px;vertical-align:top;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${bg};border:1px solid ${border};border-radius:12px;">
        <tr>
          <td style="padding:14px 16px;text-align:center;">
            <div style="font-size:22px;margin-bottom:6px;">${emoji}</div>
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${MUTED};">${title}</div>
            <div style="font-size:15px;font-weight:700;color:#0f172a;margin:6px 0 2px;">${dayLabel}${date ? `, ${date}` : ''}</div>
            <div style="font-size:18px;font-weight:800;color:${highlight === 'best' ? GREEN : TEXT};">${fmtCurrency(revenue)}</div>
          </td>
        </tr>
      </table>
    </td>`;
}

function funnelBar(funnel) {
  const booked = Number(funnel?.booked) || 0;
  const completed = Number(funnel?.completed) || 0;
  const cancelled = Number(funnel?.cancelled) || 0;
  const noShow = Number(funnel?.noShow) || 0;
  const total = Math.max(booked, completed + cancelled + noShow, 1);
  const pct = (n) => Math.max(4, Math.round((n / total) * 100));

  const segments = [
    { label: 'Completed', value: completed, color: GREEN, width: pct(completed) },
    { label: 'Cancelled', value: cancelled, color: AMBER, width: pct(cancelled) },
    { label: 'No-show', value: noShow, color: '#ef4444', width: pct(noShow) },
  ].filter((s) => s.value > 0);

  const cells = segments
    .map(
      (s) =>
        `<td width="${s.width}%" style="background:${s.color};height:14px;font-size:0;line-height:0;border-radius:4px;">&nbsp;</td>`
    )
    .join('<td width="2" style="font-size:0;">&nbsp;</td>');

  return `
    <tr>
      <td style="padding:0 0 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
          <tr><td style="padding:16px 18px 8px;font-size:14px;font-weight:700;color:#0f172a;">Appointment funnel</td></tr>
          <tr>
            <td style="padding:0 18px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${cells}</tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 18px 16px;font-size:12px;color:${MUTED};line-height:1.6;">
              📅 ${fmtInt(booked)} booked → ✅ ${fmtInt(completed)} completed · ❌ ${fmtInt(cancelled)} cancelled · 👻 ${fmtInt(noShow)} no-show
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function leaderboardHtml(staffLeaderboard) {
  const rows = (staffLeaderboard || []).slice(0, 3);
  if (!rows.length) return '';
  const medals = ['🥇', '🥈', '🥉'];
  const items = rows
    .map(
      (s, i) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${BORDER};">
            <span style="font-size:18px;margin-right:8px;">${medals[i] || '•'}</span>
            <strong style="color:#0f172a;">${s.name}</strong>
            <span style="color:${MUTED};font-size:13px;"> — ${fmtCurrency(s.revenueGenerated)} · ${fmtInt(s.billsHandled)} bills</span>
          </td>
        </tr>`
    )
    .join('');

  return `
    <tr>
      <td style="padding:0 0 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
          <tr><td style="padding:16px 18px 8px;font-size:14px;font-weight:700;color:#0f172a;">Staff leaderboard</td></tr>
          <tr><td style="padding:0 18px 16px;font-size:14px;">${items}</td></tr>
        </table>
      </td>
    </tr>`;
}

function topServicesList(topServices) {
  const items = (topServices || []).slice(0, 3);
  if (!items.length) return '';
  const maxRev = Math.max(...items.map((s) => s.revenue), 1);
  return items
    .map((s, i) => {
      const w = Math.max(8, Math.round((s.revenue / maxRev) * 100));
      const color = DAY_GRADIENT[Math.min(i + 3, DAY_GRADIENT.length - 1)];
      return `
        <div style="margin-bottom:12px;">
          <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:4px;">${i === 0 ? '🏆 ' : ''}${s.name} <span style="color:${MUTED};font-weight:500;">(${fmtInt(s.count)}×)</span></div>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#e2e8f0;border-radius:6px;height:8px;">
            <tr><td width="${w}%" style="background:${color};border-radius:6px;height:8px;font-size:0;">&nbsp;</td><td></td></tr>
          </table>
          <div style="font-size:12px;color:${MUTED};margin-top:2px;">${fmtCurrency(s.revenue)}</div>
        </div>`;
    })
    .join('');
}

/**
 * @param {object} data
 * @param {object} charts
 * @param {{ ownerName?: string, logoUrl?: string, dashboardUrl?: string }} options
 */
function renderWeeklySummaryEmail(data, charts = {}, options = {}) {
  const ownerName = options.ownerName || 'there';
  const logoUrl = options.logoUrl || '';
  const dashboardUrl = options.dashboardUrl || '#';

  const insight = generateWeeklyInsight(data);
  const wow = fmtWow(data.weekTotalRevenue, data.previousWeekTotalRevenue);
  const customerTotal = (Number(data.newCustomers) || 0) + (Number(data.returningCustomers) || 0);
  const returningPct =
    customerTotal > 0 ? Math.round(((Number(data.returningCustomers) || 0) / customerTotal) * 100) : 0;

  const bestDate = data.bestDay?.date
    ? data.bestDay.date.slice(8, 10) + ' ' + data.bestDay.dayLabel
    : data.bestDay?.dayLabel || '';
  const slowDate = data.slowestDay?.date
    ? data.slowestDay.date.slice(8, 10) + ' ' + data.slowestDay.dayLabel
    : data.slowestDay?.dayLabel || '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Summary — ${data.branchName || 'EaseMySalon'}</title>
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
              <div style="font-size:14px;color:${MUTED};margin-bottom:4px;">Week of ${data.weekRangeFormatted || `${data.weekStartDate} – ${data.weekEndDate}`}</div>
              <div style="font-size:16px;color:#0f172a;line-height:1.5;margin-top:12px;">
                Good morning <strong>${ownerName}</strong> — here's how last week went 👇
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
            <td style="padding:0 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;box-shadow:0 4px 14px rgba(99,102,241,0.08);">
                <tr>
                  <td style="padding:24px 20px;text-align:center;">
                    <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${MUTED};margin-bottom:8px;">Week Net Revenue</div>
                    <div style="font-size:36px;font-weight:800;color:${BRAND_DARK};line-height:1.1;margin-bottom:6px;">${fmtCurrency(data.weekTotalRevenue)}</div>
                    <div style="font-size:14px;font-weight:600;color:${wow.color};">${wow.label}</div>
                    <div style="font-size:12px;color:${MUTED};margin-top:10px;">${fmtInt(data.weekTotalBills)} bills · ${fmtInt(data.weekTotalAppointments)} appointments</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${goalProgressHtml(data.weekTotalRevenue, data.weeklyRevenueGoal)}

          ${
            charts.weeklyRevenueChartUrl
              ? `<tr><td style="padding:0 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
                <tr><td style="padding:16px 16px 8px;font-size:14px;font-weight:700;color:#0f172a;">Daily revenue (Mon–Sun)</td></tr>
                <tr><td style="padding:0 8px 12px;text-align:center;">
                  <img src="${charts.weeklyRevenueChartUrl}" alt="Weekly revenue chart" width="520" style="max-width:100%;height:auto;border-radius:8px;" />
                </td></tr>
              </table>
            </td></tr>`
              : ''
          }

          <!-- Best / slowest day -->
          <tr>
            <td style="padding:0 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  ${dayCard('Best day', '🏆', data.bestDay?.dayLabel || '', bestDate, data.bestDay?.revenue, 'best')}
                  ${dayCard('Slowest day', '📉', data.slowestDay?.dayLabel || '', slowDate, data.slowestDay?.revenue, 'slow')}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Top services -->
          ${
            data.topServices?.length
              ? `<tr><td style="padding:0 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
                <tr><td style="padding:16px 18px 8px;font-size:14px;font-weight:700;color:#0f172a;">Top 3 services</td></tr>
                <tr><td style="padding:0 18px 12px;">${topServicesList(data.topServices)}</td></tr>
                ${
                  charts.topServicesChartUrl
                    ? `<tr><td style="padding:0 8px 12px;text-align:center;"><img src="${charts.topServicesChartUrl}" alt="Top services" width="480" style="max-width:100%;height:auto;" /></td></tr>`
                    : ''
                }
              </table>
            </td></tr>`
              : ''
          }

          <!-- Customer mix -->
          ${
            customerTotal > 0
              ? `<tr><td style="padding:0 0 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
                <tr><td style="padding:16px 18px 8px;font-size:14px;font-weight:700;color:#0f172a;">Customer mix</td></tr>
                <tr><td style="padding:0 18px 8px;font-size:13px;color:${MUTED};">Returning customers = loyalty. Yours: <strong style="color:#0f172a;">${returningPct}%</strong> this week</td></tr>
                ${
                  charts.customerMixDonutUrl
                    ? `<tr><td style="padding:0 8px 12px;text-align:center;"><img src="${charts.customerMixDonutUrl}" alt="Customer mix" width="280" style="max-width:100%;height:auto;" /></td></tr>`
                    : `<tr><td style="padding:0 18px 16px;font-size:14px;">New ${fmtInt(data.newCustomers)} · Returning ${fmtInt(data.returningCustomers)}</td></tr>`
                }
              </table>
            </td></tr>`
              : ''
          }

          ${funnelBar(data.appointmentFunnel)}
          ${leaderboardHtml(data.staffLeaderboard)}

          <!-- Footer CTA -->
          <tr>
            <td style="padding:8px 0 24px;text-align:center;">
              <a href="${dashboardUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px;">See full week in dashboard →</a>
              <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">EaseMySalon · Weekly summary for ${data.branchName || 'your branch'}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Weekly Summary — ${data.branchName}`,
    `Week of ${data.weekRangeFormatted || `${data.weekStartDate} – ${data.weekEndDate}`}`,
    '',
    insight.text,
    '',
    `Net revenue: ${fmtCurrency(data.weekTotalRevenue)} (${wow.label})`,
    `Bills: ${fmtInt(data.weekTotalBills)} | Appointments: ${fmtInt(data.weekTotalAppointments)}`,
    data.bestDay?.revenue
      ? `Best day: ${data.bestDay.dayLabel} ${fmtCurrency(data.bestDay.revenue)}`
      : '',
    '',
    `Dashboard: ${dashboardUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

module.exports = {
  renderWeeklySummaryEmail,
};
