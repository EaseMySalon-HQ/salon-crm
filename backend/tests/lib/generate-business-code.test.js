const { generateNextBusinessCode } = require('../../lib/generate-business-code');

function mockBusinessModel(codes) {
  const set = new Set(codes);

  return {
    find: jest.fn((query) => {
      const isCodeQuery =
        query?.code instanceof RegExp || query?.code?.$regex != null;
      if (isCodeQuery) {
        return {
          select: () => ({
            lean: async () => codes.map((code) => ({ code })),
          }),
        };
      }
      return { select: () => ({ lean: async () => [] }) };
    }),
    findOne: jest.fn((query) => ({
      select: () => ({
        lean: async () => (set.has(query.code) ? { _id: 'x' } : null),
      }),
    })),
  };
}

describe('generateNextBusinessCode', () => {
  it('returns BIZ0001 when no businesses exist', async () => {
    const Business = mockBusinessModel([]);
    await expect(generateNextBusinessCode(Business)).resolves.toBe('BIZ0001');
  });

  it('returns next code after highest existing (skips deleted gaps)', async () => {
    const Business = mockBusinessModel(['BIZ0001', 'BIZ0002', 'BIZ0003']);
    await expect(generateNextBusinessCode(Business)).resolves.toBe('BIZ0004');
  });

  it('continues past holes when max is higher', async () => {
    const Business = mockBusinessModel(['BIZ0001', 'BIZ0005']);
    await expect(generateNextBusinessCode(Business)).resolves.toBe('BIZ0006');
  });
});
