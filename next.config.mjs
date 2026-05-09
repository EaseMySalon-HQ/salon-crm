/** @type {import('next').NextConfig} */
const backendProxy =
  typeof process.env.API_PROXY_TARGET === 'string'
    ? process.env.API_PROXY_TARGET.replace(/\/$/, '')
    : ''

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  /**
   * Same-origin `/api` so tenant HttpOnly cookies attach to the app host (fixes iPad/WebKit
   * when frontend and API are different *.railway.app hosts). Set API_PROXY_TARGET to the
   * backend origin **without** `/api` (e.g. https://your-api.up.railway.app) and
   * NEXT_PUBLIC_API_URL=/api on the frontend service.
   */
  async rewrites() {
    if (!backendProxy) return []
    return [
      {
        source: '/api/:path*',
        destination: `${backendProxy}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
