import { sql } from 'drizzle-orm';
import { asUser, asAnon, withElevatedPrivileges } from '@/lib/db/rls';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import { publicUrl } from '../media/media.service';
import { slugify } from '../articles/articles.service';
import type {
  ContactSubmissionInput,
  CreateFaqInput,
  CreateMentorInput,
  CreateTestimonialInput,
} from './surfaces.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FAQ, testimonials, mentors, and the contact inbox (doc 14 §2.7).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * What is NOT here, for the three content types: submit, approve, publish,
 * restore, versions, redirects, SEO. They are registered content types, so all
 * of that is `modules/content`, unchanged for the fourth, fifth and sixth time.
 *
 * The contact inbox is the odd one out and deliberately so: a submission is a
 * message from the public, not something anybody drafts or releases.
 */

const iso = (v: unknown) =>
  typeof v === 'string' || v instanceof Date ? new Date(v).toISOString() : v;

function normalise<T extends Record<string, unknown>>(rows: T[], photoKey = 'photoKey') {
  return rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    if (r[photoKey]) out.photoUrl = publicUrl(String(r[photoKey]));
    else out.photoUrl = null;
    for (const field of ['publishedAt', 'updatedAt', 'consentAt']) {
      if (out[field] != null) out[field] = iso(out[field]);
    }
    return out;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Public reads, all `asAnon`, so RLS decides what is public
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Published FAQ entries, in editor-chosen order.
 *
 * Ordered by `order_index` then question: an FAQ is a persuasion sequence, and
 * the objection an editor puts first is the one they think loses the most
 * enquiries. Alphabetical would throw that judgement away.
 */
export async function listPublicFaq() {
  return asAnon(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, question, answer, category, order_index AS "orderIndex", locale
      FROM faq_entries
      ORDER BY order_index, question
    `);
    return { items: Array.from(rows) };
  });
}

export async function listPublicTestimonials() {
  return asAnon(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT t.id, t.quote, t.author_name AS "authorName", t.author_role AS "authorRole",
             t.featured, t.order_index AS "orderIndex", t.locale,
             t.published_at AS "publishedAt",
             p.slug AS "programSlug", p.name AS "programName",
             m.storage_key AS "photoKey", m.alt AS "photoAlt"
      FROM testimonials t
      LEFT JOIN programs p ON p.id = t.program_id
      LEFT JOIN media_assets m ON m.id = t.photo_id
      ORDER BY t.featured DESC, t.order_index, t.author_name
    `);
    /**
     * `consent_source` and `consent_at` are NOT selected.
     *
     * They are the internal record proving permission, "WA dari Bunda Rani,
     * 12 Mei", and publishing that alongside the quote would expose how the
     * business contacts its families. The consent must exist (the pipeline
     * refuses to publish without it); it must not be broadcast.
     */
    return { items: normalise(Array.from(rows) as Record<string, unknown>[]) };
  });
}

const MENTOR_PUBLIC = sql`
  mp.id, mp.slug, mp.display_name AS "displayName", mp.headline, mp.bio,
  mp.specialisms, mp.order_index AS "orderIndex", mp.locale,
  mp.published_at AS "publishedAt",
  m.storage_key AS "photoKey", m.alt AS "photoAlt"
`;

/**
 * Published mentor profiles.
 *
 * Note what is absent: `user_id`. The FK exists so the CMS knows whose profile
 * this is, and it never leaves the server, a public payload carrying an
 * internal account id invites somebody to try it against another endpoint.
 * `users` is not joined at all, which is the point of the separate table.
 */
