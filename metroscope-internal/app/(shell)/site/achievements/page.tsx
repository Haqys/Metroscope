import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles, Trophy } from 'lucide-react';

import { PageHeader } from '@/components/portal/page-header';
import { listArticleCategories, listArticles } from '@/lib/api';

export const metadata: Metadata = { title: 'Prestasi Siswa' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Draf', tone: 'bg-neutral-100 text-neutral-600' },
  IN_REVIEW: { label: 'Menunggu Review', tone: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: 'Disetujui', tone: 'bg-sky-50 text-sky-700' },
  SCHEDULED: { label: 'Terjadwal', tone: 'bg-violet-50 text-violet-700' },
  PUBLISHED: { label: 'Terbit', tone: 'bg-emerald-50 text-emerald-700' },
  ARCHIVED: { label: 'Arsip', tone: 'bg-neutral-100 text-neutral-400' },
};

/**
 * `/site/achievements`, the curated collection doc 13 §9.4 names
 * ("Award wall, auto-drafted from `CompetitionTarget` wins").
 *
 * **A filtered view of `articles`, not a collection of its own.** The drafts are
 * ordinary articles in the *Prestasi Siswa* category, so this page is a lens on
 * the list that already exists and every row opens in the article editor that
 * already exists. A dedicated table would have been a second place a win is
 * recorded and a second editorial pipeline to keep in step.
 *
 * It stores no winner, no placing and no deadline: `competition_targets` is the
 * operational source and stays that way. What the article snapshots is editorial
 * copy about a win, which is a different thing from the win.
 */
export default async function AchievementsPage() {
  const categories = await listArticleCategories();
  const prestasi = categories.items.find((c) => c.slug === 'prestasi-siswa');

  const { items } = prestasi
    ? await listArticles({ categoryId: prestasi.id, limit: 100 })
    : { items: [] };

  const autoDrafted = items.filter((a) => a.competitionTargetId);
  const written = items.filter((a) => !a.competitionTargetId);
  const awaitingConsent = autoDrafted.filter((a) => a.studentId && !a.consentSource);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Prestasi Siswa"
        subtitle="Artikel prestasi, sebagian dibuat otomatis dari hasil lomba yang dicatat mentor."
      />

      {awaitingConsent.length > 0 ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
          <strong>{awaitingConsent.length} artikel</strong> menyebut nama siswa dan belum punya
          catatan izin orang tua. Izin dicatat di halaman alur konten, dan wajib sebelum terbit.
        </p>
      ) : null}

      <Section
        title="Dibuat otomatis dari hasil lomba"
        icon={Trophy}
        empty="Belum ada kemenangan yang tercatat. Draf muncul di sini begitu mentor mencatat hasil Juara."
        items={autoDrafted}
      />

      <Section
        title="Ditulis manual"
        icon={Sparkles}
        empty="Belum ada artikel prestasi yang ditulis manual."
        items={written}
      />
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  empty,
  items,
}: {
  title: string;
  icon: typeof Trophy;
  empty: string;
  items: Awaited<ReturnType<typeof listArticles>>['items'];
}) {
  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <Icon className="h-4 w-4 text-neutral-400" aria-hidden />
        {title} <span className="text-neutral-400">({items.length})</span>
      </h2>

      {items.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-neutral-200 px-6 py-8 text-center text-sm text-neutral-400">
          {empty}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {items.map((a) => {
            const status = STATUS_LABEL[a.status] ?? STATUS_LABEL.DRAFT!;
            return (
              <li key={a.id}>
                <Link
                  href={`/site/articles/${a.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-neutral-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-neutral-900">{a.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-400">
                      /{a.slug}
                      {a.authorName ? ` · ${a.authorName}` : ' · penulis belum ditentukan'}
                    </span>
                    {a.studentId && !a.consentSource ? (
                      <span className="text-maroon mt-1 block text-xs font-medium">
                        Belum ada catatan izin orang tua
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
