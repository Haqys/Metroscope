import Image from 'next/image';
import Link from 'next/link';

import type { ArticleCard as Article } from '@/lib/articles-api';

const DATE = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Makassar',
});

/**
 * Timestamps are stored UTC and rendered WITA (CLAUDE.md).
 *
 * Formatted on the server inside a cached page, so the output is identical for
 * every reader and there is no hydration mismatch from the browser's own
 * locale, which is what happens when a date is formatted in a client
 * component and the visitor is not in Indonesia.
 */
export function articleDate(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '';
}

/** Editorial article card, used by the index, the hubs and related posts. */
export function ArticleCard({
  article,
  featured = false,
}: {
  article: Article;
  featured?: boolean;
}) {
  return (
    <article className="group h-full">
      <Link href={`/articles/${article.slug}`} className="flex h-full flex-col">
        <div
          className={`relative overflow-hidden rounded-3xl bg-neutral-100 ${
            featured ? 'aspect-[16/9]' : 'aspect-[4/3]'
          }`}
        >
          {article.coverUrl ? (
            <Image
              src={article.coverUrl}
              alt={article.coverAlt ?? ''}
              fill
              sizes={
                featured ? '(min-width: 1024px) 66vw, 100vw' : '(min-width: 1024px) 33vw, 100vw'
              }
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="from-navy/10 to-maroon/10 absolute inset-0 bg-gradient-to-br" />
          )}
          {article.categoryName && (
            <span className="text-maroon absolute top-5 left-5 rounded-full bg-white/90 px-4 py-1.5 text-xs font-semibold tracking-wider uppercase backdrop-blur-sm">
              {article.categoryName}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col px-1 pt-5">
          <p className="text-xs font-medium tracking-[0.2em] text-neutral-400 uppercase">
            {[article.authorName, articleDate(article.publishedAt)].filter(Boolean).join(' · ')}
          </p>
          <h3
            className={`group-hover:text-maroon mt-2 font-serif leading-snug font-medium tracking-tight text-neutral-900 transition-colors ${
              featured ? 'text-3xl sm:text-4xl' : 'text-2xl'
            }`}
          >
            {article.title}
          </h3>
          {article.excerpt && (
            <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed font-light text-neutral-500">
              {article.excerpt}
            </p>
          )}
          <span className="text-navy mt-auto pt-4 text-sm font-medium underline-offset-4 group-hover:underline">
            Baca cerita, {article.readingMin} menit
          </span>
        </div>
      </Link>
    </article>
  );
}
