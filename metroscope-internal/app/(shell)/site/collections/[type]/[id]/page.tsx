import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { SurfaceEditor } from '@/components/internal/surface-editor';
import { TYPE_LABEL } from '@/lib/surface-fields';
import { getSurfaceForEditor } from '@/lib/api';

export const metadata: Metadata = { title: 'Sunting' };
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ type: string; id: string }>;
}

export default async function SurfaceEditorPage({ params }: PageProps) {
  const { type, id } = await params;
  if (!TYPE_LABEL[type]) notFound();

  const row = await getSurfaceForEditor(type, id).catch(() => null);
  if (!row) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/site/collections/${type}`}
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke {TYPE_LABEL[type]}
      </Link>
      <div className="mt-6">
        <SurfaceEditor type={type} row={row} />
      </div>
    </div>
  );
}
