import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow importing from @alumni/shared (local workspace package)
  transpilePackages: ['@alumni/shared'],

  // Image domains for R2 / Cloudflare CDN
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      }
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // unsafe-eval needed for Next.js dev
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://cdn.yourdomain.com",
              "font-src 'self'",
              process.env.NODE_ENV === 'development'
                ? "connect-src 'self' http://localhost:3001 ws://localhost:3001 wss: https:"
                : "connect-src 'self' wss: https:",
            ].join('; '),
          },
        ],
      },
    ];
  },

  // Redirect www → non-www (optional, configure as needed)
  async redirects() {
    return [];
  },
};

export default nextConfig;
