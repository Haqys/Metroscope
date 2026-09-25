import type { Metadata } from 'next';
import Link from 'next/link';

import { CompetitionTarget } from '@/components/portal/competition-target';
import { MentorNote } from '@/components/portal/mentor-note';
import { OverallProgress } from '@/components/portal/overall-progress';
import { PageHeader } from '@/components/portal/page-header';
import { TopicProgress } from '@/components/portal/topic-progress';
import { getStudentProgress, listCompetitions, listStudents } from '@/lib/api';
import { LEVEL_LABEL, daysUntil, formatDeadline } from '@/lib/competition-display';

export const metadata: Metadata = { title: 'Progress & Porto' };
export const dynamic = 'force-dynamic';

/**
 * Portal, the family's view of progress (FR-PRG-1/3, doc 14 §3.6).
 *
 * Real as of §3.6. What this page held: five hardcoded topics, a mentor note
 * about a boy called Aditya, `OverallProgress pct={68}`, and four Unsplash
 * photographs of other people's children presented as a certificate gallery.
 * Every family who opened it saw the same numbers about the same invented
 * student. §3.4 wired the competition card and said the rest belonged here.
 *
 * **The certificate gallery is gone rather than faked.** doc 06 gives
 * `competition_targets.certificate_id` a home and §3.4 built the column, but
 * nothing uploads to it yet, the picker is gated by `/site`, which the roster
 * roles do not hold, and §3.4 recorded that. An empty section is honest; four
 * stock photos captioned as this child's achievements are not.
 *
 * `force-dynamic`: what it renders depends on who is asking, and
 * `progress_select` narrows to `app.owns_student()`.
 */
export default async function ProgressPage() {
  const { items: students } = await listStudents();
  const child = students[0] ?? null;

  const [progress, competitions] = await Promise.all([
    child ? getStudentProgress(child.id) : Promise.resolve(null),
    child ? listCompetitions({ studentId: child.id }) : Promise.resolve({ items: [] }),
  ]);

  /** The nearest OPEN deadline this child is entered in (§3.4). */
  const next =
    competitions.items.find((c) => c.myResult === 'PENDING' && c.phase !== 'CLOSED') ?? null;

  /** Only topics a mentor has actually recorded. A blank bar is not a zero. */
  const recorded = (progress?.topics ?? []).filter((t) => t.percent !== null);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Progress & Porto"
        subtitle={
          child
            ? `Perkembangan belajar dan koleksi pencapaian ${child.name}.`
            : 'Perkembangan belajar dan koleksi pencapaian.'
        }
      />

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-12">
        <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)] xl:col-span-7">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
            Progress per Topik
          </h2>
          {progress?.student.programNames ? (
            <p className="mt-0.5 text-sm text-neutral-400">{progress.student.programNames}</p>
          ) : null}

          <div className="mt-6">
            {recorded.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-400">
                Mentor belum mencatat progress per topik. Angkanya akan muncul di sini begitu
                diperbarui.
              </p>
            ) : (
              <TopicProgress
                topics={recorded.map((t) => ({ name: t.topicName, pct: t.percent! }))}
              />
            )}
          </div>

          {/**
           * The mentor's note comes from the latest ASSESSMENT (FR-ASN-4).
           * `progress` has no note column on purpose. One fact, one home.
           */}
          {progress?.mentorNote ? (
            <div className="mt-7">
              <MentorNote
                note={progress.mentorNote.note}
                mentor={progress.mentorNote.author ?? 'Tim Metroscope'}
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-6 xl:col-span-5">
          {progress?.state?.overallPercent !== null && progress?.state ? (
            <OverallProgress
              pct={progress.state.overallPercent!}
              caption={`rata-rata ${recorded.length} topik`}
            />
          ) : (
            <div className="bg-navy-light ring-navy/15 rounded-2xl p-6 text-sm text-neutral-500 ring-1">
              Progress keseluruhan muncul setelah mentor mencatat topik pertama.
            </div>
          )}

          <section>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
              Target Lomba Berikutnya
            </h2>
            <div className="mt-4">
              {next ? (
                <CompetitionTarget
                  name={next.name}
                  date={formatDeadline(next.registrationDeadline)}
                  level={LEVEL_LABEL[next.level]}
                  daysLeft={Math.max(0, daysUntil(next.registrationDeadline))}
                  readinessPct={next.myReadiness ?? 0}
                />
              ) : (
                <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-8 text-center text-sm text-neutral-400">
                  Belum ada lomba yang ditargetkan. Bicarakan dengan mentor lewat halaman Lomba.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900">
          Galeri Sertifikat &amp; Prestasi
        </h2>
        <p className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-10 text-center text-sm text-neutral-400">
          Sertifikat lomba akan tampil di sini setelah tim mengunggahnya. Hasil lomba yang sudah
          tercatat bisa dilihat di{' '}
          <Link href="/portal/competitions" className="text-navy font-medium">
            halaman Lomba
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
