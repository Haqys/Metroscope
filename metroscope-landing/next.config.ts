import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Off: pages legitimately link to routes that now live in a sibling app
  // (e.g. the portal links to /login on the landing site).
  typedRoutes: false,

  images: {
    remotePatterns: [
      // Placeholder marketing/portrait photography, still used by the home page
      // and programme fixtures. Retired for programmes in §2.5.
      { protocol: 'https', hostname: 'images.unsplash.com' },
      /**
       * Article covers, served from the media library's public bucket (§2.2).
       *
       * Derived from NEXT_PUBLIC_SUPABASE_URL rather than hardcoded, because a
       * project moved between environments would otherwise render every cover
       * as a broken image with no error anywhere, next/image simply refuses an
       * unlisted host, and the page around it looks perfectly healthy.
       */
      {
        protocol: 'https',
        hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://localhost').hostname,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  /**
   * `/porto/*` is retired to `/articles/*`, doc 02 §1.4.
   *
   * Static because the mapping is one-to-one and known at build time: the porto
   * fixture's slugs are gone, so these send an old bookmark to the index rather
   * than to an article that no longer exists under that name. Renames of live
   * articles are a different mechanism, rows in `redirects`, resolved by the
   * article page itself (doc 13 §10.8).
   */
  async redirects() {
    return [
      { source: '/porto', destination: '/articles', permanent: true },
      { source: '/porto/:slug', destination: '/articles', permanent: true },
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
