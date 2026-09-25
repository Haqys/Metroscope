import { sql, type SQL } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import type { RequestContext } from '@/lib/auth/context';
import {
  INBOX_TYPES,
  type InboxCounts,
  type InboxItem,
  type InboxType,
  type ListInboxQuery,
} from './inbox.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The unified work queue (doc 14 §1.3).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ## Why there is no permission check in this file
 *
 * Every query here runs as the caller (`asUser`), so the RLS policies decide
 * which rows exist. That is deliberate and it is the whole design:
 *
 *   - `registrations` is visible to `has_page('/leads')`      (40_funnel.sql)
 *   - `invoices` to `/finance/invoices` or `/finance/verifications` (60_billing)
 *   - `billing_runs` to `/finance/invoices`                    (60_billing.sql)
 *
 * A JS-side `if (ctx.pages.includes('/leads'))` before each source would be a
 * second copy of those predicates, and a second copy can only ever drift out of
 * agreement with the first. When it drifts the failure is silent and bad in
 * both directions: work invisible to the person meant to do it, or a queue
 * that lists rows the reader then gets a 403 opening.
 *
 * The route still gates on the `/inbox` page grant. That is a question about
 * the page, not about the rows, and no table can answer it.
 *
 * ## Why one statement rather than four
 *
 * `UNION ALL` so the merge, the sort and the limit happen in Postgres. Four
 * round-trips merged in memory would have to over-fetch from every source to
 * sort correctly, and would make "oldest first" a lie the moment one source hit
 * its cap.
 */

type Row = InboxItem & Record<string, unknown>;

/**
 * A lead is waiting on a person in three distinct ways.
 *
 * `NEW`. Nobody has decided yet. `CONSULTING`, the consultation happened (or
 * was booked) and the outcome is still unrecorded, which FR-LEAD-6 requires to
 * close it. `NURTURING`, a follow-up was scheduled and its time has come.
 *
 * A `NURTURING` lead whose follow-up is still in the future is deliberately
 * absent: it is waiting on the calendar, not on a human, and putting it in the
 * queue teaches people that most of the queue can be ignored.
 */
const registrationSource = sql`
  SELECT 'registration:' || r.id::text AS id,
         'registration'                AS type,
         r.child_name                  AS title,
         CASE r.status
           WHEN 'NEW'        THEN 'Pendaftar baru, belum diputuskan'
           WHEN 'CONSULTING' THEN 'Hasil konsultasi belum dicatat'
           ELSE                   'Follow-up sudah jatuh tempo'
         END                           AS subtitle,
         '/leads/' || r.id::text       AS href,
         COALESCE(r.follow_up_at, r.last_contacted_at, r.created_at) AS "waitingSince",
         NULL::integer                 AS amount
  FROM registrations r
  WHERE r.status = 'NEW'
     OR r.status = 'CONSULTING'
     OR (r.status = 'NURTURING' AND (r.follow_up_at IS NULL OR r.follow_up_at <= now()))
`;

/** A parent has transferred and is waiting to be let in. Highest urgency. */
const paymentProofSource = sql`
  SELECT 'payment_proof:' || i.id::text AS id,
         'payment_proof'                AS type,
         s.name                         AS title,
         'Bukti transfer ' || i.number  AS subtitle,
         '/finance/verifications'       AS href,
         i.proof_uploaded_at            AS "waitingSince",
         (i.amount + i.late_fee)        AS amount
  FROM invoices i
  JOIN students s ON s.id = i.student_id
  WHERE i.status = 'AWAITING_VERIFICATION'
    AND i.proof_uploaded_at IS NOT NULL
`;

/**
 * Overdue bills, oldest due date first.
 *
 * `amount + late_fee`, never recomputed here, the nightly sweep stores the fee
 * so the parent's total and Finance's expected total are one number.
 */
const overdueSource = sql`
  SELECT 'overdue:' || i.id::text        AS id,
         'overdue'                       AS type,
         s.name                          AS title,
         i.number || ', lewat jatuh tempo' AS subtitle,
         '/finance/invoices?tab=Nunggak' AS href,
         i.due_date::timestamptz         AS "waitingSince",
         (i.amount + i.late_fee)         AS amount
  FROM invoices i
  JOIN students s ON s.id = i.student_id
  WHERE i.status = 'OVERDUE'
`;

