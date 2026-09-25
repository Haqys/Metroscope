import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { handler, ok } from '@/lib/http/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  q: z.string().max(120).optional(),
  /**
   * `picker` (default) is the six columns a dropdown needs. `directory` adds
   * what `/students` renders, programmes, payment standing, progress state.
   *
   * A flag rather than a second endpoint, because a second endpoint is how two
   * student lists drift apart; and a flag rather than always returning
   * everything, because the wider payload names a family's payment standing and
   * a picker has no business carrying it.
   */
  view: z.enum(['picker', 'directory']).default('picker'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * The student directory (doc 14 §3.1, widened in §3.6).
 *
 * §3.1 added the narrow version because the booking form could not pick a
 * student without it, and said so: "It is NOT the `/students` page API: that
 * page still reads `students-data.ts` and is retired in §3.5–§3.6 along with
 * the fields it needs (payment status, readiness, programme)." This is that
 * retirement, the fields arrive here rather than in a competing endpoint.
 *
 * `students_select` already answers who may read what: a guardian sees their
 * own children through `app.owns_student()`, staff see the roll through the
 * `/students` page grant. So a parent calling this gets their own children
 * rather than a 403, which is what the portal wants.
 */
export const GET = handler(
  {
    auth: 'required',
    query: Query,
    rateLimit: { key: 'students.list', limit: 120, window: '1 m' },
  },
  async ({ ctx, query }) =>
    ok(
      await asUser(ctx, async (tx) => {
        const term = query.q?.trim();
        const where = term ? sql`WHERE s.name ILIKE ${'%' + term + '%'}` : sql``;

        if (query.view === 'picker') {
          const rows = await tx.execute(sql`
            SELECT s.id, s.name, s.slug, s.level::text AS level,
                   s.account_status::text AS "accountStatus",
                   s.student_status::text AS "studentStatus"
            FROM students s
            ${where}
            ORDER BY s.name
            LIMIT ${query.limit}
          `);
          return { items: Array.from(rows) };
        }

        /**
         * The directory view.
         *
         * `payStatus` is derived from `invoices`, which is the authoritative
         * table for whether a family owes money, the deleted fixture carried a
         * hand-typed 'Lunas' | 'Cicilan' | 'Nunggak' per student, which is the
         * same fact stored twice and the copy nobody updates. Progress state
         * comes from `app.progress_status()`, so the directory and the §3.6
         * board cannot disagree about who is stale.
         */
        const rows = await tx.execute(sql`
          WITH last_progress AS (
            SELECT student_id, max(updated_at) AS at FROM progress GROUP BY student_id
          )
          SELECT s.id, s.name, s.slug, s.level::text AS level,
                 s.account_status::text AS "accountStatus",
                 s.student_status::text AS "studentStatus",
                 s.join_date AS "joinDate",
                 s.school, s.parent_name AS "parentName",

                 COALESCE(
                   (SELECT string_agg(p.name, ', ' ORDER BY p.name)
                    FROM enrollments e JOIN programs p ON p.id = e.program_id
                    WHERE e.student_id = s.id AND e.status = 'ACTIVE'),
                   ''
                 ) AS "programNames",

                 -- What is still owed, in integer IDR. Total payable is
                 -- amount + late_fee (the invoice column's own comment says so),
                 -- minus what has been VERIFIED: an unverified transfer is a
                 -- claim, not a payment, and counting it would show a family as
                 -- settled before Finance had looked.
                 COALESCE((
                   SELECT sum(
                     i.amount + i.late_fee
                     - COALESCE((SELECT sum(p.gross_amount) FROM payments p
                                  WHERE p.invoice_id = i.id AND p.verified_at IS NOT NULL), 0)
                   )::int
                   FROM invoices i
                   WHERE i.student_id = s.id
                     AND i.status IN ('UNPAID', 'OVERDUE', 'PARTIALLY_PAID', 'INSTALLMENT')
                 ), 0) AS "outstanding",

                 CASE
                   WHEN EXISTS (SELECT 1 FROM invoices i WHERE i.student_id = s.id
                                 AND i.status = 'OVERDUE') THEN 'NUNGGAK'
                   WHEN EXISTS (SELECT 1 FROM invoices i WHERE i.student_id = s.id
                                 AND i.status IN ('PARTIALLY_PAID', 'INSTALLMENT')) THEN 'CICILAN'
                   WHEN EXISTS (SELECT 1 FROM invoices i WHERE i.student_id = s.id
                                 AND i.status IN ('UNPAID', 'AWAITING_VERIFICATION')) THEN 'BELUM_BAYAR'
                   ELSE 'LUNAS'
                 END AS "payStatus",

                 lp.at AS "progressUpdatedAt",
                 app.progress_status(lp.at) AS "progressStatus",
                 app.days_since_wita(lp.at) AS "progressDaysSince"
          FROM students s
          LEFT JOIN last_progress lp ON lp.student_id = s.id
          ${where}
          ORDER BY s.name
          LIMIT ${query.limit}
        `);
        return { items: Array.from(rows) };
      }),
    ),
);
