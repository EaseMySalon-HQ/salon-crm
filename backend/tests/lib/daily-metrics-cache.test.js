/**
 * Unit coverage for daily_metrics cache aggregation helpers.
 */

const {
  enumerateYmdDates,
  aggregateDailyRows,
  mergeDailyRowsByDate,
  datesNeedingLiveFetch,
  buildSeriesMapFromDailyRows,
} = require('../../lib/daily-metrics-cache');

function bucketKeyOf(date, period) {
  const d = new Date(date);
  if (period === 'monthly') {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  if (period === 'weekly') {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - day);
    const pad = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('daily-metrics-cache', () => {
  it('enumerates inclusive YMD dates', () => {
    const start = new Date(2026, 5, 5);
    const end = new Date(2026, 5, 7);
    expect(enumerateYmdDates(start, end)).toEqual(['2026-06-05', '2026-06-06', '2026-06-07']);
  });

  it('aggregates daily rows into range KPIs', () => {
    const rows = [
      {
        date: '2026-06-01',
        revenue: 1000,
        appointments: 5,
        completedAppointments: 4,
        avgRating: 4.5,
        capacityUtilizationPct: 60,
      },
      {
        date: '2026-06-02',
        revenue: 2000,
        appointments: 3,
        completedAppointments: 2,
        avgRating: 3.5,
        capacityUtilizationPct: 40,
      },
    ];
    const agg = aggregateDailyRows(rows);
    expect(agg.revenue).toBe(3000);
    expect(agg.appointments).toBe(8);
    expect(agg.completedAppointments).toBe(6);
    expect(agg.avgTicketSize).toBe(500);
    expect(agg.avgRating).toBe(4);
    expect(agg.capacityUtilizationPct).toBe(50);
  });

  it('merges cached and live rows with live winning on duplicate dates', () => {
    const cached = [{ date: '2026-06-01', revenue: 100 }];
    const live = [{ date: '2026-06-01', revenue: 150 }, { date: '2026-06-02', revenue: 50 }];
    const merged = mergeDailyRowsByDate(cached, live);
    expect(merged).toHaveLength(2);
    expect(merged[0].revenue).toBe(150);
    expect(merged[1].revenue).toBe(50);
  });

  it('flags missing dates and always includes today for live fetch', () => {
    const all = ['2026-06-01', '2026-06-02', '2026-06-03'];
    expect(datesNeedingLiveFetch(all, ['2026-06-01'], '2026-06-01')).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
    ]);
    expect(datesNeedingLiveFetch(all, all, '2026-06-03')).toEqual(['2026-06-03']);
  });

  it('rolls daily rows into weekly revenue buckets', () => {
    const rows = [
      { date: '2026-06-02', revenue: 100, appointments: 1 },
      { date: '2026-06-03', revenue: 200, appointments: 2 },
    ];
    const buckets = [{ key: '2026-06-01', label: 'w1' }];
    const map = buildSeriesMapFromDailyRows(rows, buckets, 'weekly', 'revenue', bucketKeyOf);
    expect(map['2026-06-01']).toBe(300);
  });
});