/** A drafted month nobody has issued. Invisible everywhere else until asked for. */
const billingRunSource = sql`
  SELECT 'billing_run:' || b.id::text AS id,
         'billing_run'                AS type,
         'Tagihan ' || b.period       AS title,
         b.invoice_count::text || ' tagihan menunggu diterbitkan' AS subtitle,
         '/finance/invoices?view=run' AS href,
         b.created_at                 AS "waitingSince",
         b.total_amount               AS amount
  FROM billing_runs b
  WHERE b.status = 'DRAFT'
`;

/**
 * A family has asked to move a lesson and nobody has answered (doc 13 §12.6).
 *
 * This source is the whole point of §3.2. The wizard has existed since the
 * rebuild and "the parent submits into a void", the request had nowhere to
 * land, so the promise the portal makes ("kami balas di jam kerja") was one
 * nothing in the product could keep.
 *
 * `waitingSince` is when they ASKED, not when the lesson is. The queue sorts
 * oldest-first, so a request made a week ago outranks one made this morning
 * even if the lesson it concerns is further away, which is the right order for
 * a promise about response time.
 *
 * The `session.manage` predicate is the one place in this file where a source
 * narrows what RLS already allows, and it is deliberate.
 * `reschedule_requests_select` is broader than "who decides": it also admits
 * the MENTOR teaching the lesson, so their own week is not changed behind their
 * back. But a MENTOR cannot approve one, doc 13 §8.3, and migration 0019, and
 * an inbox is a list of decisions waiting on YOU. Showing a mentor an item they
 * can only look at teaches them the queue is mostly not theirs, which is how a
 * work queue stops being read.
 */
const rescheduleSource = sql`
  SELECT 'reschedule:' || r.id::text AS id,
         'reschedule'                AS type,
         st.name                     AS title,
         'Minta pindah jadwal ' ||
           to_char(s.starts_at AT TIME ZONE 'Asia/Makassar', 'DD Mon HH24:MI') AS subtitle,
         '/schedule/reschedule'      AS href,
         r.created_at                AS "waitingSince",
         NULL::integer               AS amount
  FROM reschedule_requests r
  JOIN sessions s ON s.id = r.session_id
  JOIN students st ON st.id = s.student_id
  WHERE r.status = 'PENDING'
    AND app.has_action('session.manage')
`;

const SOURCES: Record<string, SQL> = {
  registration: registrationSource,
  payment_proof: paymentProofSource,
  overdue: overdueSource,
  billing_run: billingRunSource,
  reschedule: rescheduleSource,
};

/** `UNION ALL` of every requested source, or just one when filtered. */
function union(type?: InboxType): SQL | null {
  const parts = type ? [SOURCES[type]].filter(Boolean) : Object.values(SOURCES);
  if (parts.length === 0) return null; // a declared-but-unbuilt type
  return sql.join(parts, sql` UNION ALL `);
}

export async function listInbox(
  ctx: RequestContext,
  query: ListInboxQuery,
): Promise<{ items: InboxItem[] }> {
  const body = union(query.type);
  if (!body) return { items: [] };

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<Row>(sql`
      SELECT * FROM (${body}) q
      ORDER BY q."waitingSince" ASC
      LIMIT ${query.limit}
    `);
    return { items: Array.from(rows) as InboxItem[] };
  });
}

/**
 * Exact totals per type, for the sidebar badge and the filter tabs.
 *
 * Separate from `listInbox` because the list is capped and these are not: the
 * badge has to be able to say 140 while the page shows 50. A count derived from
 * a capped list would silently under-report the backlog, which is the one thing
 * a work queue must never do.
 */
export async function inboxCounts(ctx: RequestContext): Promise<InboxCounts> {
  const body = union();
  if (!body) return emptyCounts();

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ type: InboxType; n: string }>(sql`
      SELECT q.type, count(*)::text AS n FROM (${body}) q GROUP BY q.type
    `);

    const counts = emptyCounts();
    for (const row of Array.from(rows)) {
      const n = Number(row.n);
      counts.byType[row.type] = n;
      counts.total += n;
    }
    return counts;
  });
}

function emptyCounts(): InboxCounts {
  const byType = Object.fromEntries(INBOX_TYPES.map((t) => [t, 0])) as Record<InboxType, number>;
  return { total: 0, byType };
}
