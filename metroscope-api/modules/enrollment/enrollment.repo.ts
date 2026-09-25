import { sql } from 'drizzle-orm';
import type { RequestContext } from '@/lib/auth/context';
import { withElevatedPrivileges } from '@/lib/db/rls';

/**
 * The conversion transaction (FR-ENR-1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Everything below happens in ONE transaction, or none of it does.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FR-ENR-1 is explicit that partial failure must roll back, and names the old
 * design's failure directly: "today's design can strand a user with no invoice".
 * A parent who can sign in but has nothing to pay will message staff to ask,
 * which is the exact manual load this product exists to remove.
 *
 * Runs elevated. `user.provision` is on the enumerated list for precisely this
 * case: the account does not exist yet, so there is no caller identity for the
 * new rows to be created as, and `asUser()` would have nobody to be. The
 * elevation is audited by withElevatedPrivileges().
 */

export interface ConversionResult extends Record<string, unknown> {
  userId: string;
  studentId: string;
  enrollmentId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
}

export interface ConversionInput {
  registrationId: string;
  authUserId: string;
  email: string;
  parentName: string;
  childName: string;
  school: string | null;
  level: string | null;
  parentPhone: string;
  programId: string;
  priceMonthly: number;
  startedAt: string;
  slug: string;
}

/** Days a registration invoice stays payable before it is overdue (FR-ENR-1). */
const DUE_DAYS = 7;

export async function convert(
  ctx: RequestContext,
  input: ConversionInput,
): Promise<ConversionResult> {
  return withElevatedPrivileges(
    ctx,
    'user.provision',
    `convert registration ${input.registrationId}`,
    async (tx) => {
      /**
       * Lock the lead first.
       *
       * `converted_student_id` is UNIQUE, so a double conversion would fail at
       * the constraint anyway, but it would fail AFTER creating a user, a
       * student and an invoice, and the rollback of that is noisy and confusing
       * to read in the logs. Taking the row lock up front makes the second
       * caller wait and then see the guard, which is a clean 409.
       */
      const locked = await tx.execute<{ converted_student_id: string | null; status: string }>(sql`
        SELECT converted_student_id, status
        FROM registrations
        WHERE id = ${input.registrationId}::uuid
        FOR UPDATE
      `);
      const lead = (
        Array.from(locked) as Array<{ converted_student_id: string | null; status: string }>
      ).at(0);
      if (!lead) throw new Error('REGISTRATION_NOT_FOUND');
      if (lead.converted_student_id) throw new Error('ALREADY_CONVERTED');

      // ── 1. the account ────────────────────────────────────────────────
      /**
       * Reuse an existing users row when the address already has one. That is
       * the sibling case: one guardian, one login, two children. Creating a
       * second account for the same person would split their invoices across
       * two logins and neither would show the whole picture.
       */
      const userRows = await tx.execute<{ id: string }>(sql`
        INSERT INTO users (id, email, full_name, display_name, status)
        VALUES (${input.authUserId}::uuid, ${input.email}, ${input.parentName},
                ${input.parentName.split(' ')[0]}, 'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
        RETURNING id
      `);
      const userId = (Array.from(userRows) as { id: string }[]).at(0)?.id ?? input.authUserId;

      // ── 2. the customer role ──────────────────────────────────────────
      await tx.execute(sql`
        INSERT INTO user_roles (user_id, role_id)
        SELECT ${userId}::uuid, id FROM roles WHERE code = 'PARENT'
        ON CONFLICT DO NOTHING
      `);

      // ── 3. the student, LIMITED until money clears (FR-ENR-4) ─────────
      const studentRows = await tx.execute<{ id: string }>(sql`
        INSERT INTO students
          (user_id, name, slug, school, level, parent_name, parent_phone,
           join_date, account_status, registration_id)
        VALUES (${userId}::uuid, ${input.childName}, ${input.slug},
                ${input.school}, ${input.level}::school_level, ${input.parentName},
                ${input.parentPhone}, CURRENT_DATE, 'LIMITED',
                ${input.registrationId}::uuid)
        RETURNING id
      `);
      const studentId = (Array.from(studentRows) as { id: string }[]).at(0)?.id;
      if (!studentId) throw new Error('STUDENT_INSERT_FAILED');

      // ── 4. the enrolment, with the price frozen (FR-ENR-2) ────────────
      const enrollmentRows = await tx.execute<{ id: string }>(sql`
        INSERT INTO enrollments (student_id, program_id, started_at, price_monthly_snapshot)
        VALUES (${studentId}::uuid, ${input.programId}::uuid, ${input.startedAt}::date,
                ${input.priceMonthly})
        RETURNING id
      `);
      const enrollmentId = (Array.from(enrollmentRows) as { id: string }[]).at(0)?.id;
      if (!enrollmentId) throw new Error('ENROLLMENT_INSERT_FAILED');

      // ── 5. the registration invoice ───────────────────────────────────
      const invoiceRows = await tx.execute<{
        id: string;
        number: string;
        amount: number;
        due_date: string;
      }>(sql`
        INSERT INTO invoices
          (number, student_id, amount, period, type, status, due_date,
           registration_id, issued_by_id)
        VALUES (app.next_invoice_number(), ${studentId}::uuid, ${input.priceMonthly},
                to_char(now() AT TIME ZONE 'Asia/Makassar', 'YYYY-MM'),
                'REGISTRATION', 'UNPAID',
                (CURRENT_DATE + ${`${DUE_DAYS} days`}::interval)::date,
                ${input.registrationId}::uuid, ${ctx.user?.id ?? null})
        RETURNING id, number, amount, due_date
      `);
      const invoice = (
        Array.from(invoiceRows) as Array<{
          id: string;
          number: string;
          amount: number;
          due_date: string;
        }>
      ).at(0);
      if (!invoice) throw new Error('INVOICE_INSERT_FAILED');

      // ── 6. close the lead ─────────────────────────────────────────────
      await tx.execute(sql`
        UPDATE registrations
        SET status = 'CONVERTED',
            converted_student_id = ${studentId}::uuid,
            reviewed_by_id = ${ctx.user?.id ?? null},
            reviewed_at = now()
        WHERE id = ${input.registrationId}::uuid
      `);

      return {
        userId,
        studentId,
        enrollmentId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        amount: Number(invoice.amount),
        dueDate: String(invoice.due_date),
      };
    },
  );
}

