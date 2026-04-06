/** Matches backend `backend/middleware/csrf.js` — double-submit cookie name. */
const CSRF_COOKIE = 'ems_csrf'

export const CSRF_HEADER_NAME = 'X-CSRF-Token' as const

export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(
    new RegExp(
      '(?:^|; )' + CSRF_COOKIE.replace(/[.$?*|{}()\[\]\\/+^]/g, '\\$&') + '=([^;]*)'
    )
  )
  return m ? decodeURIComponent(m[1]) : null
}

/** Use on mutating requests when the CSRF cookie is present (set at login or via GET /api/auth/csrf). */
export function csrfHeadersObject(): Record<string, string> {
  const t = getCsrfTokenFromCookie()
  return t ? { [CSRF_HEADER_NAME]: t } : {}
}
