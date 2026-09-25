import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { PageEditor } from '@/components/internal/page-editor';
import { getPageForEditor } from '@/lib/api';

export const metadata: Metadata = { title: 'Sunting Halaman' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PageEditorPage({ params }: PageProps) {
  const { id } = await params;
  const page = await getPageForEditor(id).catch(() => null);
  if (!page) notFound();

  /**
   * The marketing origin, derived from `LOGIN_URL` rather than a second env
   * var. It is server-only, so the preview link is assembled with a value the
   * browser never has to be told, and there is no `NEXT_PUBLIC_` twin to drift
   * out of step with the one the login redirect already uses.
   */
  const siteUrl = (process.env.LOGIN_URL ?? 'http://localhost:3004/login').replace(/\/login$/, '');

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/site/pages"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Halaman
      </Link>
      <div className="mt-2">
        <h1 className="font-serif text-2xl font-medium text-neutral-900">{page.title}</h1>
        <p className="text-sm text-neutral-400">/{page.slug}</p>
      </div>
      <div className="mt-6">
        <PageEditor page={page} siteUrl={siteUrl} />
      </div>
    </div>
  );
}
