import Image from 'next/image';
import Link from 'next/link';
import { Clock } from 'lucide-react';

import {
  formatDuration,
  formatLevels,
  categoryLabel,
  formatPrice,
  type PublicProgramDetail,
} from '@/lib/programs-api';

const FACTS = (program: PublicProgramDetail) =>
  [
    { label: 'Level', value: formatLevels(program.levels) },
    { label: 'Durasi', value: formatDuration(program.durationMonths) },
    { label: 'Jadwal', value: program.cadence ?? '-' },
    { label: 'Biaya', value: formatPrice(program.priceMonthly) },
  ] as const;

/**
 * Left column of the programme page: badge, title, facts, copy, and the
 * programme's own success stories.
 *
 * Every value is CMS data. The facts grid used to read four pre-formatted
 * strings out of the fixture (`'SD · SMP · SMA'`, `'Rp 1.500.000 / bulan'`);
 * they are now derived from the columns the editor actually fills in, which is
 * what lets a price change ship without a deploy.
 */
export function ProgramDetail({ program }: { program: PublicProgramDetail }) {
  return (
    <div>
      <span className="bg-maroon-light text-maroon rounded-full px-4 py-1.5 text-xs font-semibold tracking-widest uppercase">
        {categoryLabel(program.category)}
      </span>

      <h1 className="mt-6 max-w-xl font-serif text-[clamp(2.5rem,5vw,4.25rem)] leading-[1.05] font-medium tracking-tight text-neutral-900">
        {program.name}
      </h1>

      {program.description && (
        <p className="mt-6 max-w-xl text-lg leading-relaxed font-light text-neutral-500">
          {program.description}
        </p>
      )}

      {program.coverUrl && (
        <div className="relative mt-8 aspect-[16/9] max-w-xl overflow-hidden rounded-3xl bg-neutral-100">
          <Image
            src={program.coverUrl}
            alt={program.coverAlt ?? ''}
            fill
            sizes="(min-width: 1024px) 36rem, 100vw"
            className="object-cover"
            priority
          />
        </div>
      )}

      {/* Fact grid: LEVEL · DURASI · JADWAL · BIAYA */}
      <dl className="mt-10 grid max-w-xl grid-cols-2 gap-x-8 gap-y-7 border-y border-neutral-200 py-8">
        {FACTS(program).map((fact) => (
          <div key={fact.label}>
            <dt className="text-[11px] font-semibold tracking-[0.25em] text-neutral-400 uppercase">
              {fact.label}
            </dt>
            <dd className="mt-1.5 font-medium text-neutral-900">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {/*
        Long-form copy. Split on blank lines rather than rendered as HTML, the
        column is plain text, and the day it is treated as markup is the day a
        pasted paragraph can inject a script. Articles get a structured AST
        (§2.3); a programme's body is prose and does not need one.
      */}
      {program.body && (
        <div className="mt-10 max-w-xl space-y-5">
          {program.body
            .split(/\n\s*\n/)
            .map((para) => para.trim())
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} className="leading-[1.8] text-neutral-700">
                {para}
              </p>
            ))}
        </div>
      )}

      {/*
        "Porto Siswa Program Ini", now real published articles carrying this
        programme's id, rather than the fixture's hand-written award list which
        had no source of truth behind it and could never go stale because
        nothing could update it.
      */}
      {program.stories.length > 0 && (
        <div className="mt-12 max-w-xl">
          <p className="text-maroon text-xs font-semibold tracking-[0.25em] uppercase">
            Cerita Siswa Program Ini
          </p>
          <div className="mt-5 space-y-4">
            {program.stories.map((story) => (
              <Link
                key={story.slug}
                href={`/articles/${story.slug}`}
                className="hover:border-maroon/30 group flex gap-4 rounded-2xl border border-neutral-200 p-4 transition-colors"
              >
                <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                  {story.coverUrl && (
                    <Image
                      src={story.coverUrl}
                      alt={story.coverAlt ?? ''}
                      width={80}
                      height={64}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="group-hover:text-maroon font-medium text-neutral-900 transition-colors">
                    {story.title}
                  </h3>
                  {story.excerpt && (
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{story.excerpt}</p>
                  )}
                  <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-neutral-400">
                    <Clock className="h-3 w-3" aria-hidden />
                    {story.readingMin} menit
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
