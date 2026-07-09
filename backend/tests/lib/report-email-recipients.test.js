'use strict';

const {
  normalizeEmail,
  mergeRecipientsByEmail,
} = require('../../lib/report-email-recipients');

describe('report-email-recipients', () => {
  test('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Owner@Example.COM ')).toBe('owner@example.com');
    expect(normalizeEmail('')).toBe('');
  });

  test('mergeRecipientsByEmail dedupes by email within one branch send', () => {
    const merged = mergeRecipientsByEmail([
      { _id: '1', name: 'A', email: 'owner@test.com', role: 'admin' },
      { _id: '2', name: 'B', email: 'OWNER@test.com', role: 'staff' },
      { _id: '3', name: 'C', email: 'staff@test.com', role: 'staff' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.email)).toEqual(['owner@test.com', 'staff@test.com']);
    expect(merged[0]._id).toBe('1');
  });

  test('mergeRecipientsByEmail skips empty emails', () => {
    const merged = mergeRecipientsByEmail([
      { _id: '1', name: 'No email', email: '', role: 'admin' },
      { _id: '2', name: 'Valid', email: 'a@b.com', role: 'admin' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].email).toBe('a@b.com');
  });
});
