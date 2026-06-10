/**
 * Unit coverage for the tenant-scoped dashboard cache helpers.
 *
 * Covers the stale-while-revalidate behaviour: after an invalidation the
 * in-memory payload is kept around for `STALE_WHILE_REVALIDATE_MS` so reads
 * stay fast while the route runs a background rebuild.
 */

jest.mock('../../lib/cache', () => ({
  invalidateTenantReadCaches: jest.fn().mockResolvedValue(undefined),
}));

const { invalidateTenantReadCaches } = require('../../lib/cache');

const {
  getDashboardCache,
  getDashboardCacheEntry,
  setDashboardCache,
  invalidateDashboardCache,
  clearDashboardCache,
  pathTriggersInvalidate,
  dashboardInvalidateOnMutation,
  __internal,
} = require('../../lib/dashboard-cache');

describe('dashboard-cache', () => {
  beforeEach(() => {
    clearDashboardCache();
    invalidateTenantReadCaches.mockClear();
  });

  it('stores and reads per-tenant payloads with TTL', () => {
    setDashboardCache('biz-1', { hello: 'world' });
    expect(getDashboardCache('biz-1')).toEqual({ hello: 'world' });
    expect(getDashboardCache('biz-2')).toBeNull();
  });

  it('fresh reads via getDashboardCacheEntry expose state', () => {
    setDashboardCache('biz-1', { x: 1 });
    const entry = getDashboardCacheEntry('biz-1');
    expect(entry).not.toBeNull();
    expect(entry.state).toBe('fresh');
    expect(entry.payload).toEqual({ x: 1 });
  });

  it('returns null from getDashboardCache after invalidation (stale not fresh)', () => {
    setDashboardCache('biz-1', { x: 1 });
    invalidateDashboardCache('biz-1');
    expect(getDashboardCache('biz-1')).toBeNull();
  });

  it('keeps the payload available as stale after invalidation', () => {
    setDashboardCache('biz-1', { x: 1 });
    invalidateDashboardCache('biz-1');
    const entry = getDashboardCacheEntry('biz-1');
    expect(entry).not.toBeNull();
    expect(entry.state).toBe('stale');
    expect(entry.payload).toEqual({ x: 1 });
  });

  it('drops the entry once past the stale window', () => {
    setDashboardCache('biz-1', { x: 1 });
    const key = __internal.makeKey('biz-1');
    const stored = __internal.store.get(key);
    stored.freshUntil = Date.now() - 1000;
    stored.staleUntil = Date.now() - 1;
    expect(getDashboardCacheEntry('biz-1')).toBeNull();
    expect(__internal.store.has(key)).toBe(false);
  });

  it('does not leak across tenants on invalidation', () => {
    setDashboardCache('biz-1', { a: 1 });
    setDashboardCache('biz-2', { b: 2 });
    invalidateDashboardCache('biz-1');
    expect(getDashboardCache('biz-1')).toBeNull();
    expect(getDashboardCache('biz-2')).toEqual({ b: 2 });
  });

  it('coalesces repeated invalidations into a single Redis pass', async () => {
    setDashboardCache('biz-1', { x: 1 });
    invalidateDashboardCache('biz-1');
    invalidateDashboardCache('biz-1');
    invalidateDashboardCache('biz-1');
    expect(__internal.pendingRedisInvalidations.has('biz-1')).toBe(true);
    expect(invalidateTenantReadCaches).not.toHaveBeenCalled();

    await new Promise((resolve) =>
      setTimeout(resolve, __internal.REDIS_INVALIDATE_COALESCE_MS + 50)
    );
    expect(invalidateTenantReadCaches).toHaveBeenCalledTimes(1);
    expect(invalidateTenantReadCaches).toHaveBeenCalledWith('biz-1');
    expect(__internal.pendingRedisInvalidations.has('biz-1')).toBe(false);
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
