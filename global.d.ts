declare module "*.css"

interface Window {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
  fbq?: (...args: unknown[]) => void
  _fbq?: unknown
}
