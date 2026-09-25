'use client';

import { type ReactNode } from 'react';
import {
  BookOpenCheck,
  CalendarCheck,
  Flame,
  Medal,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

import { BadgeCard, type BadgeItem } from './badge-card';
import { CountUp } from './count-up';
import { LeaderboardTable, type LeaderboardRow } from './leaderboard-table';
import { Podium, type PodiumEntry } from './podium';
import { cn } from '@/lib/utils';
import type { Achievements } from '@/lib/api';

/**
 * Pencapaian & Peringkat, from the database.
 *
 * What this component held until now: a `ME` const called "Aditya Pratama"
 * ranked 2 of 24, a podium of "Bagas N." and "Nabila P.", a five-row
 * leaderboard of invented classmates, a weekly challenge nobody could
 * complete, and a streak counter hardcoded to ten. Every family saw the same
 * screen, about the same child, none of whom existed.
 *
 * Three of those are simply gone rather than reconnected, because there is
 * nothing behind them:
 *
 *   · **the period tabs** (Mingguan / Bulanan / Sepanjang Waktu) switched
 *     nothing, `students.points` is a single running total with no history to
 *     slice, so three tabs over one number is three ways to read the same row;
 *   · **the weekly challenge** had no table, no rule and no writer;
 *   · **the attendance streak** needs `session_attendance` over consecutive
 *     scheduled lessons, and this school has no sessions recorded yet.
 *
 * Badges stay, because those ARE derived from real rows (competition entries,
 * results, attendance, assessments) by the API rather than stored.
 */

/** The five codes `getAchievements()` returns, given a face and a sentence. */
const BADGE_PRESENTATION: Record<string, { icon: LucideIcon; description: string }> = {
  FIRST_COMPETITION: { icon: CalendarCheck, description: 'Terdaftar di satu lomba' },
  WINNER: { icon: Trophy, description: 'Menang kompetisi resmi' },
  REGULAR: { icon: Flame, description: 'Hadir minimal lima kali les' },
  ASSESSED: { icon: BookOpenCheck, description: 'Sudah dinilai mentor' },
  VETERAN: { icon: Medal, description: 'Ikut tiga lomba atau lebih' },
};

const LEVEL_LABEL: Record<string, string> = { SD: 'SD', SMP: 'SMP', SMA: 'SMA' };

interface StatTile {
  label: string;
  value: ReactNode;
  caption: string;
  icon: LucideIcon;
  tint: string;
}

export function AchievementsView({ data }: { data: Achievements }) {
  const { student, rank, total, leaderboard, badges, counts } = data;

  /**
   * A staff account, or a family whose child is not on the roll yet. Not an
   * error: the portal admits anyone signed in (app/portal/layout.tsx), so a
   * mentor opening this page is expected and gets an explanation, not a crash
   * and not somebody else's leaderboard.
   */
  if (!student) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
        <p className="text-sm font-semibold text-neutral-900">Belum ada data pencapaian</p>
        <p className="mt-1 text-sm text-neutral-500">
          Halaman ini menampilkan poin, peringkat, dan badge seorang siswa. Akun ini belum terkait
          dengan data siswa mana pun.
        </p>
      </div>
    );
  }

  const badgeItems: BadgeItem[] = badges.map((b) => ({
    name: b.label,
    description: BADGE_PRESENTATION[b.code]?.description ?? '',
    icon: BADGE_PRESENTATION[b.code]?.icon ?? Medal,
    earned: b.earned,
  }));
  const earned = badgeItems.filter((b) => b.earned).length;

  const rows: LeaderboardRow[] = leaderboard.map((e) => ({
    rank: e.rank,
    name: e.name,
    level: LEVEL_LABEL[student.level ?? ''] ?? 'Semua jenjang',
    points: e.points,
    isYou: e.isYou,
  }));

  /**
   * Poin belum berjalan.
   *
   * `students.points` is documented as the sum of a point ledger, and that
   * ledger is a later phase, so today every row is zero and every student
   * ties for first. Saying so is the honest render: a "#1 dari 15" badge over
   * a cohort where nobody has scored would be the fixture bug again, just
   * sourced from the database this time.
   */
  const pointsStarted = leaderboard.some((e) => e.points > 0);

  const podium: [PodiumEntry, PodiumEntry, PodiumEntry] | null =
    pointsStarted && leaderboard.length >= 3
      ? [
          { name: leaderboard[0].name, points: leaderboard[0].points, isYou: leaderboard[0].isYou },
          { name: leaderboard[1].name, points: leaderboard[1].points, isYou: leaderboard[1].isYou },
          { name: leaderboard[2].name, points: leaderboard[2].points, isYou: leaderboard[2].isYou },
        ]
      : null;

  const leader = leaderboard.find((e) => !e.isYou && e.points > student.points);
  const topPoints = leaderboard[0]?.points ?? 0;
  const toTop = Math.max(0, topPoints - student.points);
  const progressToTop = topPoints > 0 ? Math.round((student.points / topPoints) * 100) : 0;

  const stats: StatTile[] = [
    {
      label: 'Total Poin',
      value: <CountUp value={student.points} />,
      caption: pointsStarted ? `${toTop} poin lagi ke #1` : 'poin belum berjalan',
      icon: Sparkles,
      tint: 'bg-navy-light text-navy',
    },
    {
      label: 'Peringkat',
      value: rank ? `#${rank}` : '—',
      caption: `dari ${total} siswa`,
      icon: Trophy,
      tint: 'bg-amber-100 text-amber-600',
    },
    {
      label: 'Badge Terkumpul',
      value: <CountUp value={earned} suffix={`/${badgeItems.length}`} />,
      caption: earned > 0 ? 'terus kumpulkan' : 'belum ada yang tercapai',
      icon: Medal,
      tint: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Lomba Diikuti',
      value: <CountUp value={counts?.entries ?? 0} suffix="×" />,
      caption: `${counts?.wins ?? 0} kali juara`,
      icon: CalendarCheck,
      tint: 'bg-maroon-light text-maroon',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Rank hero */}
      <div className="from-navy-dark via-navy-dark shadow-navy/20 relative overflow-hidden rounded-3xl bg-gradient-to-br to-[#0b1730] p-7 text-white shadow-lg sm:p-10">
        <div
          className="fx-float pointer-events-none absolute -top-20 -right-16 h-60 w-60 rounded-full bg-amber-400/20 blur-3xl"
          aria-hidden
        />
        <div
          className="bg-navy/50 pointer-events-none absolute -bottom-24 left-6 h-56 w-56 rounded-full blur-3xl"
          aria-hidden
        />

        <div
          className={cn(
            'relative grid items-center gap-8',
            podium ? 'lg:grid-cols-2' : 'lg:grid-cols-1',
          )}
        >
          <div>
            <p className="text-[11px] font-semibold tracking-[0.28em] text-white/50 uppercase">
              {student.level ? `Jenjang ${student.level}` : 'Semua jenjang'}
            </p>
            <h2 className="mt-3 flex flex-wrap items-baseline gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {student.name}
              {rank ? (
                <span className="text-4xl font-bold text-amber-300 sm:text-5xl">#{rank}</span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-white/60">
              dibandingkan dengan {total} siswa satu jenjang
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <span className="rounded-full bg-amber-400/15 px-3.5 py-1.5 text-sm font-semibold text-amber-300">
                <CountUp value={student.points} /> poin
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white ring-1 ring-white/15">
                <Medal className="h-4 w-4 text-amber-300" />
                {earned} badge
              </span>
            </div>

            {pointsStarted ? (
              <div className="mt-6 max-w-md">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-white/70">Menuju posisi #1</span>
                  <span className="font-semibold text-amber-300">
                    {student.points} / {topPoints}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="fx-bar-x h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
                    style={{ width: `${progressToTop}%` }}
                  />
                </div>
                {leader ? (
                  <p className="mt-2.5 text-sm text-white/80">
                    Kurang <strong className="font-semibold text-amber-300">{toTop} poin</strong>{' '}
                    untuk menyalip {leader.name}.
                  </p>
                ) : (
                  <p className="mt-2.5 text-sm text-white/80">
                    Kamu sedang memimpin di jenjang ini.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-6 max-w-md rounded-xl bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/70 ring-1 ring-white/10">
                Poin belum mulai dihitung untuk angkatan ini, jadi semua siswa masih di angka yang
                sama. Badge di bawah sudah aktif dan dihitung dari lomba, kehadiran, dan assessment
                yang benar-benar tercatat.
              </p>
            )}
          </div>

          {podium ? <Podium entries={podium} /> : null}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="fx-stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="fx-hover rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-neutral-500">{stat.label}</p>
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                  stat.tint,
                )}
              >
                <stat.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">{stat.value}</p>
            <p className="mt-1 text-xs text-neutral-400">{stat.caption}</p>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Papan Peringkat</h2>
          <p className="text-xs text-neutral-400">
            Nama siswa lain hanya tampil bila keluarganya mengaktifkannya di Pengaturan
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-10 text-center text-sm text-neutral-400">
            Belum ada siswa lain di jenjang ini untuk dibandingkan.
          </p>
        ) : (
          <LeaderboardTable rows={rows} ranked={pointsStarted} />
        )}
      </section>

      {/* Badge collection */}
      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900">Koleksi Badge</h2>
          <p className="text-xs text-neutral-400">
            {earned} dari {badgeItems.length} badge
          </p>
        </div>
        <div className="fx-stagger grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {badgeItems.map((badge) => (
            <BadgeCard key={badge.name} badge={badge} />
          ))}
        </div>
      </section>
    </div>
  );
}
