import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

import { PreviewBadge } from '@/components/marketing/preview-badge';
import { Providers } from '@/lib/providers';
import { SITE } from '@/lib/seo';
import { STANDALONE } from '@/lib/standalone';

import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  /**
   * Resolves every relative URL Next puts in `<head>`, `og:image`, canonicals,
   * the `<link>` to `/sitemap.xml`. Without it Next warns at build time and
   * emits relative Open Graph image URLs, which no scraper follows: the card
   * silently loses its image on every share.
   */
  metadataBase: new URL(SITE),
  title: { default: 'Metroscope. Bimbingan Olimpiade & Kompetisi', template: '%s · Metroscope' },
  description: 'Bimbingan belajar persiapan olimpiade dan kompetisi untuk siswa SD, SMP, dan SMA.',
  /**
   * `noindex` on every page while this is a standalone review copy, paired
   * with the blanket `Disallow` in `app/robots.ts`. The content is sample
   * content; see `lib/mock/content.ts` for what would be indexed otherwise.
   */
  robots: STANDALONE ? { index: false, follow: false } : { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${jakarta.variable}`} suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow"
        >
          Lewati ke konten utama
        </a>
        <div id="main">
          <Providers>{children}</Providers>
        </div>
        {STANDALONE && <PreviewBadge />}
      </body>
    </html>
  );
}
