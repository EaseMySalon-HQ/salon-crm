/**
 * Resolve API base for fetch() in server and browser.
 * Browser can use same-origin `/api`; Node SSR needs an absolute URL.
 */
export function resolveApiBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/$/, '')
  if (/^https?:\/\//i.test(configured)) return configured

  if (typeof window !== 'undefined') return configured

  const proxy = process.env.API_PROXY_TARGET?.replace(/\/$/, '')
  if (proxy) return `${proxy}/api`

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    process.env.FRONTEND_URL?.replace(/\/$/, '')
  if (origin) return `${origin}${configured.startsWith('/') ? configured : `/${configured}`}`

  return configured
}
