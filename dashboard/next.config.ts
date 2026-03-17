import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Hub API proxy to avoid CORS
  async rewrites() {
    return [
      {
        source: '/api/hub/:path*',
        destination: `${process.env.NEXT_PUBLIC_HUB_URL || 'http://localhost:4000'}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
