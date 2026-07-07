'use strict';

const QUICKCHART_BASE = 'https://quickchart.io/chart';

/** @type {Map<string, { url: string, expiresAt: number }>} */
const urlCache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

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

const CATEGORY_COLORS = {
  services: '#6366f1',
  products: '#8b5cf6',
  packages: '#a855f7',
  membership: '#d946ef',
  prepaid: '#ec4899',
};

const PAYMENT_COLORS = {
  cash: '#22c55e',
  online: '#3b82f6',
  card: '#8b5cf6',
};

/**
 * Horizontal bar chart — revenue by category (PNG via QuickChart).
 */
function buildCategoryBarChartUrl(revenueByCategory = {}) {
  const labels = ['Services', 'Products', 'Packages', 'Membership', 'Prepaid'];
  const keys = ['services', 'products', 'packages', 'membership', 'prepaid'];
  const values = keys.map((k) => Math.round(Number(revenueByCategory[k]) || 0));
  const colors = keys.map((k) => CATEGORY_COLORS[k]);

  const config = {
    type: 'horizontalBar',
    data: {
      labels,
      datasets: [{ label: 'Revenue (₹)', data: values, backgroundColor: colors }],
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

  const key = cacheKey('category-bar', values);
  return getCachedOrBuild(key, () => quickChartUrl(config, { width: 520, height: 260 }));
}

/**
 * Donut chart — payment mode split with % labels.
 */
function buildPaymentDonutChartUrl(paymentMode = {}) {
  const cash = Math.round(Number(paymentMode.cash) || 0);
  const online = Math.round(Number(paymentMode.online) || 0);
  const card = Math.round(Number(paymentMode.card) || 0);
  const total = cash + online + card;
  const labels = ['Cash', 'Online', 'Card'];
  const data = [cash, online, card];
  const colors = [PAYMENT_COLORS.cash, PAYMENT_COLORS.online, PAYMENT_COLORS.card];

  const config = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#ffffff' }],
    },
    options: {
      cutoutPercentage: 55,
      legend: { position: 'bottom', labels: { fontColor: '#334155', padding: 12 } },
      plugins: {
        datalabels: {
          color: '#fff',
          font: { size: 12, weight: 'bold' },
          formatter: (value) => {
            if (!total || value <= 0) return '';
            return `${Math.round((value / total) * 100)}%`;
          },
        },
      },
    },
  };

  const key = cacheKey('payment-donut', data);
  return getCachedOrBuild(key, () => quickChartUrl(config, { width: 400, height: 320 }));
}

function buildDailySummaryChartUrls(data) {
  return {
    categoryBarChartUrl: buildCategoryBarChartUrl(data.revenueByCategory),
    paymentDonutChartUrl: buildPaymentDonutChartUrl(data.paymentMode),
  };
}

module.exports = {
  buildCategoryBarChartUrl,
  buildPaymentDonutChartUrl,
  buildDailySummaryChartUrls,
  /** @internal — for tests */
  _clearChartUrlCache: () => urlCache.clear(),
};
