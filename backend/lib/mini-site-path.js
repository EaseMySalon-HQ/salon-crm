'use strict';

/** Public mini-website URL prefix (e.g. /business/easemysalon). */
const MINI_SITE_BASE_PATH = '/business';

function miniSiteBasePath(slug, suffix = '') {
  const normalized = String(slug || '').trim().toLowerCase();
  const tail = suffix ? (suffix.startsWith('/') ? suffix : `/${suffix}`) : '';
  return `${MINI_SITE_BASE_PATH}/${encodeURIComponent(normalized)}${tail}`;
}

module.exports = { MINI_SITE_BASE_PATH, miniSiteBasePath };
