import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { ContentForm } from '@/components/forms/content-form';
import { PageHeader } from '@/components/portal/page-header';

export const metadata: Metadata = { title: 'Upload Konten Baru' };

/** Internal, editor content submission (wireframe: Input Form 5/6, Editor). */
export default function NewContentPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/content-approval"
        className="hover:text-navy flex w-fit items-center gap-1.5 text-sm text-neutral-400 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Approval Konten
      </Link>

      <PageHeader
        className="mt-4"
        title="Upload Konten Baru"
        subtitle="Konten akan masuk antrian approval Balqis sebelum tayang."
      />

      <div className="mt-10">
        <ContentForm />
      </div>
    </div>
  );
}
