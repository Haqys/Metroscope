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
      { source: '/team/users', destination: '/team', permanent: true },
      { source: '/team/performance', destination: '/team', permanent: true },
      { source: '/leads/follow-up', destination: '/leads', permanent: true },
      { source: '/registrations', destination: '/leads', permanent: true },
      { source: '/registrations/:path*', destination: '/leads/:path*', permanent: true },
      { source: '/students/follow-up', destination: '/leads', permanent: true },
      { source: '/tutors', destination: '/team', permanent: true },
      { source: '/tutors/:path*', destination: '/team/:path*', permanent: true },
      { source: '/performance', destination: '/team', permanent: true },
      { source: '/settings/users', destination: '/team', permanent: true },
      { source: '/settings/users/new', destination: '/team/users/new', permanent: true },
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
