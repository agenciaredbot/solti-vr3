import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Hub API proxy to avoid CORS
  async rewrites() {
    const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || 'http://localhost:4000'
    return [
      {
        source: '/api/hub-health',
        destination: `${hubUrl}/health`,
      },
      {
        source: '/api/hub/:path*',
        destination: `${hubUrl}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
