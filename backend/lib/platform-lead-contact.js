'use strict';

/**
 * Normalize platform lead contact fields. Website and admin forms store
 * firstName / lastName separately; `name` stays denormalized for search.
 */
function normalizeLeadContact({ firstName, lastName, name } = {}) {
  const first = String(firstName ?? '').trim();
  const last = String(lastName ?? '').trim();
  const legacy = String(name ?? '').trim();

  if (first) {
    return {
      firstName: first,
      lastName: last,
      name: [first, last].filter(Boolean).join(' '),
    };
  }

  if (legacy) {
    const parts = legacy.split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || legacy,
      lastName: parts.slice(1).join(' '),
      name: legacy,
    };
  }

  return { firstName: '', lastName: '', name: '' };
}

module.exports = { normalizeLeadContact };
