import { getAdminAuthToken } from '@/lib/admin-auth-storage'
import { csrfHeadersObject } from '@/lib/csrf'

/** Authorization + optional CSRF for admin API fetch calls (credentials: include). */
export function adminRequestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAdminAuthToken()
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...csrfHeadersObject(),
  }
}
