export interface CompetitionTargetProps {
  name: string; // "OSK Matematika 2026"
  date: string; // "19 Agustus 2026"
  level: string; // "Tingkat Kabupaten"
  daysLeft: number; // 40
  readinessPct: number; // 68
}

/**
 * Next competition target with readiness (FR-PRG-4). Readiness turns
 * amber as a soft warning when it lags the remaining days.
 */
export function CompetitionTarget({
  name,
  date,
  level,
  daysLeft,
  readinessPct,
}: CompetitionTargetProps) {
  const warning = readinessPct < 75;
  const barColor = warning ? 'bg-amber-400' : 'bg-emerald-500';
  const textColor = warning ? 'text-amber-700' : 'text-emerald-700';

  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      <p className="font-semibold text-neutral-900">{name}</p>
      <p className="mt-1 text-sm text-neutral-500">
        {date} · {level}
      </p>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${readinessPct}%` }}
          role="progressbar"
          aria-label="Kesiapan lomba"
          aria-valuenow={readinessPct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className={`mt-2.5 text-sm font-semibold ${textColor}`}>
        {daysLeft} hari lagi · kesiapan {readinessPct}%
      </p>
    </div>
  );
}
