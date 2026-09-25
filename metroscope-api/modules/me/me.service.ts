import crypto from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { asUser } from '@/lib/db/rls';
import { toIso } from '@/lib/db/iso';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import { env } from '@/lib/env';
import type { RequestContext } from '@/lib/auth/context';
import type {
  ListNotificationsInput,
  PhotoUploadInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
  UpdateStudentSettingsInput,
} from './me.schema';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The signed-in caller's own view of themselves.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Profile, notifications, achievements. Everything here runs `asUser`, so the
 * policies decide the rows and there is no ownership check in this file:
 * `notifications_select` is already `user_id = app.current_user_id()`, and a
 * second copy of that rule in JavaScript is a second thing to drift.
 *
 * These endpoints exist because the portal had none. The pages that needed
 * them, the summary, the achievements board, settings and the notification
 * dropdown, were rendering fixtures: every student saw "Aditya Pratama" and a
 * leaderboard of three invented classmates, whoever they actually were.
 */

const MEDIA_BUCKET = 'media';

// ── profile ──────────────────────────────────────────────────────────────

export async function getProfile(ctx: RequestContext) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT u.id, u.email, u.full_name AS "fullName", u.display_name AS "displayName",
             u.phone, u.photo_url AS "photoUrl", u.bio, u.status,
             (SELECT r.code FROM roles r WHERE r.id = u.primary_role_id) AS "primaryRole"
      FROM users u WHERE u.id = ${ctx.user!.id}::uuid
    `);
    const profile = Array.from(rows).at(0);
    if (!profile) throw new ApiError(404, 'NOT_FOUND', 'Profil tidak ditemukan.');

    const prefs = await tx.execute<Record<string, unknown>>(sql`
      SELECT channel, category, enabled FROM notification_preferences
      WHERE user_id = ${ctx.user!.id}::uuid ORDER BY channel, category
    `);

    /**
     * The children this account is guardian for. A portal shell needs them to
     * name whose progress it is showing, and a staff account simply has none.
     */
    const students = await tx.execute<Record<string, unknown>>(sql`
      SELECT s.id, s.name, s.slug, s.level::text AS level,
             s.account_status::text AS "accountStatus", s.points,
             s.show_on_leaderboard AS "showOnLeaderboard",
             s.school, s.dob, s.join_date AS "joinDate",
             s.parent_name AS "parentName", s.parent_phone AS "parentPhone",
             -- The settings page shows the programme as read-only fact, so it
             -- comes from enrolments rather than from anything a family types.
             (SELECT string_agg(p.name, ', ' ORDER BY p.name)
                FROM enrollments e JOIN programs p ON p.id = e.program_id
               WHERE e.student_id = s.id AND e.status = 'ACTIVE') AS "programNames"
      FROM students s WHERE s.user_id = ${ctx.user!.id}::uuid ORDER BY s.name
    `);

    return {
      ...profile,
      preferences: Array.from(prefs),
      students: Array.from(students),
    };
  });
}

export async function updateProfile(ctx: RequestContext, input: UpdateProfileInput) {
  const sets: SQL[] = [];
  if (input.fullName !== undefined) sets.push(sql`full_name = ${input.fullName}`);
  if (input.displayName !== undefined) sets.push(sql`display_name = ${input.displayName}`);
  if (input.phone !== undefined) sets.push(sql`phone = ${input.phone}`);
  if (input.bio !== undefined) sets.push(sql`bio = ${input.bio}`);
  if (input.photoUrl !== undefined) sets.push(sql`photo_url = ${input.photoUrl}`);

  if (sets.length === 0) return getProfile(ctx);

  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE users SET ${sql.join(sets, sql`, `)}
      WHERE id = ${ctx.user!.id}::uuid
      RETURNING id
    `);
    /**
     * RLS refuses a WRITE by raising 42501, but a row that does not match the
     * USING clause simply updates nothing. Both mean "not yours"; only one
     * throws, so the empty result is checked too.
     */
    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah profil ini.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'profile.update',
    entity: 'user',
    entityId: ctx.user!.id,
    after: { ...input },
  });

  return getProfile(ctx);
}

