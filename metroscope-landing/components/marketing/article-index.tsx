import Link from 'next/link';

import { ArticleCard } from '@/components/marketing/article-card';
import { EmptyArticles } from '@/components/marketing/article-empty';
import type { ArticleListPage, Taxonomy } from '@/lib/articles-api';

/**
 * Shared chrome for every article listing, the index, category hubs and tag
 * hubs (doc 13 §10.6).
 *
 * One component because the three pages differ only in what is already
 * filtered and what the heading says. Three near-identical listings is how the
 * tag hub quietly loses pagination six months after the index gains it.
 */

/**
 * Search is a plain GET form, no JavaScript.
 *
 * A search that puts its term in the URL is linkable, back-button-correct and
 * indexable, and it works before hydration, which on a marketing page reached
 * from a search result is a real fraction of visits. A controlled input with a
 * debounce would be more code for a worse result here.
 */
function SearchForm({ action, q }: { action: string; q?: string }) {
  return (
    <form action={action} method="get" className="relative w-full max-w-sm">
      <label htmlFor="q" className="sr-only">
        Cari artikel
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={q ?? ''}
        placeholder="Cari artikel…"
        className="focus:border-navy focus:ring-navy/20 w-full rounded-full border border-neutral-300 py-2.5 pr-4 pl-5 text-sm"
      />
    </form>
  );
}

function TaxonomyNav({ taxonomy, active }: { taxonomy: Taxonomy; active?: string }) {
  return (
    <nav aria-label="Kategori artikel" className="mt-8 flex flex-wrap gap-2">
      <Link
        href="/articles"
        aria-current={active === undefined ? 'page' : undefined}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          active === undefined
            ? 'bg-navy text-white'
            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
        }`}
      >
        Semua
      </Link>
      {taxonomy.categories.map((c) => (
        <Link
          key={c.slug}
          href={`/articles/kategori/${c.slug}`}
          aria-current={active === c.slug ? 'page' : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            active === c.slug
              ? 'bg-navy text-white'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          {c.name}
          <span className="ml-1.5 text-xs opacity-60">{c.articleCount}</span>
        </Link>
      ))}
    </nav>
  );
}

/**
 * Pagination as links, not buttons.
 *
 * Page 2 of a category hub is a distinct, crawlable URL, the whole point of an
 * indexable hub, and `rel="prev"/"next"` tells a crawler the pages are one
 * sequence rather than near-duplicates competing with each other.
 */
function Pager({ base, page, pageCount }: { base: string; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (n: number) => {
    const [path, qs] = base.split('?');
    const params = new URLSearchParams(qs);
    if (n <= 1) params.delete('page');
    else params.set('page', String(n));
    return params.size ? `${path}?${params}` : path!;
  };

  return (
    <nav aria-label="Halaman" className="mt-16 flex items-center justify-center gap-2">
      {page > 1 && (
        <Link
          href={href(page - 1)}
          rel="prev"
          className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400"
        >
          Sebelumnya
        </Link>
      )}
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
        <Link
          key={n}
          href={href(n)}
          aria-current={n === page ? 'page' : undefined}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            n === page ? 'bg-navy text-white' : 'text-neutral-600 hover:bg-neutral-100'
          }`}
        >
          {n}
        </Link>
      ))}
      {page < pageCount && (
        <Link
          href={href(page + 1)}
          rel="next"
          className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400"
        >
          Berikutnya
        </Link>
      )}
    </nav>
  );
}

export function ArticleIndex({
  title,
  description,
  results,
  taxonomy,
  basePath,
  activeCategory,
  q,
  /** Rendered large above the grid, index only, and never while filtering. */
  featured,
}: {
  title: string;
  description?: string | null;
  results: ArticleListPage;
  taxonomy: Taxonomy;
  basePath: string;
  activeCategory?: string;
  q?: string;
  featured?: ArticleListPage['items'][number] | null;
}) {
  const searchBase = basePath.split('?')[0]!;

  return (
    <div className="container pt-14 pb-28 lg:pt-20">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-4xl leading-tight font-medium tracking-tight text-neutral-900 sm:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-lg font-light text-neutral-500">{description}</p>
          )}
        </div>
        <SearchForm action={searchBase} q={q} />
      </header>

      <TaxonomyNav taxonomy={taxonomy} active={activeCategory} />

      {taxonomy.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs tracking-wider text-neutral-400 uppercase">Topik</span>
          {taxonomy.tags.slice(0, 12).map((t) => (
            <Link
              key={t.slug}
              href={`/articles/tag/${t.slug}`}
              className="hover:border-navy/40 hover:text-navy rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500 transition-colors"
            >
              #{t.name}
            </Link>
          ))}
        </div>
      )}

      {q && (
        <p className="mt-8 text-sm text-neutral-500">
          {results.total} hasil untuk <strong className="text-neutral-800">“{q}”</strong> ·{' '}
          <Link href={searchBase} className="text-navy underline underline-offset-2">
            hapus pencarian
          </Link>
        </p>
      )}

      {results.items.length === 0 ? (
        <EmptyArticles q={q} />
      ) : (
        <>
          {featured && (
            <div className="mt-12">
              <ArticleCard article={featured} featured />
            </div>
          )}

          <div className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {results.items.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>

          <Pager base={basePath} page={results.page} pageCount={results.pageCount} />
        </>
      )}
    </div>
  );
}
