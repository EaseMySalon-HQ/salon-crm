'use strict';

const QUICKCHART_BASE = 'https://quickchart.io/chart';
const urlCache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const CATEGORY_COLORS = {
  services: '#6366f1',
  products: '#8b5cf6',
  packages: '#a855f7',
  membership: '#d946ef',
  prepaid: '#ec4899',
};

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

/** Semicircle-style MoM growth gauge (green/amber/red fill). */
function buildGrowthGaugeUrl(momPercent = 0) {
  const pct = Math.max(-50, Math.min(50, Number(momPercent) || 0));
  const normalized = Math.round(((pct + 50) / 100) * 100);
  const color = pct >= 10 ? '#16a34a' : pct >= 0 ? '#6366f1' : pct >= -10 ? '#d97706' : '#dc2626';

  const config = {
    type: 'doughnut',
    data: {
      labels: ['Growth', 'Remaining'],
      datasets: [
        {
          data: [normalized, 100 - normalized],
          backgroundColor: [color, '#e2e8f0'],
          borderWidth: 0,
        },
      ],
    },
    options: {
      rotation: -Math.PI,
      circumference: Math.PI,
      cutoutPercentage: 72,
      legend: { display: false },
      plugins: {
        datalabels: {
          display: true,
          color: '#0f172a',
          font: { size: 22, weight: 'bold' },
          formatter: () => `${pct > 0 ? '+' : ''}${Math.round(pct)}%`,
        },
      },
    },
  };

  const key = cacheKey('mom-gauge', [Math.round(pct * 10)]);
  return getCachedOrBuild(key, () => quickChartUrl(config, { width: 280, height: 160 }));
}

function buildCategoryDonutUrl(revenueByCategory = {}) {
  const labels = ['Services', 'Products', 'Packages', 'Membership', 'Prepaid'];
  const keys = ['services', 'products', 'packages', 'membership', 'prepaid'];
  const values = keys.map((k) => Math.round(Number(revenueByCategory[k]) || 0));
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const config = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: keys.map((k) => CATEGORY_COLORS[k]),
          borderWidth: 2,
          borderColor: '#fff',
        },
      ],
    },
    options: {
      cutoutPercentage: 55,
      legend: { position: 'bottom', labels: { fontColor: '#334155', padding: 8, boxWidth: 12 } },
      plugins: {
        datalabels: {
          color: '#fff',
          font: { size: 11, weight: 'bold' },
          formatter: (v) => (v > 0 && total ? `${Math.round((v / total) * 100)}%` : ''),
        },
      },
    },
  };

  const key = cacheKey('monthly-cat-donut', values);
  return getCachedOrBuild(key, () => quickChartUrl(config, { width: 400, height: 320 }));
}

function buildTrendLineUrl(last6MonthsRevenue = []) {
  const series = (last6MonthsRevenue || []).slice(-6);
  if (!series.length) return null;

  const labels = series.map((r) => r.label || r.monthKey);
  const values = series.map((r) => Math.round(Number(r.revenue) || 0));

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Revenue',
          data: values,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#4f46e5',
        },
      ],
    },
    options: {
      legend: { display: false },
      plugins: {
        datalabels: { display: false },
      },
      scales: {
        yAxes: [{ ticks: { beginAtZero: true, fontColor: '#64748b' }, gridLines: { color: '#f1f5f9' } }],
        xAxes: [{ ticks: { fontColor: '#334155' }, gridLines: { display: false } }],
      },
    },
  };

  const key = cacheKey('monthly-trend', values);
  return getCachedOrBuild(key, () => quickChartUrl(config, { width: 520, height: 220 }));
}

function buildMonthlySummaryChartUrls(data) {
  const { momPercent } = require('./monthly-summary-insight');
  const mom = momPercent(data.monthTotalRevenue, data.previousMonthTotalRevenue);
  return {
    growthGaugeUrl: buildGrowthGaugeUrl(mom),
    categoryDonutUrl: buildCategoryDonutUrl(data.revenueByCategory),
    trendLineUrl: buildTrendLineUrl(data.last6MonthsRevenue),
    momPercent: mom,
  };
}

module.exports = {
  buildGrowthGaugeUrl,
  buildCategoryDonutUrl,
  buildTrendLineUrl,
  buildMonthlySummaryChartUrls,
  _clearChartUrlCache: () => urlCache.clear(),
};
