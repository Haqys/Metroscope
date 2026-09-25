import type { FaqEntry } from '@/lib/surfaces-api';

/**
 * FAQ accordion, built from `<details>` (doc 13 §16, "6 objections, accordion").
 *
 * Native disclosure rather than a state-driven component: it opens without
 * JavaScript, it is keyboard- and screen-reader-correct without any ARIA of our
 * own, and, the reason that matters here, a visitor using in-page find
 * (Ctrl+F) reaches text inside a closed `<details>` in modern browsers, which a
 * `hidden` div would swallow. An FAQ exists to answer the question somebody is
 * already searching for.
 */
export function FaqList({ entries }: { entries: FaqEntry[] }) {
  /** Grouped only when an editor actually used categories. */
  const grouped = entries.reduce<Record<string, FaqEntry[]>>((acc, entry) => {
    const key = entry.category ?? '';
    (acc[key] ??= []).push(entry);
    return acc;
  }, {});
  const groups = Object.entries(grouped);

  return (
    <div className="space-y-10">
      {groups.map(([category, items]) => (
        <div key={category}>
          {category && (
            <h3 className="text-maroon text-xs font-semibold tracking-[0.25em] uppercase">
              {category}
            </h3>
          )}
          <dl className={category ? 'mt-4' : ''}>
            {items.map((entry) => (
              <details
                key={entry.id}
                className="group border-b border-neutral-200 py-5 last:border-b-0"
              >
                <summary className="hover:text-navy flex cursor-pointer items-start justify-between gap-4 font-medium text-neutral-900 transition-colors">
                  <dt>{entry.question}</dt>
                  <span
                    aria-hidden
                    className="mt-1 shrink-0 text-neutral-400 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <dd className="mt-3 max-w-2xl leading-[1.8] text-neutral-600">
                  {/* Plain text, split on blank lines, never markup. */}
                  {entry.answer
                    .split(/\n\s*\n/)
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .map((para, i) => (
                      <p key={i} className={i > 0 ? 'mt-3' : ''}>
                        {para}
                      </p>
                    ))}
                </dd>
              </details>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
