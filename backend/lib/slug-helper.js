'use strict';

const RESERVED_SLUGS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'book',
  'salon',
  'login',
  'dashboard',
  'settings',
  'receipt',
  'feedback',
  'blog',
  'pricing',
  'demo',
  'contact',
  'features',
  'mail',
  'cdn',
  'assets',
  'status',
  'docs',
  'staging',
  'test',
]);

/**
 * Convert a display name into a URL-safe slug (lowercase, hyphens).
 */
function slugify(input, { maxLength = 60 } = {}) {
  const base = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return base || 'item';
}

function isValidTenantSlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(s)) return false;
  if (RESERVED_SLUGS.has(s)) return false;
  return true;
}

function isReservedSlug(slug) {
  return RESERVED_SLUGS.has(String(slug || '').trim().toLowerCase());
}

/**
 * Ensure unique slug among existing values (Set or array of strings).
 */
function uniqueSlug(base, existing) {
  const set = existing instanceof Set ? existing : new Set(existing || []);
  let candidate = slugify(base);
  if (!set.has(candidate)) return candidate;
  let i = 2;
  while (set.has(`${candidate}-${i}`)) i += 1;
  return `${candidate}-${i}`;
}

module.exports = {
  RESERVED_SLUGS,
  slugify,
  isValidTenantSlug,
  isReservedSlug,
  uniqueSlug,
};
