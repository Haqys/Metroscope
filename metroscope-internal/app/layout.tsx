import type { Metadata } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';

import { Providers } from '@/lib/providers';

import './globals.css';

/* Editorial display serif, fills the --font-edict slot used by `font-serif`. */
const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-edict',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Metroscope Internal', template: '%s · Metroscope' },
  description: 'Dashboard operasional tim Metroscope.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
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
      </body>
    </html>
  );
}
