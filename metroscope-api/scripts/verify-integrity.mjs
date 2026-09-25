import postgres from 'postgres';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Does the data still say what the schema promised? (doc 06, doc 08 §6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run verify:integrity
 *
 * The constraints in `db/schema.ts` are enforced going forward. This asks the
 * question they cannot: whether the rows that are already there satisfy them,
 * rows written before a constraint existed, rows written by a migration's
 * backfill, rows written by a trigger that was silently missing for a while.
 *
 * Every check is a COUNT that must be zero, and every one of them names the
 * invariant in the schema or the document it comes from. A check that cannot
 * fail on this database is not evidence of anything, so the orphan sweep is
 * derived from the live foreign keys rather than from a list. It grows when
 * the schema grows.
 */
loadEnvLocal();
const sql = postgres(required('DIRECT_URL'), { max: 1 });

let pass = 0;
let fail = 0;
const failures = [];

function check(name, count, detail = '') {
  if (count === 0) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    fail++;
    failures.push(`${name}, ${count} row(s)${detail ? `: ${detail}` : ''}`);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}, ${count} row(s)${detail ? `: ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

const count = async (query) => Number((await query)[0]?.n ?? 0);

try {
  // ═══ 1. ORPHANS ════════════════════════════════════════════════════
  section('1. Referential integrity, every FK, not a chosen few');

  /**
   * Postgres enforces these, so a violation means somebody disabled a trigger,
   * restored a table out of order, or the constraint is NOT VALID. That last
   * one is the realistic case and the reason this runs at all: a constraint
   * added with NOT VALID accepts every row already present.
   */
  const fks = await sql`
    SELECT con.conname,
           src.relname  AS child,
           tgt.relname  AS parent,
           pg_get_constraintdef(con.oid) AS def,
           con.convalidated
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_class tgt ON tgt.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace
    WHERE con.contype = 'f' AND n.nspname = 'public'
    ORDER BY src.relname, con.conname`;

  const notValidated = fks.filter((f) => !f.convalidated);
  check(
    `all ${fks.length} foreign keys are validated, not NOT VALID`,
    notValidated.length,
    notValidated.map((f) => f.conname).join(', '),
  );

  let orphanTotal = 0;
  for (const fk of fks) {
    const m = /FOREIGN KEY \(([^)]+)\) REFERENCES ([a-z_]+)\(([^)]+)\)/i.exec(fk.def);
    if (!m) continue;
    const cols = m[1].split(',').map((c) => c.trim().replace(/"/g, ''));
    const refCols = m[3].split(',').map((c) => c.trim().replace(/"/g, ''));
    const on = cols.map((c, i) => `c."${c}" = p."${refCols[i]}"`).join(' AND ');
    const notNull = cols.map((c) => `c."${c}" IS NOT NULL`).join(' AND ');
    const n = await count(
      sql.unsafe(`SELECT count(*)::int AS n FROM "${fk.child}" c
                  WHERE ${notNull} AND NOT EXISTS (SELECT 1 FROM "${m[2]}" p WHERE ${on})`),
    );
    orphanTotal += n;
    if (n > 0) console.log(`      ${fk.child}.${cols.join(',')} → ${m[2]}: ${n}`);
  }
  check(`no orphaned rows across ${fks.length} relationships`, orphanTotal);

  // ═══ 2. DUPLICATE BUSINESS RECORDS ═════════════════════════════════
  section('2. Duplicates the business rules forbid');

  check(
    'one assessment per student per period (doc 06 §2.4)',
    await count(sql`SELECT count(*)::int AS n FROM (
      SELECT student_id, period FROM assessments GROUP BY 1,2 HAVING count(*) > 1) d`),
  );
  check(
    'one progress row per student per topic',
    await count(sql`SELECT count(*)::int AS n FROM (
      SELECT student_id, topic_id FROM progress GROUP BY 1,2 HAVING count(*) > 1) d`),
  );
  check(
    'one target per student per competition (§3.4)',
    await count(sql`SELECT count(*)::int AS n FROM (
      SELECT student_id, competition_id FROM competition_targets GROUP BY 1,2 HAVING count(*) > 1) d`),
  );
  check(
    'one achievement article per competition target (§3.7)',
    await count(sql`SELECT count(*)::int AS n FROM (
      SELECT competition_target_id FROM articles WHERE competition_target_id IS NOT NULL
      GROUP BY 1 HAVING count(*) > 1) d`),
  );
  check(
    'slugs are unique per content type',
    await count(sql`SELECT count(*)::int AS n FROM (
      SELECT slug FROM articles GROUP BY 1 HAVING count(*) > 1) d`),
  );
  check(
    'no two users share an email',
    await count(sql`SELECT count(*)::int AS n FROM (
      SELECT lower(email) FROM users WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d`),
  );

  // ═══ 3. VALUE RANGES ═══════════════════════════════════════════════
  section('3. Values inside the ranges the product states');

  check(
    'progress percent is 0–100 (FR-UPD-2)',
    await count(sql`SELECT count(*)::int AS n FROM progress WHERE percent < 0 OR percent > 100`),
  );
  check(
    'competition readiness is 0–100 (§3.4)',
    await count(sql`SELECT count(*)::int AS n FROM competition_targets
                    WHERE readiness_pct IS NOT NULL AND (readiness_pct < 0 OR readiness_pct > 100)`),
  );
  /**
   * 0–10, which is what `assessment_criteria_range` says. Not 1–5: the first
   * version of this check asserted that, found twelve rows scoring 6–9 and was
   * wrong about the product rather than finding a defect. The constraint in the
   * database is the authority here, and the check is written to agree with it.
   */
  check(
    'assessment criterion scores are 0–10 (assessment_criteria_range)',
    await count(
      sql`SELECT count(*)::int AS n FROM assessment_criteria WHERE score < 0 OR score > 10`,
    ),
  );
  check(
    'money is a non-negative integer of rupiah (doc 03 §6)',
    await count(
      sql`SELECT count(*)::int AS n FROM invoices WHERE amount < 0 OR amount <> round(amount)`,
    ),
  );
  check(
    'no late fee is negative',
    await count(sql`SELECT count(*)::int AS n FROM invoices WHERE late_fee < 0`),
  );
  /**
   * A payment is verified when it carries a verifier, not by a status column,
   * `payments` has none. Writing this against an imagined `p.status` is how the
   * first draft of this file failed: 42703, on a check that would otherwise
   * have silently matched nothing forever.
   */
  check(
    'verified payments never exceed the invoice they settle',
    await count(sql`SELECT count(*)::int AS n FROM (
      SELECT i.id FROM invoices i JOIN payments p ON p.invoice_id = i.id
      WHERE p.verified_at IS NOT NULL
      GROUP BY i.id, i.amount, i.late_fee
      HAVING sum(p.gross_amount) > i.amount + COALESCE(i.late_fee, 0)) d`),
  );

  // ═══ 4. DERIVED VALUES ARE IN STEP ═════════════════════════════════
  section('4. Derived values match what they are derived from');

  /**
   * `assessments.avg_score` is maintained by `app.recompute_assessment_score()`
   * (§3.5). A trigger that stops firing does not announce itself, the number
   * simply stops moving, and every page keeps rendering it confidently.
   */
  check(
    'assessments.avg_score equals the mean of its criteria (§3.5 trigger)',
    await count(sql`
      SELECT count(*)::int AS n FROM assessments a
      WHERE EXISTS (SELECT 1 FROM assessment_criteria c WHERE c.assessment_id = a.id)
        AND a.avg_score IS DISTINCT FROM (
          SELECT round(avg(c.score)::numeric, 1) FROM assessment_criteria c WHERE c.assessment_id = a.id)`),
  );
  check(
    'an assessment with no criteria has no score',
    await count(sql`
      SELECT count(*)::int AS n FROM assessments a
      WHERE NOT EXISTS (SELECT 1 FROM assessment_criteria c WHERE c.assessment_id = a.id)
        AND a.avg_score IS NOT NULL`),
  );
  check(
    'articles.reading_min is set on every published article',
    await count(sql`SELECT count(*)::int AS n FROM articles
                    WHERE status = 'PUBLISHED' AND (reading_min IS NULL OR reading_min < 1)`),
  );

  // ═══ 5. PUBLICATION RULES ══════════════════════════════════════════
  section('5. Nothing is published that the rules forbid publishing');

  /**
   * The two §3.7 gates, asked of the data rather than of the transition. A
   * pipeline check protects rows that go through the pipeline; this protects
   * against the rows that did not.
   */
  check(
    'no published article names a student without a consent record (§3.7)',
    await count(sql`SELECT count(*)::int AS n FROM articles
                    WHERE status = 'PUBLISHED' AND student_id IS NOT NULL
                      AND (consent_source IS NULL OR btrim(consent_source) = '')`),
  );
  check(
    'no published article lacks a byline (§3.7)',
    await count(sql`SELECT count(*)::int AS n FROM articles
                    WHERE status = 'PUBLISHED' AND author_id IS NULL`),
  );
  check(
    'no published article lacks an excerpt (0014 / §2.7)',
    await count(sql`SELECT count(*)::int AS n FROM articles
                    WHERE status = 'PUBLISHED' AND (excerpt IS NULL OR btrim(excerpt) = '')`),
  );
  check(
    'no published testimonial without consent (§2.7)',
    await count(sql`SELECT count(*)::int AS n FROM testimonials
                    WHERE status = 'PUBLISHED' AND (consent_source IS NULL OR btrim(consent_source) = '')`),
  );
  check(
    'every published article has a published_at',
    await count(sql`SELECT count(*)::int AS n FROM articles
                    WHERE status = 'PUBLISHED' AND published_at IS NULL`),
  );

  // ═══ 6. FINANCE ════════════════════════════════════════════════════
  section('6. Invoice and payment state agree with each other');

  check(
    'no PAID invoice without a verified payment',
    await count(sql`SELECT count(*)::int AS n FROM invoices i WHERE i.status = 'PAID'
                    AND NOT EXISTS (SELECT 1 FROM payments p
                                    WHERE p.invoice_id = i.id AND p.verified_at IS NOT NULL)`),
  );
  check(
    'no verified payment sits on a DRAFT invoice',
    await count(sql`SELECT count(*)::int AS n FROM payments p
                    JOIN invoices i ON i.id = p.invoice_id
                    WHERE p.verified_at IS NOT NULL AND i.status = 'DRAFT'`),
  );
  /**
   * The pair moves together or the record is unreadable: a timestamp with no
   * actor cannot be audited, an actor with no timestamp cannot be sequenced.
   * doc 07 §5 makes the verifier part of the payment record.
   */
  check(
    'verified_at and verified_by_id are set together (doc 07 §5)',
    await count(sql`SELECT count(*)::int AS n FROM payments
                    WHERE (verified_at IS NULL) <> (verified_by_id IS NULL)`),
  );
  check(
    'no invoice is OVERDUE before its due date',
    await count(sql`SELECT count(*)::int AS n FROM invoices
                    WHERE status = 'OVERDUE' AND due_date >= (now() AT TIME ZONE 'Asia/Makassar')::date`),
  );
  check(
    'a late fee only exists on an invoice that ran late',
    await count(sql`SELECT count(*)::int AS n FROM invoices
                    WHERE COALESCE(late_fee, 0) > 0 AND late_fee_at IS NULL`),
  );

  // ═══ 7. TEAMS AND MEMBERSHIP ═══════════════════════════════════════
  section('7. Competition teams and their members');

  /**
   * §3.4 gave `team_members` two composite foreign keys so a member cannot be
   * in a team for one competition while entered in another. The constraint
   * enforces it; this asks whether any row predates the constraint.
   */
  check(
    'every team member belongs to the team’s competition (§3.4 composite FK)',
    await count(sql`
      SELECT count(*)::int AS n FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.competition_id <> t.competition_id`),
  );
  check(
    'every team member is entered in that competition',
    await count(sql`
      SELECT count(*)::int AS n FROM team_members tm
      WHERE NOT EXISTS (SELECT 1 FROM competition_targets ct
                        WHERE ct.student_id = tm.student_id
                          AND ct.competition_id = tm.competition_id)`),
  );
  check(
    'no student appears twice in one team',
    await count(sql`SELECT count(*)::int AS n FROM (
      SELECT team_id, student_id FROM team_members GROUP BY 1,2 HAVING count(*) > 1) d`),
  );
  check(
    'no competition deadline precedes its opening',
    await count(sql`SELECT count(*)::int AS n FROM competitions
                    WHERE registration_opens_at IS NOT NULL AND registration_deadline IS NOT NULL
                      AND registration_deadline < registration_opens_at`),
  );
  check(
    'no competition ends before it starts',
    await count(sql`SELECT count(*)::int AS n FROM competitions
                    WHERE event_start IS NOT NULL AND event_end IS NOT NULL AND event_end < event_start`),
  );
  /**
   * `result` is NOT NULL and defaults to `PENDING`, so "has a result" is not
   * `IS NOT NULL`. PENDING is the *absence* of an outcome, on a target that
   * has been entered and not yet run. The first version of this check said
   * `IS NOT NULL`, found a PENDING row and reported a defect in code that was
   * behaving exactly as §3.4 describes.
   */
  check(
    'an outcome names who recorded it (§3.4)',
    await count(sql`SELECT count(*)::int AS n FROM competition_targets
                    WHERE result <> 'PENDING' AND recorded_by_id IS NULL`),
  );
  check(
    'and when it was recorded',
    await count(sql`SELECT count(*)::int AS n FROM competition_targets
                    WHERE result <> 'PENDING' AND recorded_at IS NULL`),
  );
  check(
    'no award text sits on a target with no outcome',
    await count(sql`SELECT count(*)::int AS n FROM competition_targets
                    WHERE result = 'PENDING' AND btrim(COALESCE(award, '')) <> ''`),
  );

  // ═══ 8. IDENTITY AND AUTHORISATION ═════════════════════════════════
  section('8. Identity, roles and the audit trail');

  check(
    'every user_roles row points at a real role and user',
    await count(sql`SELECT count(*)::int AS n FROM user_roles ur
                    WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = ur.role_id)
                       OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id)`),
  );
  check(
    'at least one account still holds role.manage',
    (await count(sql`SELECT count(*)::int AS n FROM user_roles ur
                     JOIN role_actions ra ON ra.role_id = ur.role_id
                     WHERE ra.action = 'role.manage'`)) > 0
      ? 0
      : 1,
    'nobody can administer the system',
  );
  check(
    'no student is without a guardian account (doc 06 §2.1)',
    await count(sql`SELECT count(*)::int AS n FROM students WHERE user_id IS NULL`),
  );
  check(
    'no audit_log row without an action',
    await count(
      sql`SELECT count(*)::int AS n FROM audit_log WHERE action IS NULL OR btrim(action) = ''`,
    ),
  );

  // ═══ 9. UNEXPECTED NULLS ═══════════════════════════════════════════
  section('9. Columns that should never be null, and are not constrained to be');

  check(
    'every student has a slug',
    await count(
      sql`SELECT count(*)::int AS n FROM students WHERE slug IS NULL OR btrim(slug) = ''`,
    ),
  );
  check(
    'every active user has an email',
    await count(sql`SELECT count(*)::int AS n FROM users
                    WHERE status = 'ACTIVE' AND (email IS NULL OR btrim(email) = '')`),
  );
  check(
    'every session has a start and an end',
    await count(
      sql`SELECT count(*)::int AS n FROM sessions WHERE starts_at IS NULL OR ends_at IS NULL`,
    ),
  );
  check(
    'no session ends before it starts',
    await count(sql`SELECT count(*)::int AS n FROM sessions WHERE ends_at <= starts_at`),
  );
} finally {
  await sql.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (failures.length) {
  console.log('Integrity violations:');
  for (const f of failures) console.log(`  · ${f}`);
  console.log('');
}
process.exit(fail === 0 ? 0 : 1);
