import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

import { Providers } from '@/lib/providers';

import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Metroscope CMS Studio', template: '%s · Metroscope CMS' },
  description: 'Kelola konten website klien Metroscope (Impacts, Artikel, Program).',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${jakarta.variable} ${jakarta.className} font-sans`} suppressHydrationWarning>
      <body className={`${jakarta.className} font-sans antialiased bg-[#fbfbfd]`}>
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
