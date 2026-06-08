const { phoneMatchFilter } = require('../../lib/client-shared-history');

describe('client-shared-history', () => {
  it('phoneMatchFilter builds exact and suffix phone match', () => {
    const filter = phoneMatchFilter('9876543210');
    expect(filter.$or).toHaveLength(1);
    expect(filter.$or[0].customerPhone).toBe('9876543210');
  });

  it('phoneMatchFilter returns null for empty phone', () => {
    expect(phoneMatchFilter('')).toBeNull();
  });
});
