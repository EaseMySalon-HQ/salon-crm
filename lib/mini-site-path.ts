/** Public mini-website URL prefix (e.g. /business/easemysalon). */
export const MINI_SITE_BASE_PATH = '/business' as const

export function miniSiteBasePath(slug: string, suffix = ''): string {
  const normalized = String(slug).trim().toLowerCase()
  const tail = suffix
    ? suffix.startsWith('/')
      ? suffix
      : `/${suffix}`
    : ''
  return `${MINI_SITE_BASE_PATH}/${encodeURIComponent(normalized)}${tail}`
}
