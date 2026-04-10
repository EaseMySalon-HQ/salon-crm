/**
 * CSRF helpers — double-submit cookie mirror.
 *
 * On cross-origin deployments (SPA origin ≠ API origin), `ems_csrf` is set on
 * the API host — `document.cookie` on the SPA cannot read it. The backend
 * returns `csrfToken` in JSON from login, GET /auth/profile, and POST /auth/refresh;
 * we persist it here so mutating requests can send `X-CSRF-Token`.
 *
 * Bearer-authenticated requests skip CSRF on the backend.
 */

/** Matches backend `backend/middleware/csrf.js` — double-submit cookie name. */
const CSRF_COOKIE = 'ems_csrf'

const CSRF_SESSION_STORAGE_KEY = 'salon-ems-csrf'

export const CSRF_HEADER_NAME = 'X-CSRF-Token' as const

/** Read the CSRF token from `document.cookie` (works on same-origin only). */
export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(
    new RegExp(
      '(?:^|; )' + CSRF_COOKIE.replace(/[.$?*|{}()\[\]\\/+^]/g, '\\$&') + '=([^;]*)'
    )
  )
  return m ? decodeURIComponent(m[1]) : null
}

/** Read the CSRF token persisted at login (cross-origin fallback). */
function getCsrfTokenFromSessionStorage(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const t = sessionStorage.getItem(CSRF_SESSION_STORAGE_KEY)
    return t && t.trim() ? t.trim() : null
  } catch {
    return null
  }
}

/** Best-effort CSRF token: same-origin cookie first, then session mirror. */
export function getCsrfToken(): string | null {
  return getCsrfTokenFromCookie() ?? getCsrfTokenFromSessionStorage()
}

/** Store the token returned by login / GET /api/auth/csrf for cross-origin use. */
export function setCsrfTokenPersisted(token: string | null | undefined): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (token && String(token).trim()) {
      sessionStorage.setItem(CSRF_SESSION_STORAGE_KEY, String(token).trim())
    } else {
      sessionStorage.removeItem(CSRF_SESSION_STORAGE_KEY)
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearCsrfTokenPersisted(): void {
  setCsrfTokenPersisted(null)
}

/** Header object for mutating `fetch()` calls that need CSRF (admin panel). */
export function csrfHeadersObject(): Record<string, string> {
  const t = getCsrfToken()
  return t ? { [CSRF_HEADER_NAME]: t } : {}
}
