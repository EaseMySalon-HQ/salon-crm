const { generateInsight, revenueDeltaPercent } = require('../../lib/daily-summary-insight');
const {
  buildCategoryBarChartUrl,
  buildPaymentDonutChartUrl,
  _clearChartUrlCache,
} = require('../../lib/daily-summary-charts');
const { renderDailySummaryEmail } = require('../../lib/daily-summary-email');

describe('generateInsight', () => {
  test('best day when revenue > 115% of 7-day avg', () => {
    const insight = generateInsight({
      todayNetRevenue: 12000,
      last7DayAvgRevenue: 10000,
      todayAppointments: 10,
      todayBills: 10,
    });
    expect(insight.tone).toBe('positive');
    expect(insight.text).toMatch(/Best day this week/);
  });

  test('slower day when revenue < 70% of 7-day avg', () => {
    const insight = generateInsight({
      todayNetRevenue: 6000,
      last7DayAvgRevenue: 10000,
      todayAppointments: 8,
      todayBills: 8,
    });
    expect(insight.tone).toBe('warning');
    expect(insight.text).toMatch(/Slower day/);
    expect(insight.text).toMatch(/40%/);
  });

  test('appointment conversion warning', () => {
    const insight = generateInsight({
      todayNetRevenue: 10000,
      last7DayAvgRevenue: 10000,
      todayAppointments: 20,
      todayBills: 10,
    });
    expect(insight.tone).toBe('warning');
    expect(insight.text).toMatch(/appointments didn't convert/);
    expect(insight.text).toMatch(/10/);
  });

  test('steady day default', () => {
    const insight = generateInsight({
      todayNetRevenue: 9500,
      last7DayAvgRevenue: 10000,
      todayAppointments: 12,
      todayBills: 10,
    });
    expect(insight.tone).toBe('neutral');
    expect(insight.text).toMatch(/Steady day/);
  });
});

describe('revenueDeltaPercent', () => {
  test('positive, negative, zero baseline', () => {
    expect(revenueDeltaPercent(110, 100)).toBe(10);
    expect(revenueDeltaPercent(90, 100)).toBe(-10);
    expect(revenueDeltaPercent(500, 0)).toBe(100);
    expect(revenueDeltaPercent(0, 0)).toBe(0);
  });
});

describe('daily summary charts', () => {
  test('buildCategoryBarChartUrl returns QuickChart URL', () => {
    _clearChartUrlCache();
    const url = buildCategoryBarChartUrl({
      services: 5000,
      products: 2000,
      packages: 0,
      membership: 1000,
      prepaid: 500,
    });
    expect(url).toMatch(/^https:\/\/quickchart\.io\/chart\?/);
    expect(url).toMatch(/horizontalBar/);
  });

  test('buildPaymentDonutChartUrl returns QuickChart doughnut URL', () => {
    _clearChartUrlCache();
    const url = buildPaymentDonutChartUrl({ cash: 3000, online: 2000, card: 1000 });
    expect(url).toMatch(/^https:\/\/quickchart\.io\/chart\?/);
    expect(url).toMatch(/doughnut/);
  });
});

describe('renderDailySummaryEmail', () => {
  test('includes hero revenue and greeting', () => {
    const { html, text } = renderDailySummaryEmail(
      {
        branchName: 'Demo Salon',
        date: '2026-07-06',
        dateFormatted: '6 July 2026',
        todayBills: 12,
        todayAppointments: 15,
        todayCancelledBills: 1,
        todayNetRevenue: 18500,
        todayGrossRevenue: 19000,
        revenueByCategory: {
          services: 12000,
          products: 4000,
          packages: 0,
          membership: 1500,
          prepaid: 1000,
        },
        paymentMode: { cash: 8000, online: 5000, card: 5500 },
        averageBillValue: 1541.67,
        duesCollected: 1200,
        cashExpense: 800,
        tipCollected: 450,
        cashBalance: 12000,
        feedbackReceived: 3,
        consentFormReceived: 2,
        yesterdayNetRevenue: 16000,
        last7DayAvgRevenue: 15000,
        monthToDateRevenue: 95000,
        monthToDateBills: 68,
      },
      {
        categoryBarChartUrl: 'https://quickchart.io/chart?c=test-bar',
        paymentDonutChartUrl: 'https://quickchart.io/chart?c=test-donut',
      },
      {
        ownerName: 'Priya',
        logoUrl: 'https://example.com/logo.png',
        dashboardUrl: 'https://app.example.com/dashboard',
        settingsUrl: 'https://app.example.com/settings',
      }
    );

    expect(html).toMatch(/Namaste <strong>Priya<\/strong>/);
    expect(html).toMatch(/Today's Net Revenue/);
    expect(html).toMatch(/₹18,500/);
    expect(html).toMatch(/quickchart\.io/);
    expect(html).toMatch(/View full dashboard/);
    expect(text).toMatch(/Demo Salon/);
    expect(text).toMatch(/Priya/);
  });
});
