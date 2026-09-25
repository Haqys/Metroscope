import Link from 'next/link';

/**
 * The empty state carries the difference between "nothing matched your search"
 * and "we have not published here yet".
 *
 * A single "Belum ada artikel" for both reads as a broken site to somebody who
 * just searched, and the fix, clear the search, is the one thing they cannot
 * guess.
 */
export function EmptyArticles({ q }: { q?: string }) {
  return (
    <div className="mt-16 rounded-3xl border border-dashed border-neutral-300 px-8 py-20 text-center">
      <p className="font-serif text-2xl font-medium text-neutral-800">
        {q ? 'Tidak ada artikel yang cocok' : 'Belum ada artikel di sini'}
      </p>
      <p className="mx-auto mt-3 max-w-md text-neutral-500">
        {q
          ? 'Coba kata kunci lain, atau jelajahi semua artikel.'
          : 'Cerita siswa dan panduan lomba akan terbit di halaman ini.'}
      </p>
      <Link
        href="/articles"
        className="bg-navy mt-8 inline-flex rounded-full px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Lihat semua artikel
      </Link>
    </div>
  );
}