export async function updatePreferences(ctx: RequestContext, input: UpdatePreferencesInput) {
  await asUser(ctx, async (tx) => {
    for (const p of input.preferences) {
      await tx.execute(sql`
        INSERT INTO notification_preferences (user_id, channel, category, enabled)
        VALUES (${ctx.user!.id}::uuid, ${p.channel}, ${p.category}, ${p.enabled})
        ON CONFLICT (user_id, channel, category) DO UPDATE SET enabled = excluded.enabled
      `);
    }
  });
  return getProfile(ctx);
}

/**
 * The guardian's own child: contact name, contact phone, leaderboard privacy.
 *
 * Everything a family may change about a student, and nothing else. The write
 * goes through `app.update_student_self()` (migration 0030) rather than a
 * plain UPDATE, because `students_update` is `app.has_action('student.edit')`
 * and no guardian holds it, the privacy toggle on the settings page had never
 * been savable by anybody it was built for.
 *
 * Relaxing that policy would have been the wrong repair: RLS is row-level, so
 * "the owner may write their own row" also hands them `points`,
 * `account_status` and `level`. The function's three parameters ARE the
 * column allowlist, and it checks ownership itself.
 *
 * The read-then-merge is deliberate: the function takes all three values, so
 * an omitted field must resolve to what is already there rather than to NULL.
 */
