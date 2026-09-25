import type { Metadata } from 'next';

import { PageHeader } from '@/components/portal/page-header';
import { TaxonomyManager } from '@/components/internal/taxonomy-manager';
import { getSession } from '@/lib/session';
import { listArticleCategories, listArticleTags } from '@/lib/api';

export const metadata: Metadata = { title: 'Kategori & Tag' };
export const dynamic = 'force-dynamic';

/**
 * Kategori & Tag (doc 13 §10.3).
 *
 * Two halves of one taxonomy with deliberately different rules. A category is
 * navigation. One per article, changing the set reshapes the site's menu, so
 * it takes `content.review`. A tag is a cluster, many per article, invented
 * while writing, so any author may make one.
 *
 * The UI states that difference rather than hiding it: an author sees the
 * category list read-only and is told who can change it.
 */
export default async function TaxonomyPage() {
  const session = await getSession();
  const [categories, tags] = await Promise.all([listArticleCategories(), listArticleTags()]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Kategori & Tag"
        subtitle="Kategori menata navigasi situs. Tag mengelompokkan artikel lintas kategori."
      />
      <div className="mt-6">
        <TaxonomyManager
          categories={categories.items}
          tags={tags.items}
          canManageCategories={session?.actions.includes('content.review') ?? false}
        />
      </div>
    </div>
  );
}
