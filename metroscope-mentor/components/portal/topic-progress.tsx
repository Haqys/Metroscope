export interface Topic {
  name: string;
  pct: number;
}

/** Per-topic progress bars (FR-PRG-1). */
export function TopicProgress({ topics }: { topics: Topic[] }) {
  return (
    <div className="space-y-5">
      {topics.map((topic) => (
        <div key={topic.name}>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium text-neutral-800">{topic.name}</p>
            <p className="text-navy text-sm font-semibold">{topic.pct}%</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="bg-navy h-full rounded-full"
              style={{ width: `${topic.pct}%` }}
              role="progressbar"
              aria-label={topic.name}
              aria-valuenow={topic.pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
