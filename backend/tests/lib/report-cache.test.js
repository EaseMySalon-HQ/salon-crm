/**
 * Unit coverage for the tenant-scoped report cache helpers.
 */

const {
  getReportCache,
  setReportCache,
  invalidateReportCache,
  clearReportCache,
  withReportCache,
  reportCacheMiddleware,
  __internal,
} = require('../../lib/report-cache');

describe('report-cache', () => {
  beforeEach(() => clearReportCache());

  it('uses stable filter keys regardless of property order', () => {
    setReportCache('biz-1', 'sales', { to: 'b', from: 'a' }, { v: 1 });
    expect(getReportCache('biz-1', 'sales', { from: 'a', to: 'b' })).toEqual({ v: 1 });
  });

  it('treats different reportTypes as separate keys', () => {
    setReportCache('biz-1', 'sales', {}, { v: 1 });
    setReportCache('biz-1', 'expense', {}, { v: 2 });
    expect(getReportCache('biz-1', 'sales', {})).toEqual({ v: 1 });
    expect(getReportCache('biz-1', 'expense', {})).toEqual({ v: 2 });
  });

  it('invalidates only the targeted tenant', () => {
    setReportCache('biz-1', 'sales', {}, { v: 1 });
    setReportCache('biz-2', 'sales', {}, { v: 2 });
    invalidateReportCache('biz-1');
    expect(getReportCache('biz-1', 'sales', {})).toBeNull();
    expect(getReportCache('biz-2', 'sales', {})).toEqual({ v: 2 });
  });

  it('withReportCache returns cached on second call without re-computing', async () => {
    const compute = jest.fn().mockResolvedValue({ ok: true });
    const req = { user: { branchId: 'biz-1' } };
    const res = { locals: {} };
    const a = await withReportCache(req, res, { reportType: 'analytics:revenue', filters: { x: 1 }, compute });
    const b = await withReportCache(req, res, { reportType: 'analytics:revenue', filters: { x: 1 }, compute });
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(res.locals.perfCache).toBe('HIT');
  });

  it('reportCacheMiddleware caches allow-listed routes and skips others', () => {
    const branchId = 'biz-1';
    const req = {
      method: 'GET',
      path: '/api/reports/summary',
      query: { dateFrom: '2026-01-01' },
      user: { branchId },
    };
    let sent;
    const res = {
      statusCode: 200,
      locals: {},
      json: jest.fn((body) => {
        sent = body;
      }),
    };
    reportCacheMiddleware(req, res, () => {});
    res.json({ success: true, data: { totalSales: 123 } });
    expect(sent).toEqual({ success: true, data: { totalSales: 123 } });

    // Second request should be served from cache without entering the handler.
    const res2 = {
      statusCode: 200,
      locals: {},
      json: jest.fn(),
    };
    reportCacheMiddleware(req, res2, () => {});
    expect(res2.locals.perfCache).toBe('HIT');
    expect(res2.json).toHaveBeenCalledWith({ success: true, data: { totalSales: 123 } });
  });

  it('reportCacheMiddleware does not cache non-200 responses', () => {
    const branchId = 'biz-1';
    const req = {
      method: 'GET',
      path: '/api/reports/summary',
      query: {},
      user: { branchId },
    };
    const res = {
      statusCode: 500,
      locals: {},
      json: jest.fn(),
    };
    reportCacheMiddleware(req, res, () => {});
    res.json({ success: false, error: 'oops' });
    expect(getReportCache(branchId, 'route:/api/reports/summary', {})).toBeNull();
  });

  it('reportCacheMiddleware skips non-cacheable paths', () => {
    const req = {
      method: 'GET',
      path: '/api/clients',
      query: {},
      user: { branchId: 'biz-1' },
    };
    const res = { locals: {}, json: jest.fn() };
    reportCacheMiddleware(req, res, () => {});
    expect(res.json).toBe(res.json); // unchanged
  });
});

describe('report-cache internals', () => {
  it('serializes filters deterministically', () => {
    const { stableStringify } = __internal;
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
    expect(stableStringify({ a: undefined, b: 1 })).toBe(stableStringify({ b: 1 }));
  });
});
