/**
 * Unit coverage for the tenant-scoped dashboard cache helpers.
 */

const {
  getDashboardCache,
  setDashboardCache,
  invalidateDashboardCache,
  clearDashboardCache,
  pathTriggersInvalidate,
  dashboardInvalidateOnMutation,
} = require('../../lib/dashboard-cache');

describe('dashboard-cache', () => {
  beforeEach(() => clearDashboardCache());

  it('stores and reads per-tenant payloads with TTL', () => {
    setDashboardCache('biz-1', { hello: 'world' });
    expect(getDashboardCache('biz-1')).toEqual({ hello: 'world' });
    expect(getDashboardCache('biz-2')).toBeNull();
  });

  it('returns null after invalidation', () => {
    setDashboardCache('biz-1', { x: 1 });
    invalidateDashboardCache('biz-1');
    expect(getDashboardCache('biz-1')).toBeNull();
  });

  it('does not leak across tenants on invalidation', () => {
    setDashboardCache('biz-1', { a: 1 });
    setDashboardCache('biz-2', { b: 2 });
    invalidateDashboardCache('biz-1');
    expect(getDashboardCache('biz-1')).toBeNull();
    expect(getDashboardCache('biz-2')).toEqual({ b: 2 });
  });

  it('flags only mutation-relevant paths', () => {
    expect(pathTriggersInvalidate('/api/sales')).toBe(true);
    expect(pathTriggersInvalidate('/api/sales/abc')).toBe(true);
    expect(pathTriggersInvalidate('/api/appointments/123/status')).toBe(true);
    expect(pathTriggersInvalidate('/api/settings/business')).toBe(false);
    expect(pathTriggersInvalidate('')).toBe(false);
  });

  it('invalidates on 2xx mutation finish for cached tenant', () => {
    setDashboardCache('biz-1', { x: 1 });
    const finishHandlers = [];
    const req = {
      method: 'POST',
      path: '/api/sales',
      user: { branchId: 'biz-1' },
    };
    const res = {
      statusCode: 201,
      on(event, cb) {
        if (event === 'finish') finishHandlers.push(cb);
      },
    };
    let nextCalled = false;
    dashboardInvalidateOnMutation(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    finishHandlers.forEach((cb) => cb());
    expect(getDashboardCache('biz-1')).toBeNull();
  });

  it('does not invalidate on non-2xx mutation finish', () => {
    setDashboardCache('biz-1', { x: 1 });
    const finishHandlers = [];
    const req = {
      method: 'POST',
      path: '/api/sales',
      user: { branchId: 'biz-1' },
    };
    const res = {
      statusCode: 500,
      on(event, cb) {
        if (event === 'finish') finishHandlers.push(cb);
      },
    };
    dashboardInvalidateOnMutation(req, res, () => {});
    finishHandlers.forEach((cb) => cb());
    expect(getDashboardCache('biz-1')).toEqual({ x: 1 });
  });

  it('skips non-mutation paths entirely', () => {
    const req = {
      method: 'POST',
      path: '/api/settings/whatsapp',
      user: { branchId: 'biz-1' },
    };
    const res = {
      on: jest.fn(),
    };
    let nextCalled = false;
    dashboardInvalidateOnMutation(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(res.on).not.toHaveBeenCalled();
  });
});
