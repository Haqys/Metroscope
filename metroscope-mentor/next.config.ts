import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Off: pages legitimately link to routes that now live in a sibling app
  // (e.g. the portal links to /login on the landing site).
  typedRoutes: false,

  // Placeholder marketing/portrait photography. Replace with Supabase Storage
  // assets once the media library lands (doc 13 §9).
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
  },

  /** Routes renamed by the doc 14 §T tidy, no bookmark breaks (doc 02 §1.4). */
  async redirects() {
    return [
      { source: '/me/students', destination: '/students', permanent: true },
      { source: '/me/materials', destination: '/materials', permanent: true },
      { source: '/progress/update', destination: '/progress', permanent: true },
      { source: '/assessments/new', destination: '/assessments', permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
