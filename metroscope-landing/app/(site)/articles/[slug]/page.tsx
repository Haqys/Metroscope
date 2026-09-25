import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';

import { ArticleBody, tableOfContents } from '@/components/marketing/article-body';
import { ArticleCard, articleDate } from '@/components/marketing/article-card';
import { ShareRow } from '@/components/marketing/article-share';
import { JsonLd } from '@/components/marketing/json-ld';
import { Reveal } from '@/components/marketing/scroll-fx';
import { getArticle, resolveRedirect, type PublicArticle } from '@/lib/articles-api';
import { PUBLISHER, SITE, breadcrumbList, clamp, social } from '@/lib/seo';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Rendered per request, but the DATA is still tag-cached, so this does not
 * cost an API round trip per reader.
 *
 * Without it, Next caches the whole rendered route, including a `notFound()`
 * outcome. Once a miss is cached, the 301 below never runs again: an article
 * renamed after somebody hit the old URL keeps serving "Halaman tidak
 * ditemukan" forever, while `redirects` holds a perfectly good 301 nobody
 * consults. Observed exactly that, the redirect resolved correctly by hand and
 * the page never even called the lookup.
 *
 * So the page decides 200-vs-301-vs-404 fresh every time, and
 * `lib/articles-api.ts` keeps the expensive part, the article itself, in the
 * fetch cache, purged by tag on publish. ISR's purpose is preserved; only the
 * routing decision is taken out of the cache, and that decision is the one that
 * must never be stale.
 */
export const dynamic = 'force-dynamic';

/**
 * Auto-derived, manually overridable (doc 13 §10.7).
 *
 * `seo_meta` wins where an editor filled it in and the article's own fields
 * fill the rest, so a piece nobody opened the SEO panel for still ships a
 * correct title, description, canonical and card image. The alternative,
 * requiring the panel, produces articles with no description at all, which is
 * how a search engine ends up inventing the snippet.
 */
function seoFor(article: PublicArticle) {
  const url = article.seoCanonical ?? `${SITE}/articles/${article.slug}`;
  const title = clamp(article.seoTitle ?? article.title, 60);
  const description = clamp(article.seoDescription ?? article.excerpt ?? article.title, 155);
  const image = article.seoOgImageUrl ?? article.coverUrl;
  return { url, title, description, image };
}

/**
 * Resolve the slug once, and decide 200 / 301 / 404 here.
 *
 * `generateMetadata` runs BEFORE the page renders, and by the time the page
 * body runs the response status is already committed, so `redirect()` and
 * `notFound()` called from the body rendered the right UI with a **200**. A
 * renamed article served "Halaman tidak ditemukan" at its old URL while
 * `redirects` held a perfectly good 301, and every mistyped URL became an
 * indexable page. Both were verified: the lookup returned
 * `{toPath, statusCode: 301}` and the response was still 200 with no Location.
 *
 * Deciding here is what makes the status real. The page body then repeats the
 * lookup, `getArticle` is deduped inside one request, so it costs nothing,
 * and its own guard is only a type narrowing that can never be reached.
 */
async function resolveOrLeave(slug: string) {
  const article = await getArticle(slug);
  if (article) return article;

  const hit = await resolveRedirect(`/articles/${slug}`);
  if (hit) {
    if (hit.statusCode === 301 || hit.statusCode === 308) permanentRedirect(hit.toPath);
    redirect(hit.toPath);
  }
  notFound();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await resolveOrLeave(slug);

  const { url, title, description, image } = seoFor(article);
  const s = social({ title, description, url, image, imageAlt: article.coverAlt });

  return {
    title,
    description,
    alternates: { canonical: url },
    /**
     * `noindex` is an editor decision the page must honour. It is how a
     * seasonal or duplicate piece stays reachable by link without competing
     * with the article it duplicates. §2.8 makes it bite twice: a `noindex`
     * article is also left out of `sitemap.xml`.
     */
    robots: article.seoNoindex ? { index: false, follow: true } : undefined,
    openGraph: {
      ...s.openGraph,
      type: 'article',
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.updatedAt,
      authors: article.authorName ? [article.authorName] : undefined,
      section: article.categoryName ?? undefined,
      tags: article.tags.map((t) => t.name),
    },
    twitter: s.twitter,
  };
}

/**
 * `Article` + `BreadcrumbList` JSON-LD (doc 13 §10.7).
 *
 * `seo_meta.json_ld` replaces the generated `Article` node entirely when an
 * editor has written one, a merge would produce a document that is neither
 * what was generated nor what was written, and invalid structured data is worse
 * than none. The breadcrumb trail is not part of that override: it describes
 * where the page sits in the site, which is not an editorial opinion.
 */
function articleJsonLd(article: PublicArticle) {
  const { url, title, description, image } = seoFor(article);

  return (
    article.seoJsonLd ?? {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description,
      image: image ? [image] : undefined,
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      author: article.authorName ? { '@type': 'Person', name: article.authorName } : PUBLISHER,
      publisher: PUBLISHER,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      articleSection: article.categoryName ?? undefined,
      keywords: article.tags.map((t) => t.name).join(', ') || undefined,
      inLanguage: article.locale,
      timeRequired: `PT${article.readingMin}M`,
    }
  );
}

function articleTrail(article: PublicArticle) {
  return breadcrumbList([
    { name: 'Beranda', path: '/' },
    { name: 'Artikel', path: '/articles' },
    ...(article.categorySlug && article.categoryName
      ? [{ name: article.categoryName, path: `/articles/kategori/${article.categorySlug}` }]
      : []),
    { name: article.title, path: `/articles/${article.slug}` },
  ]);
}

