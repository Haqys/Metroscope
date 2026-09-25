import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ProgramEditor } from '@/components/internal/program-editor';
import { getProgramForEditor } from '@/lib/api';

export const metadata: Metadata = { title: 'Sunting Program' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** The programme editor, and its preview, through the same RLS policy. */
export default async function ProgramEditorPage({ params }: PageProps) {
  const { id } = await params;
  const program = await getProgramForEditor(id).catch(() => null);
  if (!program) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/site/programs"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Program
      </Link>
      <div className="mt-6">
        <ProgramEditor program={program} />
      </div>
    </div>
  );
}
