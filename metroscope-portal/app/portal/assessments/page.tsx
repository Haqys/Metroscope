import type { Metadata } from 'next';

import { AssessmentView } from '@/components/portal/assessment-view';
import { PageHeader } from '@/components/portal/page-header';
import { getStudentAssessments, listStudents } from '@/lib/api';
import { formatPeriod } from '@/lib/assessment-display';

export const metadata: Metadata = { title: 'Hasil Assessment' };
export const dynamic = 'force-dynamic';

/**
 * Portal, the family's view of the latest assessment (FR-ASV-1..5).
 *
 * Real as of §3.5. This page held a hardcoded object, 8.1/10, four criteria,
 * and a note about a child named Aditya, rendered to every family that opened
 * it, whoever their child was. Its own comment said "until the portal is wired
 * to `GET /students/:id/assessments`", which is now the endpoint below.
 *
 * `force-dynamic`, because what it renders depends on who is asking:
 * `assessments_select` narrows to `app.owns_student()`, and a statically
 * generated page would serve one family's report to another.
 */
export default async function AssessmentPage() {
  const { items: students } = await listStudents();
  const child = students[0] ?? null;

  const data = child ? await getStudentAssessments(child.id) : null;
  /**
   * The most recent assessment, not this month's. A family opening the page on
   * the 3rd should read last month's report rather than an empty state that
   * says nothing about a month barely begun.
   */
  const latest = data?.items[0] ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Hasil Assessment Saya"
        subtitle="Assessment terstruktur dari mentor, diperbarui tiap bulan."
        badge={
          latest ? (
            <span className="bg-navy-light text-navy rounded-full px-3.5 py-1 text-xs font-semibold">
              {formatPeriod(latest.period)}
              {latest.assessorName ? ` · ${latest.assessorName}` : ''}
            </span>
          ) : undefined
        }
      />

      <div className="mt-8">
        {latest ? (
          <AssessmentView assessment={latest} />
        ) : (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center text-sm text-neutral-500">
            {child
              ? `Belum ada assessment untuk ${child.name}. Mentor mengisinya tiap akhir bulan, dan kamu akan dikabari lewat email begitu selesai.`
              : 'Belum ada siswa yang terhubung ke akun ini.'}
          </p>
        )}
      </div>

      {data && data.items.length > 1 ? (
        <section className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Riwayat</h2>
          <ul className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white">
            {data.items.slice(1).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-900">
                    {formatPeriod(a.period)}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-400">
                    {a.assessorName ?? 'Tim Metroscope'}
                  </span>
                </span>
                <span className="text-navy shrink-0 text-sm font-semibold">
                  {a.avgScore.toFixed(1)}/10
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
