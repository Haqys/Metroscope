import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { MaterialDetail } from '@/components/portal/material-detail';
import { getMaterial, listStudents } from '@/lib/api';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ studentId?: string }>;
}

/**
 * One study module.
 *
 * `force-dynamic`, and no `generateStaticParams`. The fixture pre-rendered
 * every module at build time, which is exactly wrong for a page whose content
 * depends on WHO is asking: entitlement is per student, and a statically
 * generated page would be one family's answer served to every family.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Materi Belajar' };

export default async function MaterialDetailPage({ params, searchParams }: PageProps) {
  const [{ slug }, { studentId }, students] = await Promise.all([
    params,
    searchParams,
    listStudents(),
  ]);

  const current = students.items.find((s) => s.id === studentId) ?? students.items[0];
  if (!current) notFound();

  /**
   * A 404 here means one of three things, no such module, not published, or
   * not entitled, and it must not distinguish them. Telling a family "this
   * module exists but is not yours" is telling them what other families have.
   */
  const material = await getMaterial(slug, current.id).catch(() => null);
  if (!material) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/portal/materials"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Materi Belajar
      </Link>

      {material.topicName && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="bg-navy-light text-navy rounded-full px-3.5 py-1 text-xs font-semibold">
            {material.topicName}
          </span>
        </div>
      )}
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
        {material.title}
      </h1>

      <div className="mt-8">
        <MaterialDetail material={material} studentId={current.id} />
      </div>
    </div>
  );
}