export async function listPublicMentors() {
  return asAnon(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${MENTOR_PUBLIC}
      FROM mentor_profiles mp
      LEFT JOIN media_assets m ON m.id = mp.photo_id
      ORDER BY mp.order_index, mp.display_name
    `);
    return { items: normalise(Array.from(rows) as Record<string, unknown>[]) };
  });
}

export async function getPublicMentor(slug: string) {
  return asAnon(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${MENTOR_PUBLIC},
             s.title AS "seoTitle", s.description AS "seoDescription",
             s.canonical AS "seoCanonical", s.noindex AS "seoNoindex"
      FROM mentor_profiles mp
      LEFT JOIN media_assets m ON m.id = mp.photo_id
      LEFT JOIN seo_meta s ON s.entity_type = 'mentor' AND s.entity_id = mp.id
      WHERE mp.slug = ${slug}
    `);
    const row = (Array.from(rows) as Record<string, unknown>[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Mentor tidak ditemukan.');

    /** Published articles this mentor wrote, real content, no new table. */
    const articles = await tx.execute(sql`
      SELECT a.slug, a.title, a.excerpt, a.reading_min AS "readingMin"
      FROM articles a
      JOIN mentor_profiles mp2 ON mp2.user_id = a.author_id
      WHERE mp2.id = ${row.id as string}
      ORDER BY a.published_at DESC NULLS LAST
      LIMIT 3
    `);

    return { ...normalise([row])[0], articles: Array.from(articles) };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Editorial reads and creation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The editor's read for one row of any §2.7 collection.
 *
 * Columns are listed per type, never `SELECT *`: the star returns the
 * database's snake_case while every other endpoint answers camelCase, and §2.3
 * shipped exactly that bug on articles, the editor read `undefined` for half
 * its fields and rendered them blank.
 */
const EDITOR_QUERIES: Record<string, ReturnType<typeof sql>> = {
  faq: sql`
    SELECT id, question, answer, category, order_index AS "orderIndex", locale,
           status::text AS status, version, review_note AS "reviewNote",
           updated_at AS "updatedAt"
    FROM faq_entries WHERE id = `,
  testimonial: sql`
    SELECT t.id, t.quote, t.author_name AS "authorName", t.author_role AS "authorRole",
           t.program_id AS "programId", t.photo_id AS "photoId",
           t.consent_source AS "consentSource", t.consent_at AS "consentAt",
           t.featured, t.order_index AS "orderIndex", t.locale,
           t.status::text AS status, t.version, t.review_note AS "reviewNote",
           t.updated_at AS "updatedAt",
           m.storage_key AS "photoKey", m.alt AS "photoAlt"
    FROM testimonials t
    LEFT JOIN media_assets m ON m.id = t.photo_id
    WHERE t.id = `,
  mentor: sql`
    SELECT mp.id, mp.slug, mp.display_name AS "displayName", mp.headline, mp.bio,
           mp.photo_id AS "photoId", mp.specialisms,
           mp.order_index AS "orderIndex", mp.locale,
           mp.status::text AS status, mp.version, mp.review_note AS "reviewNote",
           mp.updated_at AS "updatedAt",
           m.storage_key AS "photoKey", m.alt AS "photoAlt"
    FROM mentor_profiles mp
    LEFT JOIN media_assets m ON m.id = mp.photo_id
    WHERE mp.id = `,
  /**
   * Competitions (§3.4).
   *
   * The catalogue's marketing half, edited by the same collection editor as the
   * three §2.7 types. The operational half, peserta, tim, kesiapan, hasil, is
   * `/competitions/[slug]`, gated by different verbs, and deliberately not here.
   *
   * The date columns come back as ISO through `normalise()`; the editor's `date`
   * fields render the day part, which is what an editor is choosing.
   */
  competition: sql`
    SELECT c.id, c.slug, c.name, c.summary, c.description,
           c.cover_id AS "coverId", c.organizer, c.venue,
           c.level::text AS level, c.format::text AS format, c.mode::text AS mode,
           c.categories, c.levels,
           c.registration_fee AS "registrationFee", c.fee_note AS "feeNote",
           c.registration_url AS "registrationUrl", c.guidebook_url AS "guidebookUrl",
           c.registration_opens_at AS "registrationOpensAt",
           c.registration_deadline AS "registrationDeadline",
           c.event_start AS "eventStart", c.event_end AS "eventEnd",
           c.locale, c.status::text AS status, c.version,
           c.review_note AS "reviewNote", c.updated_at AS "updatedAt",
           m.storage_key AS "coverKey", m.alt AS "coverAlt"
    FROM competitions c
    LEFT JOIN media_assets m ON m.id = c.cover_id
    WHERE c.id = `,
};

export async function getSurfaceForEditor(ctx: RequestContext, type: string, id: string) {
  const base = EDITOR_QUERIES[type];
  if (!base) throw new ApiError(404, 'UNKNOWN_CONTENT_TYPE', `Tipe "${type}" tidak dikenal.`);

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`${base}${id}`);
    const row = (Array.from(rows) as Record<string, unknown>[]).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Konten tidak ditemukan.');
    /** A competition's image column is `cover_id`, not `photo_id`. */
    return normalise([row], type === 'competition' ? 'coverKey' : 'photoKey')[0];
  });
}

export async function createFaq(ctx: RequestContext, input: CreateFaqInput) {
  const created = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO faq_entries (question, answer, category, order_index)
      VALUES (${input.question}, ${input.answer}, ${input.category ?? null},
              COALESCE((SELECT MAX(order_index) + 10 FROM faq_entries), 0))
      RETURNING id
    `);
    const row = (Array.from(rows) as { id: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat FAQ.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.create',
    entity: 'faq',
    entityId: created.id,
    after: { question: input.question },
  });
  return { id: created.id, status: 'DRAFT' as const };
}

export async function createTestimonial(ctx: RequestContext, input: CreateTestimonialInput) {
  const created = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO testimonials (quote, author_name, author_role, order_index)
      VALUES (${input.quote}, ${input.authorName}, ${input.authorRole ?? null},
              COALESCE((SELECT MAX(order_index) + 10 FROM testimonials), 0))
      RETURNING id
    `);
    const row = (Array.from(rows) as { id: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat testimoni.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.create',
    entity: 'testimonial',
    entityId: created.id,
    after: { authorName: input.authorName },
  });
  return { id: created.id, status: 'DRAFT' as const };
}

