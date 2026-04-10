const { replaceApiV1 } = require('../middleware/api-v1-alias');

describe('api-v1-alias', () => {
  it('maps /api/v1 paths to /api', () => {
    expect(replaceApiV1('/api/v1')).toBe('/api');
    expect(replaceApiV1('/api/v1/clients')).toBe('/api/clients');
    expect(replaceApiV1('/api/v1/auth/login')).toBe('/api/auth/login');
  });

  it('preserves query string', () => {
    expect(replaceApiV1('/api/v1/foo?bar=1')).toBe('/api/foo?bar=1');
  });

  it('leaves unversioned paths unchanged', () => {
    expect(replaceApiV1('/api/clients')).toBe('/api/clients');
    expect(replaceApiV1('/health')).toBe('/health');
  });
});
