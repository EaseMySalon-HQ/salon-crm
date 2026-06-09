const databaseManager = require('../../config/database-manager');

describe('database-manager connection health', () => {
  afterEach(() => {
    databaseManager.connections.clear();
    databaseManager.connectionMeta.clear();
  });

  it('returns false when connection is not ready', async () => {
    expect(await databaseManager._ensureHealthy('ease_my_salon_BIZ0001', { readyState: 0 })).toBe(
      false
    );
  });

  it('caches successful admin ping within the health interval', async () => {
    const command = jest.fn().mockResolvedValue({ ok: 1 });
    const conn = {
      readyState: 1,
      db: { admin: () => ({ command }) },
    };

    expect(await databaseManager._ensureHealthy('ease_my_salon_BIZ0001', conn)).toBe(true);
    expect(await databaseManager._ensureHealthy('ease_my_salon_BIZ0001', conn)).toBe(true);
    expect(command).toHaveBeenCalledTimes(1);
  });

  it('reports unhealthy when admin ping fails', async () => {
    const command = jest.fn().mockRejectedValue(new Error('not connected'));
    const conn = {
      readyState: 1,
      db: { admin: () => ({ command }) },
    };

    expect(await databaseManager._ensureHealthy('ease_my_salon_BIZ0001', conn)).toBe(false);
  });

  it('removes cached connection on disconnect lifecycle event', () => {
    const dbName = 'ease_my_salon_BIZ0001';
    const conn = { readyState: 1, on: jest.fn() };
    databaseManager.connections.set(dbName, conn);
    databaseManager.connectionMeta.set(dbName, Date.now());

    databaseManager._registerConnectionLifecycle(dbName, conn);
    const disconnectHandler = conn.on.mock.calls.find((c) => c[0] === 'disconnected')[1];
    disconnectHandler();

    expect(databaseManager.connections.has(dbName)).toBe(false);
    expect(databaseManager.connectionMeta.has(dbName)).toBe(false);
  });
});
