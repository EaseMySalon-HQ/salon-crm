'use strict';

const QUICKCHART_BASE = 'https://quickchart.io/chart';

/** @type {Map<string, { url: string, expiresAt: number }>} */
const urlCache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Mon → Sun gradient (light to bold indigo) */
const DAY_GRADIENT = ['#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3'];

function cacheKey(prefix, payload) {
  return `${prefix}:${JSON.stringify(payload)}`;
}

function getCachedOrBuild(key, buildFn) {
  const now = Date.now();
  const hit = urlCache.get(key);
  if (hit && hit.expiresAt > now) return hit.url;
  const url = buildFn();
  urlCache.set(key, { url, expiresAt: now + CACHE_TTL_MS });
  return url;
}

function quickChartUrl(config, { width = 520, height = 280, backgroundColor = 'white' } = {}) {
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    backgroundColor,
    c: JSON.stringify(config),
  });
  return `${QUICKCHART_BASE}?${params.toString()}`;
}

/**
 * Bar chart — daily revenue Mon–Sun with prior-week daily average reference line.
 */
function buildWeeklyRevenueChartUrl(dailyRevenue = [], previousWeekTotalRevenue = 0) {
  const labels = dailyRevenue.map((d) => d.dayLabel || d.date?.slice(5) || '');
  const values = dailyRevenue.map((d) => Math.round(Number(d.netRevenue) || 0));
  const colors = dailyRevenue.map((_, i) => DAY_GRADIENT[i] || DAY_GRADIENT[DAY_GRADIENT.length - 1]);
  const refLine = previousWeekTotalRevenue > 0 ? Math.round(previousWeekTotalRevenue / 7) : 0;

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Net revenue',
          data: values,
          backgroundColor: colors,
          borderRadius: 6,
          order: 2,
        },
        ...(refLine > 0
          ? [
              {
                type: 'line',
                label: 'Last week avg/day',
                data: labels.map(() => refLine),
                borderColor: '#94a3b8',
                borderDash: [6, 4],
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                order: 1,
              },
            ]
          : []),
      ],
    },
    options: {
      legend: { display: refLine > 0, position: 'bottom', labels: { fontColor: '#64748b' } },
      plugins: {
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: '#334155',
          font: { size: 10, weight: 'bold' },
          formatter: (v) => (v > 0 ? `₹${(v / 1000).toFixed(v >= 1000 ? 1 : 0)}${v >= 1000 ? 'k' : ''}` : ''),
        },
      },
      scales: {
        yAxes: [{ ticks: { beginAtZero: true, fontColor: '#64748b' }, gridLines: { color: '#f1f5f9' } }],
        xAxes: [{ ticks: { fontColor: '#334155' }, gridLines: { display: false } }],
      },
    },
  };

  const key = cacheKey('weekly-bar', { values, refLine });
  return getCachedOrBuild(key, () => quickChartUrl(config, { width: 520, height: 260 }));
}

function buildCustomerMixDonutUrl(newCustomers = 0, returningCustomers = 0) {
  const n = Math.round(Number(newCustomers) || 0);
  const r = Math.round(Number(returningCustomers) || 0);
  const total = n + r;
  if (total <= 0) return null;

  const config = {
    type: 'doughnut',
    data: {
      labels: ['New', 'Returning'],
      datasets: [
        {
          data: [n, r],
          backgroundColor: ['#818cf8', '#22c55e'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    },
    options: {
      cutoutPercentage: 58,
      legend: { position: 'bottom', labels: { fontColor: '#334155', padding: 10 } },
      plugins: {
        datalabels: {
          color: '#fff',
          font: { size: 12, weight: 'bold' },
          formatter: (value) => `${Math.round((value / total) * 100)}%`,
        },
      },
    },
  };

  const key = cacheKey('customer-donut', [n, r]);
  return getCachedOrBuild(key, () => quickChartUrl(config, { width: 320, height: 280 }));
}

function buildTopServicesChartUrl(topServices = []) {
  const items = (topServices || []).slice(0, 3);
  if (!items.length) return null;

  const labels = items.map((s) => s.name);
  const values = items.map((s) => Math.round(Number(s.revenue) || 0));
  const colors = ['#6366f1', '#8b5cf6', '#a855f7'];

  const config = {
    type: 'horizontalBar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length) }],
    },
    options: {
      legend: { display: false },
      plugins: {
        datalabels: {
          anchor: 'end',
          align: 'right',
          color: '#334155',
          font: { size: 11, weight: 'bold' },
          formatter: (v) => (v > 0 ? `₹${v.toLocaleString('en-IN')}` : ''),
        },
      },
      scales: {
        xAxes: [{ ticks: { beginAtZero: true, fontColor: '#64748b' }, gridLines: { color: '#f1f5f9' } }],
        yAxes: [{ ticks: { fontColor: '#334155' }, gridLines: { display: false } }],
      },
    },
  };

  const key = cacheKey('top-services', values);
  return getCachedOrBuild(key, () => quickChartUrl(config, { width: 480, height: 180 + items.length * 40 }));
}

function buildWeeklySummaryChartUrls(data) {
  return {
    weeklyRevenueChartUrl: buildWeeklyRevenueChartUrl(
      data.dailyRevenue,
      data.previousWeekTotalRevenue
    ),
    customerMixDonutUrl: buildCustomerMixDonutUrl(data.newCustomers, data.returningCustomers),
    topServicesChartUrl: buildTopServicesChartUrl(data.topServices),
  };
}

module.exports = {
  buildWeeklyRevenueChartUrl,
  buildCustomerMixDonutUrl,
  buildTopServicesChartUrl,
  buildWeeklySummaryChartUrls,
  DAY_GRADIENT,
  _clearChartUrlCache: () => urlCache.clear(),
};
