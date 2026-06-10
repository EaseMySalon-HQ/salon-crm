const databaseManager = require('../../config/database-manager');
const modelFactory = require('../../models/model-factory');

describe('database-manager connection health', () => {
  afterEach(() => {
    databaseManager.connections.clear();
    databaseManager.connectionMeta.clear();
    modelFactory.models.clear();
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
    const conn = { name: dbName, readyState: 1, on: jest.fn() };
    modelFactory.models.set(`${dbName}_Client`, { db: conn });
    databaseManager.connections.set(dbName, conn);
    databaseManager.connectionMeta.set(dbName, Date.now());

    databaseManager._registerConnectionLifecycle(dbName, conn);
    const disconnectHandler = conn.on.mock.calls.find((c) => c[0] === 'disconnected')[1];
    disconnectHandler();

    expect(databaseManager.connections.has(dbName)).toBe(false);
    expect(databaseManager.connectionMeta.has(dbName)).toBe(false);
    expect(modelFactory.models.has(`${dbName}_Client`)).toBe(false);
  });

  it('clears model factory cache when connection artifacts are cleared', () => {
    const conn = { name: 'ease_my_salon_BIZ0001' };
    modelFactory.models.set('ease_my_salon_BIZ0001_Client', { db: conn });
    modelFactory.models.set('ease_my_salon_BIZ0001_Staff', { db: conn });
    modelFactory.models.set('ease_my_salon_BIZ0002_Client', { db: { name: 'ease_my_salon_BIZ0002' } });

    databaseManager._clearConnectionArtifacts(conn);

    expect(modelFactory.models.has('ease_my_salon_BIZ0001_Client')).toBe(false);
    expect(modelFactory.models.has('ease_my_salon_BIZ0001_Staff')).toBe(false);
    expect(modelFactory.models.has('ease_my_salon_BIZ0002_Client')).toBe(true);
  });

  it('clears model factory cache when a stale connection is closed', async () => {
    const dbName = 'ease_my_salon_BIZ0001';
    const conn = {
      name: dbName,
      readyState: 0,
      close: jest.fn().mockResolvedValue(undefined),
    };
    modelFactory.models.set(`${dbName}_Client`, { db: conn });
    databaseManager.connections.set(dbName, conn);

    await databaseManager._closeOne(dbName);

    expect(databaseManager.connections.has(dbName)).toBe(false);
    expect(modelFactory.models.has(`${dbName}_Client`)).toBe(false);
  });
});
