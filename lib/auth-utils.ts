/**
 * Centralized auth utilities for session handling.
 * Used by API interceptor and auth context for consistent logout behavior.
 */

export const AUTH_LOGOUT_EVENT = 'salon-auth-logout'
export const SESSION_EXPIRED_KEY = 'salon-session-expired'

/**
 * Clear all salon auth data from storage.
 * Call this on logout or when session is invalid (401/403).
 */
export function clearAuthStorage(): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem('salon-auth-token')
  localStorage.removeItem('salon-auth-user')

  // Clear session storage for salon auth (preserves admin auth in separate keys)
  sessionStorage.removeItem('salon-auth-token')
  sessionStorage.removeItem('salon-auth-user')
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
 * Handle session expired: clear storage, set flag, dispatch event, redirect.
 */
export function handleSessionExpired(redirectTo = '/login'): void {
  clearAuthStorage()
  setSessionExpiredFlag()
  dispatchAuthLogout()
  try {
    window.location.href = redirectTo.includes('?') ? redirectTo : `${redirectTo}?session_expired=1`
  } catch {
    window.location.href = redirectTo
  }
}