/** Everything the service needs to decide whether a lead can be converted. */
export interface ConvertibleLead extends Record<string, unknown> {
  id: string;
  status: string;
  childName: string;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string;
  school: string | null;
  level: string | null;
  programId: string | null;
  convertedStudentId: string | null;
}

export async function findConvertible(
  ctx: RequestContext,
  id: string,
): Promise<ConvertibleLead | null> {
  return withElevatedPrivileges(
    ctx,
    'user.provision',
    `read lead ${id} for conversion`,
    async (tx) => {
      const rows = await tx.execute<ConvertibleLead>(sql`
      SELECT id,
             status,
             child_name           AS "childName",
             parent_name          AS "parentName",
             parent_email         AS "parentEmail",
             parent_phone         AS "parentPhone",
             school,
             level::text          AS level,
             program_id           AS "programId",
             converted_student_id AS "convertedStudentId"
      FROM registrations WHERE id = ${id}::uuid
    `);
      return (Array.from(rows) as ConvertibleLead[]).at(0) ?? null;
    },
  );
}

export async function findProgram(
  ctx: RequestContext,
  id: string,
): Promise<{ id: string; name: string; priceMonthly: number } | null> {
  return withElevatedPrivileges(ctx, 'user.provision', 'read programme price', async (tx) => {
    const rows = await tx.execute<{ id: string; name: string; priceMonthly: number }>(sql`
      SELECT id, name, price_monthly AS "priceMonthly" FROM programs WHERE id = ${id}::uuid
    `);
    return (
      (Array.from(rows) as Array<{ id: string; name: string; priceMonthly: number }>).at(0) ?? null
    );
  });
}

/**
 * A slug that is unique but still readable.
 *
 * `students.slug` is UNIQUE and appears in URLs, so two children named Budi
 * cannot both be `budi`. A short random suffix beats a counter: a counter needs
 * a lock to be correct under concurrency, and this only has to be stable and
 * distinct, not sequential.
 */
export function slugFor(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'siswa';
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}