export async function updateStudentSettings(
  ctx: RequestContext,
  studentId: string,
  input: UpdateStudentSettingsInput,
) {
  const current = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT id, parent_name AS "parentName", parent_phone AS "parentPhone",
             show_on_leaderboard AS "showOnLeaderboard"
      FROM students WHERE id = ${studentId}::uuid
    `);
    return Array.from(rows).at(0) as
      | { parentName: string | null; parentPhone: string | null; showOnLeaderboard: boolean }
      | undefined;
  });

  /** `students_select` returned nothing, so this student is not theirs to see. */
  if (!current) throw new ApiError(404, 'NOT_FOUND', 'Siswa tidak ditemukan.');

  const next = {
    parentName: input.parentName !== undefined ? input.parentName : current.parentName,
    parentPhone: input.parentPhone !== undefined ? input.parentPhone : current.parentPhone,
    showOnLeaderboard:
      input.showOnLeaderboard !== undefined ? input.showOnLeaderboard : current.showOnLeaderboard,
  };

  const okRows = await asUser(ctx, async (tx) =>
    Array.from(
      await tx.execute<{ ok: boolean }>(sql`
        SELECT app.update_student_self(
          ${studentId}::uuid, ${next.parentName}, ${next.parentPhone}, ${next.showOnLeaderboard}
        ) AS ok
      `),
    ),
  );

  if (okRows.at(0)?.ok !== true) {
    /** Readable but not writable: staff looking at a family's settings page. */
    throw new ApiError(403, 'FORBIDDEN', 'Hanya wali siswa ini yang dapat mengubah data ini.');
  }

  await writeAuditLog({
    ctx,
    action: 'student.settings.update',
    entity: 'student',
    entityId: studentId,
    before: { ...current },
    after: { ...next },
  });

  return { id: studentId, ...next };
}

// ── avatar ───────────────────────────────────────────────────────────────

/**
 * A signed upload URL for the caller's own avatar.
 *
 * Same bucket and same two-step handshake as the CMS media library, rather
 * than a second storage mechanism: ask for a URL, PUT the bytes straight to
 * storage, then confirm. The API never proxies the file, which is what keeps a
 * 5 MB upload out of a serverless request body.
 *
 * The key is derived from the user id, so one account cannot write over
 * another's avatar even though the bucket is public for reads.
 */
export async function createPhotoUpload(ctx: RequestContext, input: PhotoUploadInput) {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[input.contentType];
  const storageKey = `avatars/${ctx.user!.id}/${crypto.randomUUID()}.${ext}`;

  const storage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await storage.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(storageKey);
  if (error || !data) {
    throw new ApiError(502, 'STORAGE_UNAVAILABLE', 'Gagal menyiapkan unggahan foto.');
  }

  return { storageKey, uploadUrl: data.signedUrl, token: data.token };
}

/**
 * Point the profile at the uploaded object.
 *
 * The key is re-derived rather than trusted: a caller could otherwise confirm
 * any path in the bucket, including another account's avatar, and have it
 * written onto their own profile.
 */
export async function confirmPhoto(ctx: RequestContext, storageKey: string) {
  if (!storageKey.startsWith(`avatars/${ctx.user!.id}/`)) {
    throw new ApiError(403, 'FORBIDDEN', 'Kunci penyimpanan bukan milik akun ini.');
  }

  const storage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = storage.storage.from(MEDIA_BUCKET).getPublicUrl(storageKey);

  return updateProfile(ctx, { photoUrl: data.publicUrl });
}

// ── notifications ────────────────────────────────────────────────────────

/**
 * What each template means to the person who received it.
 *
 * The label and the destination live here rather than in the portal because
 * three surfaces render the same bell, and a code the UI does not recognise
 * should still be readable rather than showing a raw `payment.verified`.
 *
 * `notification_templates` is NOT the source: `notification_templates_select`
 * is `app.is_staff()`, so a guardian joining to it gets NULL for every row.
 * That join was in the first draft of this file and would have shipped a
 * dropdown of blank titles to exactly the people it is for.
 */
const NOTIFICATION_META: Record<string, { title: string; href: string; category: string }> = {
  'lead.received': { title: 'Pendaftaran diterima', href: '/portal', category: 'ACCOUNT' },
  'staff.invited': { title: 'Undangan akun', href: '/portal/settings', category: 'ACCOUNT' },
  'enrollment.created': { title: 'Pendaftaran program', href: '/portal', category: 'ACCOUNT' },
  'payment.submitted': {
    title: 'Bukti transfer diterima',
    href: '/portal/billing',
    category: 'BILLING',
  },
  'payment.verified': {
    title: 'Pembayaran terverifikasi',
    href: '/portal/billing',
    category: 'BILLING',
  },
  'payment.rejected': {
    title: 'Bukti transfer ditolak',
    href: '/portal/billing',
    category: 'BILLING',
  },
  'invoice.issued': { title: 'Tagihan baru terbit', href: '/portal/billing', category: 'BILLING' },
  'invoice.reminder': { title: 'Pengingat tagihan', href: '/portal/billing', category: 'BILLING' },
  'reschedule.decided': {
    title: 'Keputusan reschedule',
    href: '/portal/schedule',
    category: 'SCHEDULE',
  },
  'assessment.ready': {
    title: 'Hasil assessment tersedia',
    href: '/portal/assessments',
    category: 'ASSESSMENT',
  },
};

export async function listNotifications(ctx: RequestContext, query: ListNotificationsInput) {
  return asUser(ctx, async (tx) => {
    /**
     * Only what actually reached this person.
     *
     * The table doubles as the email dispatcher's ledger, so it holds PENDING
     * claims and FAILED attempts as well as deliveries. Showing those would
     * tell a parent about a message they never got, and a FAILED row has no
     * rendered subject at all, `payload` only gains one on success.
     */
    const where: SQL[] = [
      sql`n.user_id = ${ctx.user!.id}::uuid`,
      sql`(n.channel = 'IN_APP' OR n.status = 'SENT')`,
    ];
    if (query.unreadOnly) where.push(sql`n.read_at IS NULL`);

    const rows = await tx.execute<Record<string, unknown>>(sql`
      SELECT n.id, n.template, n.channel::text AS channel, n.status AS status,
             n.entity_type AS "entityType", n.entity_id AS "entityId",
             n.action_url AS "actionUrl", n.read_at AS "readAt",
             n.created_at AS "createdAt",
             -- Both shapes occur in this column, and only one of them answers
             -- to ->>'subject'. A jsonb string scalar is what you get when an
             -- already-stringified value is bound to a jsonb parameter, and
             -- outbox_message.payload holds 24 of them next to 20 objects.
             -- lib/notifications/dispatch.ts guards the same thing in
             -- JavaScript (asObject); this is that guard in SQL, because
             -- ->>'subject' on a string scalar returns NULL rather than
             -- failing, so the title would silently fall back to the generic
             -- label for every affected row.
             CASE
               WHEN jsonb_typeof(n.payload) = 'object' THEN n.payload->>'subject'
               WHEN jsonb_typeof(n.payload) = 'string' AND left(n.payload #>> '{}', 1) = '{'
                 THEN ((n.payload #>> '{}')::jsonb)->>'subject'
             END AS subject
      FROM notifications n
      WHERE ${sql.join(where, sql` AND `)}
      ORDER BY n.created_at DESC
      LIMIT ${query.limit}
    `);

    /** Counted over the same predicate, or the badge promises rows the list will not show. */
    const unread = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM notifications
      WHERE user_id = ${ctx.user!.id}::uuid
        AND (channel = 'IN_APP' OR status = 'SENT')
        AND read_at IS NULL
    `);

    const items = (Array.from(rows) as Record<string, unknown>[]).map((r) => {
      const meta = NOTIFICATION_META[String(r.template)];
      return {
        ...r,
        /** The rendered subject is the truest title. The map is the fallback. */
        title: (r.subject as string | null) ?? meta?.title ?? 'Pemberitahuan',
        category: meta?.category ?? 'GENERAL',
        href: meta?.href ?? '/portal/notifications',
        readAt: toIso(r.readAt) ?? null,
        createdAt: toIso(r.createdAt) ?? null,
      };
    });

    return { items, unread: Array.from(unread).at(0)?.n ?? 0 };
  });
}

