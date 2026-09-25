import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The unified work queue (doc 13 §7.2, doc 14 §1.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One queue for every decision waiting on a human. Doc 13 names six types:
 * registration · payment proof · content · reschedule · overdue · un-assessed.
 *
 * Five exist today. `reschedule` arrived with §3.2 and cost exactly what this
 * note predicted. One source function, no API change. `content` and
 * `unassessed` follow with the editorial queue and `assessments` (§3.5).
 * Declaring them early is what keeps the queue, the filter tabs and the counts
 * a stable shape while the sources land one at a time.
 *
 * `billing_run` is not in doc 13's list of six. It earned a place by existing:
 * a drafted month sitting unissued is exactly "a decision waiting on a human",
 * and it is invisible everywhere else until somebody thinks to open
 * /finance/invoices.
 */
export const INBOX_TYPES = [
  'registration',
  'payment_proof',
  'overdue',
  'billing_run',
  // Not yet backed by a table, see above.
  'content',
  'reschedule',
  'unassessed',
] as const;

export type InboxType = (typeof INBOX_TYPES)[number];

/** The types a source function can actually produce today. */
export const IMPLEMENTED_TYPES: readonly InboxType[] = [
  'registration',
  'payment_proof',
  'overdue',
  'billing_run',
  'reschedule',
];

export const ListInboxQuery = z.object({
  type: z.enum(INBOX_TYPES).optional(),
  /**
   * Capped low on purpose. An inbox is bounded work, if 500 decisions are
   * pending, the queue is not the problem, and paginating it would only make
   * the backlog easier to ignore. `counts` reports the true totals.
   */
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListInboxQuery = z.infer<typeof ListInboxQuery>;

/**
 * One row of work, whatever produced it.
 *
 * Deliberately flat and display-ready. The alternative, a discriminated union
 * with a payload per type, pushes a switch statement into every consumer, and
 * the queue's whole point is that a pending decision looks like a pending
 * decision regardless of which table it came from.
 */
export interface InboxItem {
  /** `${type}:${sourceId}`, stable, and unique across sources. */
  id: string;
  type: InboxType;
  title: string;
  subtitle: string | null;
  /** Where the decision is actually made. */
  href: string;
  /**
   * When this started waiting, submitted, uploaded, drafted, or fell due.
   * The queue sorts by it ascending: the thing that has waited longest is the
   * thing most likely to have been forgotten.
   */
  waitingSince: string;
  /** Rupiah, when the item is about money. Rendered, never recomputed. */
  amount: number | null;
}

export interface InboxCounts {
  total: number;
  byType: Record<InboxType, number>;
}
