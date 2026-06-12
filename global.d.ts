declare module "*.css"

interface Window {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}