export async function markNotificationRead(ctx: RequestContext, id: string) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE notifications SET read_at = COALESCE(read_at, now())
      WHERE id = ${id}::uuid AND user_id = ${ctx.user!.id}::uuid
      RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(404, 'NOT_FOUND', 'Notifikasi tidak ditemukan.');
    }
    return { id };
  });
}

export async function markAllNotificationsRead(ctx: RequestContext) {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE notifications SET read_at = now()
      WHERE user_id = ${ctx.user!.id}::uuid AND read_at IS NULL
      RETURNING id
    `);
    return { marked: Array.from(rows).length };
  });
}

// ── achievements ─────────────────────────────────────────────────────────

/**
 * Points, rank and the leaderboard for one student.
 *
 * The rank is computed in SQL over the comparison group the page already
 * claims to use, "siswa satu program & level", rather than over every student
 * in the school. Doing it in JavaScript would mean shipping the whole roster
 * to the browser to work out one number, and `students_select` would not give
 * a guardian those rows anyway.
 *
 * `show_on_leaderboard` is honoured: a family that opted out is counted in the
 * ranking (their points are real) but is not named to anybody else. doc 03
 * §7 lists leaderboard visibility as configurable per student, and the open
 * question in CLAUDE.md is about the DEFAULT, not about whether to obey it.
 */
export async function getAchievements(ctx: RequestContext, studentIdOrSlug?: string) {
  return asUser(ctx, async (tx) => {
    const target = studentIdOrSlug
      ? sql`(s.id::text = ${studentIdOrSlug} OR s.slug = ${studentIdOrSlug})`
      : sql`s.user_id = ${ctx.user!.id}::uuid`;

    const meRows = await tx.execute<Record<string, unknown>>(sql`
      SELECT s.id, s.name, s.slug, s.level::text AS level, s.points,
             s.show_on_leaderboard AS "showOnLeaderboard"
      FROM students s WHERE ${target} ORDER BY s.name LIMIT 1
    `);
    const student = Array.from(meRows).at(0) as
      { id: string; name: string; level: string | null; points: number } | undefined;

    if (!student) {
      /**
       * A staff account has no student of its own. That is not an error, it is
       * an empty board, and the page renders a plain "no data" instead of a
       * 404 that would look like a broken link.
       */
      return { student: null, rank: null, total: 0, leaderboard: [], badges: [] };
    }

    /**
     * The peer group: same level.
     *
     * Counted by `app.leaderboard_standing()`, NOT by an aggregate over
     * `students` here. That was the first draft and it is worth recording why
     * it was wrong, because it fails silently: `students_select` gives a
     * guardian exactly one row, their own child, so `count(*) FROM students`
     * inside their session returns 1. Every family in the school would have
     * been told they were rank 1 of 1. The board came back with one entry, and
     * a one-entry board still renders. `50_students.sql` predicted this in a
     * comment; the function is the "its own policy" half of that note.
     */
    const rankRows = await tx.execute<{ rank: number; total: number }>(sql`
      SELECT rank, total FROM app.leaderboard_standing(${student.id}::uuid)
    `);
    const standing = Array.from(rankRows).at(0) ?? { rank: null, total: 0 };

    const boardRows = await tx.execute<Record<string, unknown>>(sql`
      SELECT student_id AS "studentId", display_name AS "displayName", points, rank
      FROM app.leaderboard(${student.level}::school_level, 10)
    `);

    /**
     * A student who opted out keeps their place and loses their name. The
     * masking happened in the database, `displayName` is already null for
     * them, so there is no raw name here to leak by accident.
     */
    const leaderboard = (Array.from(boardRows) as Record<string, unknown>[]).map((r) => {
      const isYou = r.studentId === student.id;
      return {
        rank: Number(r.rank),
        points: Number(r.points),
        isYou,
        name: isYou ? student.name : ((r.displayName as string | null) ?? 'Siswa lain'),
      };
    });

    /**
     * Badges are derived, not stored: there is no `badges` table, and inventing
     * one to hold facts already implied by competitions and attendance would
     * create a second source of truth that can disagree with the first.
     */
    const badgeRows = await tx.execute<Record<string, unknown>>(sql`
      SELECT
        (SELECT count(*)::int FROM competition_targets t
          WHERE t.student_id = ${student.id}::uuid) AS entries,
        (SELECT count(*)::int FROM competition_targets t
          WHERE t.student_id = ${student.id}::uuid AND t.result = 'WINNER') AS wins,
        (SELECT count(*)::int FROM session_attendance a
          JOIN sessions ss ON ss.id = a.session_id
          WHERE ss.student_id = ${student.id}::uuid AND a.status = 'PRESENT') AS attended,
        (SELECT count(*)::int FROM assessments a
          WHERE a.student_id = ${student.id}::uuid) AS assessments
    `);
    const counts = (Array.from(badgeRows).at(0) ?? {}) as Record<string, number>;

    const badges = [
      { code: 'FIRST_COMPETITION', label: 'Peserta Lomba', earned: (counts.entries ?? 0) >= 1 },
      { code: 'WINNER', label: 'Juara', earned: (counts.wins ?? 0) >= 1 },
      { code: 'REGULAR', label: 'Rajin Hadir', earned: (counts.attended ?? 0) >= 5 },
      { code: 'ASSESSED', label: 'Terpantau', earned: (counts.assessments ?? 0) >= 1 },
      { code: 'VETERAN', label: 'Langganan Lomba', earned: (counts.entries ?? 0) >= 3 },
    ];

    return {
      student: { id: student.id, name: student.name, level: student.level, points: student.points },
      rank: standing.rank,
      total: standing.total,
      leaderboard,
      badges,
      counts,
    };
  });
}
