import type { Metadata } from 'next';
import { notFound, permanentRedirect, redirect } from 'next/navigation';

import { BlockRenderer } from '@/components/marketing/block-renderer';
import { JsonLd } from '@/components/marketing/json-ld';
import { resolveRedirect } from '@/lib/articles-api';
import { getPublicPage, type PublicPage } from '@/lib/pages-api';
import { SITE, breadcrumbList, clamp, social } from '@/lib/seo';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Rendered per request; the DATA stays tag-cached.
 *
 * Same reason as `/articles/[slug]` and `/programs/[slug]` (§2.4): Next caches
 * a whole rendered route including a `notFound()` outcome, so a cached miss
 * would shadow the 301 forever after a rename.
 */
export const dynamic = 'force-dynamic';

function seoFor(page: PublicPage) {
  const url = page.seoCanonical ?? `${SITE}/${page.slug}`;
  return {
    url,
    title: clamp(page.seoTitle ?? page.title, 60),
    description: clamp(page.seoDescription ?? page.description ?? page.title, 155),
    image: page.seoOgImageUrl,
  };
}

/** Decide 200 / 301 / 404 in `generateMetadata`, before the response commits. */
async function resolveOrLeave(slug: string) {
  const page = await getPublicPage(slug);
  if (page) return page;

  const hit = await resolveRedirect(`/${slug}`);
  if (hit) {
    if (hit.statusCode === 301 || hit.statusCode === 308) permanentRedirect(hit.toPath);
    redirect(hit.toPath);
  }
  notFound();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await resolveOrLeave(slug);
  const { url, title, description, image } = seoFor(page);
  const s = social({ title, description, url, image });

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: page.seoNoindex ? { index: false, follow: true } : undefined,
    openGraph: { ...s.openGraph, type: 'website' },
    twitter: s.twitter,
  };
}

/**
 * A CMS page, composed of blocks (doc 13 §9.3).
 *
 * This is the catch-all, so it only ever runs for a path no real route claimed,
 * Next matches static segments first. A page slugged `programs` therefore
 * cannot shadow `/programs`; it simply never renders, which is the safe
 * direction for a slug an editor can type.
 */
export default async function CmsPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await resolveOrLeave(slug);

  return (
    <>
      <JsonLd
        docs={[
          breadcrumbList([
            { name: 'Beranda', path: '/' },
            { name: page.title, path: `/${page.slug}` },
          ]),
        ]}
      />
      <BlockRenderer blocks={page.blocks} />
    </>
  );
}
