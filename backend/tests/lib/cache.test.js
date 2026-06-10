/**
 * Redis cache helpers — fail-open; invalidation uses SCAN + UNLINK (non-blocking).
 */

jest.mock('../../lib/redis', () => ({
  getRedisClient: jest.fn(),
}));

const { getRedisClient } = require('../../lib/redis');
const { cacheDel, invalidateTenantReadCaches } = require('../../lib/cache');

function mockRedis(overrides = {}) {
  const pipeline = {
    unlink: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };
  const client = {
    get: jest.fn(),
    setex: jest.fn(),
    unlink: jest.fn().mockResolvedValue(1),
    scan: jest.fn(),
    pipeline: jest.fn(() => pipeline),
    ...overrides,
  };
  getRedisClient.mockReturnValue(client);
  return { client, pipeline };
}

describe('cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRedisClient.mockReturnValue(null);
  });

  it('cacheDel uses UNLINK for a single exact key', async () => {
    const { client } = mockRedis();

    await cacheDel('business:plan:abc');

    expect(client.unlink).toHaveBeenCalledWith('ems:cache:business:plan:abc');
    expect(client.scan).not.toHaveBeenCalled();
  });

  it('cacheDel scans and pipelined-UNLINKs pattern matches', async () => {
    const { client, pipeline } = mockRedis({
      scan: jest
        .fn()
        .mockResolvedValueOnce(['42', ['ems:cache:dashboard:init:1:a', 'ems:cache:dashboard:init:1:b']])
        .mockResolvedValueOnce(['0', ['ems:cache:dashboard:init:1:c']]),
    });

    await cacheDel('dashboard:init:1:*');

    expect(client.scan).toHaveBeenCalledTimes(2);
    expect(client.pipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.unlink).toHaveBeenCalledWith('ems:cache:dashboard:init:1:a');
    expect(pipeline.unlink).toHaveBeenCalledWith('ems:cache:dashboard:init:1:b');
    expect(client.unlink).toHaveBeenCalledWith('ems:cache:dashboard:init:1:c');
    expect(pipeline.exec).toHaveBeenCalledTimes(1);
  });

  it('invalidateTenantReadCaches runs pattern deletes in parallel', async () => {
    const { client } = mockRedis({
      scan: jest.fn().mockResolvedValue(['0', []]),
    });

    await invalidateTenantReadCaches('branch-99');

    expect(client.scan).toHaveBeenCalledTimes(4);
    expect(client.unlink).toHaveBeenCalledWith('ems:cache:business:plan:branch-99');
  });
});
