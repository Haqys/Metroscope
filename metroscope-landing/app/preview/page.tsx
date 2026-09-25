import { BlockRenderer } from '@/components/marketing/block-renderer';
import { getPreviewPage } from '@/lib/pages-api';

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Preview an unpublished page from a signed link (doc 13 §9.5).
 *
 * Outside the `(site)` group on purpose: the reviewer is looking at content,
 * not navigating the site, and the marketing navbar around a draft invites
 * clicking away into published pages that do not match what they are reviewing.
 *
 * `noindex, nofollow` and `force-dynamic`. A preview URL that a crawler could
 * reach and cache would put unpublished copy in a search index, the exact
 * thing every draft policy in this system exists to prevent, and a cached
 * preview would show a version the editor has already changed.
 */
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const page = token ? await getPreviewPage(token) : null;

  if (!page) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-6 text-center">
        <div>
          <h1 className="font-serif text-2xl font-medium text-neutral-900">
            Tautan pratinjau tidak berlaku
          </h1>
          <p className="mt-3 text-neutral-500">
            Tautan pratinjau hanya berlaku satu jam. Minta tautan baru dari editor.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="bg-amber-50 px-6 py-2.5 text-center text-sm text-amber-900">
        Pratinjau <strong>{page.status}</strong>, halaman ini belum tayang.
      </div>
      <BlockRenderer blocks={page.blocks} />
    </main>
  );
}
