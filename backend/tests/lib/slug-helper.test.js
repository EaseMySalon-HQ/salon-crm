'use strict';

const { slugify, isValidTenantSlug, isReservedSlug, uniqueSlug } = require('../../lib/slug-helper');

describe('slug-helper', () => {
  test('slugify normalizes names', () => {
    expect(slugify('Glamour Andheri!')).toBe('glamour-andheri');
    expect(slugify('  Hair  Cut  ')).toBe('hair-cut');
  });

  test('isValidTenantSlug rejects reserved and invalid', () => {
    expect(isValidTenantSlug('glamour-andheri')).toBe(true);
    expect(isValidTenantSlug('admin')).toBe(false);
    expect(isValidTenantSlug('-bad')).toBe(false);
    expect(isReservedSlug('www')).toBe(true);
  });

  test('uniqueSlug suffixes on collision', () => {
    expect(uniqueSlug('haircut', ['haircut'])).toBe('haircut-2');
    expect(uniqueSlug('haircut', new Set(['haircut', 'haircut-2']))).toBe('haircut-3');
  });
});
