/** Overall completion card (FR-PRG-3). */
export function OverallProgress({ pct, caption }: { pct: number; caption: string }) {
  return (
    <div className="bg-navy-light ring-navy/15 rounded-2xl p-6 ring-1">
      <p className="text-navy text-xs font-semibold tracking-wider uppercase">
        Progress Keseluruhan
      </p>
      <p className="mt-2 font-serif text-6xl font-medium tracking-tight text-neutral-900">
        {pct}
        <span className="text-3xl text-neutral-400">%</span>
      </p>
      <p className="mt-1 text-sm text-neutral-500">{caption}</p>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white">
        <div
          className="bg-navy h-full rounded-full"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
