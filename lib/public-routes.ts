/**
 * Client routes that do not require a tenant session. Used by AuthProvider and
 * the API client so unauthenticated visitors are not redirected to /login.
 */

const PUBLIC_EXACT = new Set([
  '/',
  '/login',
  '/admin/login',
  '/forgot-password',
  '/reset-password',
  '/features',
  '/pricing',
  '/contact',
  '/about',
  '/faq',
  '/solutions',
  '/blog',
  '/privacy-policy',
  '/terms-and-conditions',
  '/refund-policy',
  '/grievance',
])

const PUBLIC_PREFIXES = ['/receipt/public/', '/public/']

export function isPublicClientRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}
