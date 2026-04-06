import axios from 'axios'

/** Matches backend `backend/middleware/csrf.js` — double-submit cookie name. */
const CSRF_COOKIE = 'ems_csrf'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'

let csrfBootstrapInFlight: Promise<void> | null = null

/** When the API is on another origin, `document.cookie` does not include the API host’s cookie; login / GET /api/auth/csrf return the token in JSON — we mirror it here for the X-CSRF-Token header. */
const CSRF_SESSION_STORAGE_KEY = 'salon-ems-csrf'

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

function getCsrfTokenFromSessionStorage(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const t = sessionStorage.getItem(CSRF_SESSION_STORAGE_KEY)
    return t && t.trim() ? t.trim() : null
  } catch {
    return null
  }
}

/** Token for double-submit header: same-origin cookie (if readable) or value from login / bootstrap. */
export function getCsrfToken(): string | null {
  return getCsrfTokenFromCookie() ?? getCsrfTokenFromSessionStorage()
}

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

/** Use on mutating requests when the CSRF cookie is present (set at login or via GET /api/auth/csrf). */
export function csrfHeadersObject(): Record<string, string> {
  const t = getCsrfToken()
  return t ? { [CSRF_HEADER_NAME]: t } : {}
}

/**
 * Ensures a CSRF value exists for mutating API calls (cookie readable on same origin, or JSON from bootstrap).
 * Uses plain axios — not apiClient — to avoid interceptor recursion.
 */
export async function ensureCsrfToken(): Promise<void> {
  if (typeof window === 'undefined') return
  if (getCsrfToken()) return
  if (!csrfBootstrapInFlight) {
    csrfBootstrapInFlight = (async () => {
      try {
        const res = await axios.get<{ success?: boolean; csrfToken?: string }>(`${API_BASE_URL}/auth/csrf`, {
          withCredentials: true,
          timeout: 15000,
        })
        const t = res.data?.csrfToken
        if (t && typeof t === 'string') {
          setCsrfTokenPersisted(t)
        }
      } finally {
        csrfBootstrapInFlight = null
      }
    })()
  }
  await csrfBootstrapInFlight
}