/**
 * One article (doc 13 §10.6): breadcrumbs, cover, TOC, body, author box,
 * share, related posts and a CTA.
 */
export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;

  /**
   * A miss is not automatically a 404, the slug may have been renamed.
   *
   * `redirects` is written inside the publishing transaction whenever a live
   * slug changes (doc 13 §10.8), so this is where that pays off: a reader
   * arriving from a search result on the old URL lands on the article instead
   * of a dead end, and the 301 tells the crawler to move the ranking across.
   *
   * `resolveOrLeave` already ran in `generateMetadata` and left via redirect or
   * notFound if this slug is not a live article, so reaching this line means
   * there is one. The call repeats only to get the value; the fetch is deduped.
   */
  const article = await resolveOrLeave(slug);

  const toc = tableOfContents(article.body);

  return (
    <>
      <JsonLd docs={[articleJsonLd(article), articleTrail(article)]} />

      <article className="container pt-10 pb-24 lg:pt-14">
        <nav aria-label="Remah roti" className="text-sm text-neutral-400">
          <Link href="/articles" className="hover:text-navy inline-flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Semua artikel
          </Link>
          {article.categorySlug && article.categoryName && (
            <>
              <span className="mx-2">/</span>
              <Link href={`/articles/kategori/${article.categorySlug}`} className="hover:text-navy">
                {article.categoryName}
              </Link>
            </>
          )}
        </nav>

        <header className="mx-auto mt-8 max-w-3xl">
          {article.categoryName && (
            <p className="text-maroon text-xs font-semibold tracking-[0.2em] uppercase">
              {article.categoryName}
            </p>
          )}
          <h1 className="mt-3 font-serif text-4xl leading-[1.15] font-medium tracking-tight text-neutral-900 sm:text-5xl">
            {article.title}
          </h1>
          {article.subtitle && (
            <p className="mt-4 text-xl leading-relaxed font-light text-neutral-500">
              {article.subtitle}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-500">
            {article.authorName && <span className="font-medium">{article.authorName}</span>}
            {article.publishedAt && (
              <time dateTime={article.publishedAt}>{articleDate(article.publishedAt)}</time>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {article.readingMin} menit baca
            </span>
          </div>
        </header>

        {article.coverUrl && (
          <Reveal>
            <div className="relative mx-auto mt-10 aspect-[16/9] max-w-4xl overflow-hidden rounded-3xl bg-neutral-100">
              <Image
                src={article.coverUrl}
                alt={article.coverAlt ?? ''}
                fill
                sizes="(min-width: 1024px) 56rem, 100vw"
                className="object-cover"
                priority
              />
            </div>
          </Reveal>
        )}

        <div className="mx-auto mt-14 grid max-w-5xl gap-12 lg:grid-cols-[1fr_15rem]">
          <div className="max-w-3xl min-w-0">
            <ArticleBody doc={article.body} />

            {article.tags.length > 0 && (
              <div className="mt-12 flex flex-wrap gap-2 border-t border-neutral-200 pt-8">
                {article.tags.map((t) => (
                  <Link
                    key={t.slug}
                    href={`/articles/tag/${t.slug}`}
                    className="hover:border-navy/40 hover:text-navy rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-500 transition-colors"
                  >
                    #{t.name}
                  </Link>
                ))}
              </div>
            )}

            <ShareRow title={article.title} url={`${SITE}/articles/${article.slug}`} />

            {article.authorName && (
              <aside className="mt-10 rounded-3xl bg-neutral-50 p-6">
                <p className="text-xs tracking-[0.2em] text-neutral-400 uppercase">Penulis</p>
                <p className="mt-2 font-serif text-xl text-neutral-900">{article.authorName}</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Tim editorial Metroscope, mendampingi siswa menuju kompetisi sejak hari pertama.
                </p>
              </aside>
            )}
          </div>

          {/*
            The TOC only appears when there is something to navigate. Two
            headings is a list that costs a column and saves nobody a scroll.
          */}
          {toc.length >= 3 && (
            <aside className="hidden lg:block">
              <nav aria-label="Daftar isi" className="sticky top-28">
                <p className="text-xs tracking-[0.2em] text-neutral-400 uppercase">Daftar isi</p>
                <ul className="mt-4 space-y-2.5 border-l border-neutral-200 pl-4">
                  {toc.map((h) => (
                    <li key={h.id}>
                      <a
                        href={`#${h.id}`}
                        className="hover:text-navy text-sm leading-snug text-neutral-500 transition-colors"
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
          )}
        </div>

        {article.related.length > 0 && (
          <section className="mx-auto mt-24 max-w-5xl border-t border-neutral-200 pt-14">
            <h2 className="font-serif text-2xl font-medium tracking-tight text-neutral-900">
              Bacaan lain
            </h2>
            <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {article.related.map((r) => (
                <ArticleCard key={r.id} article={r} />
              ))}
            </div>
          </section>
        )}

        <section className="from-navy to-maroon mx-auto mt-24 max-w-5xl rounded-3xl bg-gradient-to-br px-8 py-14 text-center text-white">
          <h2 className="font-serif text-3xl font-medium tracking-tight">
            Ingin anak Anda punya cerita seperti ini?
          </h2>
          <p className="mx-auto mt-3 max-w-xl font-light text-white/80">
            Mulai dari konsultasi gratis. Kami petakan minat, level, dan lomba yang paling masuk
            akal untuk anak Anda.
          </p>
          <Link
            href="/register"
            className="text-navy mt-8 inline-flex rounded-full bg-white px-7 py-3.5 text-sm font-semibold transition-opacity hover:opacity-90"
          >
            Konsultasi Gratis
          </Link>
        </section>
      </article>
    </>
  );
}
