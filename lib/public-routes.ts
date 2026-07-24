/**
 * Client routes that do not require a tenant session. Used by AuthProvider and
 * the API client so unauthenticated visitors are not redirected to /login.
 */

import { MINI_SITE_BASE_PATH } from '@/lib/mini-site-path'
import { isPublicMarketingPath } from '@/lib/seo/route-classification'

const PUBLIC_EXACT = new Set([
  '/',
  '/login',
  '/admin/login',
  '/forgot-password',
  '/reset-password',
  '/features',
  '/pricing',
  '/contact',
  '/demo',
  '/about',
  '/faq',
  '/solutions',
  '/blog',
  '/how-it-works',
  '/privacy-policy',
  '/terms-and-conditions',
  '/refund-policy',
  '/grievance',
])

const PUBLIC_PREFIXES = [
  '/receipt/public/',
  '/public/',
  '/book/',
  `${MINI_SITE_BASE_PATH}/`,
  '/salon/', // legacy; next.config redirects to /business/
]

export function isPublicClientRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  if (isPublicMarketingPath(pathname)) return true
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}
