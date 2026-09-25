import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { LoginForm } from '@/components/marketing/login-form';
import { STANDALONE } from '@/lib/standalone';

/**
 * `noindex, follow`, and absent from `sitemap.xml` for the same reason.
 *
 * A login form ranks for nothing and competes with `/register` for the queries
 * a parent actually types. `follow` is kept so the footer links out of it
 * normally; this is a page to keep out of an index, not a dead end.
 */
export const metadata: Metadata = {
  title: 'Masuk',
  description: 'Masuk ke portal siswa Metroscope dengan email atau nomor telepon.',
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  /**
   * There is nothing to sign in to yet.
   *
   * The navbar and footer links are already hidden, so this is only reached by
   * a bookmark or a typed URL, and it must not render a form that cannot work:
   * the credentials would be accepted by Supabase and the visitor sent to a
   * portal that is not deployed, which looks like their own mistake. The
   * site's own 404 offers the way back.
   */
  if (STANDALONE) notFound();

  return (
    <div className="container grid min-h-[70vh] items-center gap-14 pt-10 pb-24 lg:grid-cols-2">
      <div>
        <p className="text-maroon text-xs font-medium tracking-[0.35em] uppercase">Portal Siswa</p>
        <h1 className="mt-5 max-w-lg font-serif text-[clamp(2.75rem,6vw,5rem)] leading-[1.02] font-medium tracking-tight text-neutral-900">
          Selamat Datang <span className="text-maroon italic">Kembali.</span>
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed font-light text-neutral-500">
          Pantau jadwal les, progress belajar, lomba, pembayaran, dan pencapaian anak. Semua dalam
          satu portal.
        </p>
      </div>

      <div className="mx-auto w-full max-w-md">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
