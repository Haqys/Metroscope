import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

/**
 * The marketing site's 404, inside the route group so it renders with the
 * navbar and footer, and, more importantly, so it carries a 404 STATUS.
 *
 * Without a boundary here, `notFound()` thrown from `/articles/[slug]` or
 * `/programs/[slug]` fell through to the root `app/not-found.tsx` and Next
 * served the page with **200 OK**. That is a soft 404: the page reads
 * "Halaman tidak ditemukan" to a human while telling every crawler it is a
 * perfectly good page. Every typo'd article URL then becomes an indexable
 * near-duplicate of every other one, the exact SEO harm the redirect
 * machinery in doc 13 §10.8 exists to avoid, arriving through a different door.
 */
export default function SiteNotFound() {
  return (
    <div className="container flex min-h-[60vh] max-w-lg items-center">
      <EmptyState
        title="Halaman tidak ditemukan"
        description="Tautan mungkin sudah berubah atau dihapus. Coba jelajahi artikel terbaru."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/articles">Lihat artikel</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Kembali ke beranda</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