export async function createMentor(ctx: RequestContext, input: CreateMentorInput) {
  const base = slugify(input.displayName);

  const created = await asUser(ctx, async (tx) => {
    /**
     * The account must exist and must be staff.
     *
     * A mentor profile for a guardian account would publish a customer's name
     * as a member of the team. `app.is_staff_account` answers that with owner
     * rights, because a policy body cannot read another user's `user_roles`.
     */
    const staff = await tx.execute<{ ok: boolean }>(sql`
      SELECT app.is_staff_account(${input.userId}::uuid) AS ok
    `);
    if (!((Array.from(staff) as { ok: boolean }[]).at(0)?.ok ?? false)) {
      throw new ApiError(422, 'NOT_STAFF', 'Profil mentor hanya untuk akun tim.');
    }

    const clash = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM mentor_profiles
      WHERE slug = ${base} OR user_id = ${input.userId}::uuid
    `);
    if (((Array.from(clash) as { n: number }[]).at(0)?.n ?? 0) > 0) {
      throw new ApiError(
        409,
        'MENTOR_EXISTS',
        'Akun ini sudah punya profil, atau slug sudah dipakai.',
      );
    }

    const rows = await tx.execute<{ id: string; slug: string }>(sql`
      INSERT INTO mentor_profiles (user_id, slug, display_name, headline, order_index)
      VALUES (${input.userId}::uuid, ${base}, ${input.displayName}, ${input.headline ?? null},
              COALESCE((SELECT MAX(order_index) + 10 FROM mentor_profiles), 0))
      RETURNING id, slug
    `);
    const row = (Array.from(rows) as { id: string; slug: string }[]).at(0);
    if (!row) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat profil mentor.');
    return row;
  });

  await writeAuditLog({
    ctx,
    action: 'content.create',
    entity: 'mentor',
    entityId: created.id,
    after: { displayName: input.displayName, slug: created.slug },
  });
  return { id: created.id, slug: created.slug, status: 'DRAFT' as const };
}

// ═══════════════════════════════════════════════════════════════════════════
//  The contact inbox (doc 13 §9.4, /site/forms)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Store a contact message from the public website.
 *
 * Runs with elevated privileges, and that is the narrowest option available:
 * `anon` has no INSERT policy on `form_submissions` and must not have one, a
 * table the public can write through its own grant is a table the public can be
 * tricked into writing through PostgREST. The elevation writes exactly one row,
 * of one shape, from a body Zod has already validated.
 *
 * Returns nothing but an acknowledgement. No id, no echo of the message: a
 * public endpoint that reflects what it stored is a public endpoint somebody
 * will use to probe what else it stores.
 */
export async function submitContactForm(ctx: RequestContext, input: ContactSubmissionInput) {
  /**
   * The honeypot is answered with success, not an error.
   *
   * A bot told "rejected" retries with the field removed. A bot told "thank
   * you" moves on, and the message is never written. Same reasoning the
   * registration form uses.
   */
  if (input.website?.trim()) {
    return { received: true };
  }

  await withElevatedPrivileges(
    ctx,
    'form.submit',
    'store a contact message from the public website',
    async (tx) => {
      await tx.execute(sql`
        INSERT INTO form_submissions (kind, name, email, phone, message, source_path)
        VALUES ('CONTACT', ${input.name}, ${input.email ?? null}, ${input.phone ?? null},
                ${input.message}, ${input.sourcePath ?? null})
      `);
    },
  );

  return { received: true };
}

/** The staff inbox. Page-gated on `/leads` by RLS; no action verb for a read. */
export async function listFormSubmissions(ctx: RequestContext, handled: boolean) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT f.id, f.kind, f.name, f.email, f.phone, f.message,
             f.source_path AS "sourcePath", f.handled,
             f.handled_at AS "handledAt", f.created_at AS "createdAt",
             u.full_name AS "handledByName"
      FROM form_submissions f
      LEFT JOIN users u ON u.id = f.handled_by_id
      WHERE f.handled = ${handled}
      ORDER BY f.created_at DESC
      LIMIT 100
    `);
    return { items: Array.from(rows) };
  });
}

export async function markSubmissionHandled(ctx: RequestContext, id: string, handled: boolean) {
  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE form_submissions
      SET handled = ${handled},
          handled_by_id = ${handled ? (ctx.user?.id ?? null) : null},
          handled_at = ${handled ? sql`now()` : sql`NULL`}
      WHERE id = ${id}
      RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Pesan tidak ditemukan.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'lead.approve',
    entity: 'form_submission',
    entityId: id,
    after: { handled },
  });
  return { id, handled };
}
