import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';

import { PageHeader } from '@/components/portal/page-header';
import { ImpactsManager } from '@/components/internal/impacts-manager';

export const metadata: Metadata = { title: 'Kelola Dampak & Delegasi' };

export default function SiteImpactsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Dampak & Prestasi (Impacts)"
        subtitle="Kelola cerita delegasi internasional, riset terapan siswa, dan pencapaian podium yang tampil di web klien."
        action={
          <a
            href="https://metroscope-eight.vercel.app/impacts"
            target="_blank"
            rel="noreferrer"
            className="hover:border-neutral-300 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-neutral-700 shadow-sm transition-colors"
          >
            <span>Pratinjau Situs Klien</span>
            <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
          </a>
        }
      />

      <div className="mt-6">
        <ImpactsManager />
      </div>
    </div>
  );
}
