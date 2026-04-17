/**
 * Centralized auth utilities for session handling.
 * Used by API interceptor and auth context for consistent logout behavior.
 */

import { clearCsrfTokenPersisted } from './csrf'

export const AUTH_LOGOUT_EVENT = 'salon-auth-logout'
export const SESSION_EXPIRED_KEY = 'salon-session-expired'
export const REMEMBERED_BUSINESS_CODE_KEY = 'salon-remembered-business-code'

/**
 * Clear all salon auth data from storage.
 * Call this on logout or when session is invalid (401/403).
 */
export function clearAuthStorage(): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem('salon-auth-user')

  sessionStorage.removeItem('salon-auth-user')

  clearCsrfTokenPersisted()
}

/**
 * Mark that session expired (for showing message on login page).
 */
export function setSessionExpiredFlag(): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(SESSION_EXPIRED_KEY, 'true')
}

/**
 * Check and consume the session expired flag.
 * Returns true if the flag was set (caller should show "Session expired" message).
 */
export function consumeSessionExpiredFlag(): boolean {
  if (typeof window === 'undefined') return false
  const had = sessionStorage.getItem(SESSION_EXPIRED_KEY) === 'true'
  sessionStorage.removeItem(SESSION_EXPIRED_KEY)
  return had
}

/**
 * Dispatch auth logout event so AuthProvider can clear user state.
 * Call this from API interceptor when 401/403 is received.
 */
export function dispatchAuthLogout(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT))
}

/**
 * Get remembered business code for staff login (from localStorage).
 */
export function getRememberedBusinessCode(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REMEMBERED_BUSINESS_CODE_KEY)
}

/**
 * Save business code for future staff logins.
 */
export function setRememberedBusinessCode(code: string): void {
  if (typeof window === 'undefined') return
  if (code?.trim()) {
    localStorage.setItem(REMEMBERED_BUSINESS_CODE_KEY, code.trim())
  }
}

/**
 * Clear remembered business code.
 */
export function clearRememberedBusinessCode(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(REMEMBERED_BUSINESS_CODE_KEY)
}

export interface SessionExpiredContext {
  /** Origin of the forced logout — `api_interceptor`, `auth_context_check`, etc. */
  source?: string
  /** HTTP status that triggered the cascade (usually 401/403). */
  status?: number
  /** URL of the request whose failure triggered the cascade. */
  requestUrl?: string
  /** Server-provided error message (already normalized upstream). */
  errorMessage?: string
}

/**
 * Fire-and-forget audit beacon so the backend can record _this specific browser_ being
 * forced to /login after a 401/403 cascade that our own /logout endpoint never sees.
 * Uses navigator.sendBeacon (survives unload) with a fetch+keepalive fallback.
 * Must be called BEFORE clearAuthStorage so we can still read the cached user.
 */
function sendSessionExpiredBeacon(context: SessionExpiredContext): void {
  if (typeof window === 'undefined') return

  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
  const url = `${base}/auth/session-expired-beacon`

  let userId: string | undefined
  let email: string | undefined
  try {
    const stored = localStorage.getItem('salon-auth-user')
    if (stored) {
      const u = JSON.parse(stored) as { _id?: unknown; email?: unknown }
      if (typeof u?._id === 'string') userId = u._id
      if (typeof u?.email === 'string') email = u.email
    }
  } catch {
    /* ignore malformed cache */
  }

  const payload = {
    source: context.source,
    status: context.status,
    requestUrl: context.requestUrl,
    errorMessage: context.errorMessage,
    pathname: window.location?.pathname,
    userId,
    email,
    ts: new Date().toISOString(),
  }
  const body = JSON.stringify(payload)

  /**
   * Use text/plain so this is a "CORS-safelisted request" — no preflight OPTIONS needed.
   * application/json triggers preflight, and preflight is commonly cancelled by browsers when
   * the page is about to unload (which is exactly when we fire this beacon).
   */
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' })
      if (navigator.sendBeacon(url, blob)) return
    }
  } catch {
    /* fall through to fetch */
  }

  try {
    fetch(url, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
    }).catch(() => {})
  } catch {
    /* nothing more we can do — proceed with redirect */
  }
}

/**
 * Handle session expired: audit beacon → clear storage → set flag → dispatch event → redirect.
 */
export function handleSessionExpired(
  redirectTo = '/login',
  context: SessionExpiredContext = {}
): void {
  try {
    sendSessionExpiredBeacon(context)
  } catch {
    /* best-effort logging; never block the redirect */
  }
  clearAuthStorage()
  setSessionExpiredFlag()
  dispatchAuthLogout()
  try {
    window.location.href = redirectTo.includes('?') ? redirectTo : `${redirectTo}?session_expired=1`
  } catch {
    window.location.href = redirectTo
  }
}
