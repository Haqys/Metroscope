import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SEED, the five system roles, their grants, and the first Head account.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Idempotent: safe to re-run on every deploy. Roles are upserted by `code` and
 * grants are replaced wholesale, so editing the matrix below and re-running
 * converges the database to it. An existing Head is never touched, in
 * particular the password is never reset by a re-run.
 *
 * Uses DIRECT_URL (:5432). This is DDL-adjacent bulk work run by an operator or
 * CI, never by a serverless function, so the pooler's constraints do not apply.
 */

// ─────────────────────────────────────────────────────────────────────────
//  Page grants, which pages a role may open. Drives navigation only.
//  Mirrors the catalogue in metroscope-internal/lib/pages.ts, which becomes a
//  read-only view of these rows once GET /v1/roles/pages lands (doc 14 §0.4).
// ─────────────────────────────────────────────────────────────────────────

const WORK = ['/home', '/inbox', '/tasks'];

/**
 * Action grants, what a role may DO. Enforced twice: `handler({ action })` in
 * the API and `app.has_action()` in RLS.
 *
 * ⚠️ The 16 verbs are fixed by doc 12 §10.2, but the docs never assign them to
 * roles. This matrix is derived from each role's stated remit and is the piece
 * most likely to need the Head's review. It is editable at runtime through
 * /settings/roles, so treat it as a starting position rather than policy.
 *
 * The separation doc 12 §10.2 exists for: seeing a queue is not permission to
 * act on it. FINANCE holds `payment.verify`; SECRETARY sees the same students
 * but cannot approve a rupiah.
 */
const ROLES = [
  {
    code: 'HEAD',
    name: 'Ketua',
    description: 'Akses penuh, mengelola tim, role, dan seluruh operasional.',
    home: '/home',
    tone: 'bg-violet-50 text-violet-700 ring-violet-200/70',
    pages: [
      ...WORK,
      '/overview',
      '/leads',
      '/students',
      '/schedule',
      '/competitions',
      '/materials',
      '/assessments',
      '/progress',
      '/finance',
      '/finance/invoices',
      '/finance/verifications',
      '/team',
      '/content',
      '/content-approval',
      '/site',
      '/settings/roles',
      '/settings/organization',
    ],
    // Every verb. The Head is the only role that can grant roles, which is what
    // makes the "never zero role.manage holders" invariant enforceable.
    actions: 'ALL',
  },
  {
    code: 'SECRETARY',
    name: 'Sekretaris',
    description: 'Pendaftar, database siswa, jadwal, dan data tim.',
    home: '/home',
    tone: 'bg-sky-50 text-sky-700 ring-sky-200/70',
    // No /overview: that is the Head's revenue dashboard (doc 13 §3 P1).
    pages: [...WORK, '/leads', '/students', '/schedule', '/competitions', '/team'],
    // Owns the funnel and the student record. Deliberately no money verbs.
    actions: ['lead.approve', 'lead.reject', 'student.edit', 'session.manage', 'data.export'],
  },
  {
    code: 'FINANCE',
    name: 'Keuangan',
    description: 'Tagihan, verifikasi pembayaran, dan laporan keuangan.',
    home: '/home',
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
    pages: [
      ...WORK,
      '/finance',
      '/finance/invoices',
      '/finance/verifications',
      '/students',
      // Finance owns the destination accounts parents transfer to.
      '/settings/organization',
    ],
    // Sees students (to bill them) but cannot edit the academic record.
    actions: ['invoice.issue', 'invoice.void', 'payment.verify', 'payment.record', 'data.export'],
  },
  {
    code: 'MENTOR',
    name: 'Mentor',
    description: 'Siswa, progress, assessment, dan materi. Workspace ada di aplikasi mentor.',
    /**
     * The MENTOR app's home, not the internal one's. That app has no /home
     * route at all; its root page redirects to /me. See migration 0031.
     */
    home: '/me',
    tone: 'bg-navy-light text-navy ring-navy/15',
    pages: [
      ...WORK,
      /** The landing page. CreateRole refuses a home outside pages. */
      '/me',
      '/students',
      '/schedule',
      /**
       * READ, per doc 13 §8.3's page matrix (`✅ r`). §3.4 added it: the same
       * section lists "record competition result" among the Mentor's five key
       * actions, and until competitions had a table nobody noticed that the
       * page granting the read was missing. The write stays behind
       * `progress.edit`, which they already hold, the page opens the record,
       * the verb decides what may be written to it.
       */
      '/competitions',
      '/materials',
      '/assessments',
      '/progress',
      '/content',
    ],
    /**
     * Teaches and records; does not administer. doc 13 §8.3 lists the Mentor's
     * actions as "mark attendance, update progress, fill assessment, record
     * competition result, assign material", scheduling is Secretary work, and
     * §T.1 deleted `/schedule/sessions/new` from the mentor app for that reason.
     *
     * `session.manage` used to be here, justified by a comment claiming RLS
     * scoped it to rows they mentor. It never did and could not: a Secretary has
     * to move anybody's session, so `sessions_update` cannot be narrowed to the
     * caller's own rows. The grant was harmless only while no scheduling code
     * existed, §3.1 turned it into the ability to book, move and cancel any
     * session in the business, and to mark attendance on lessons they were not
     * in the room for. Migration 0019 revokes it from existing databases.
     *
     * Marking attendance needs no verb: `session_attendance_write` authorises it
     * by having TAUGHT the session.
     */
    actions: ['assessment.submit', 'progress.edit', 'material.manage'],
  },
  {
    /**
     * The customer account, created by conversion (FR-ENR-1).
     *
     * ⚠️ FR-ENR-1 calls this `UserRole(STUDENT)`. It is seeded as PARENT because
     * that is who actually holds the account: `students.user_id` is the
     * guardian's user, and doc 09 has the parent signing in and paying. A role
     * named STUDENT held by a parent would mislead every future reader of a
     * permission check. Worth confirming, then reconciling the doc.
     *
     * It grants no internal pages and no action verbs, the portal gates on
     * having a session, and every row it renders is scoped by
     * `app.owns_student()` in RLS. The role exists so "is this a customer?" is
     * answerable from data rather than inferred from the absence of a role.
     */
    code: 'PARENT',
    /**
     * The CUSTOMER population. This flag is what app.is_staff() reads, without
     * it, holding PARENT made a guardian staff and RLS handed them unpublished
     * programmes and every activity_event row (0011_role_is_customer.sql).
     */
    isCustomer: true,
    name: 'Orang Tua',
    description: 'Akun keluarga, portal siswa, tagihan, dan progress anak.',
    home: '/portal',
    tone: 'bg-neutral-100 text-neutral-600 ring-neutral-200',
    pages: [],
    actions: [],
  },
  {
    code: 'EDITOR',
    name: 'Editor',
    description: 'Membuat konten dan mengajukannya untuk approval.',
    home: '/content',
    tone: 'bg-amber-50 text-amber-700 ring-amber-200/70',
    pages: ['/home', '/tasks', '/content', '/site'],
    /**
     * Intentionally EMPTY. Writing a draft is covered by the /content page
     * grant; `content.review` and `content.publish` are the approval verbs and
     * belong to whoever approves. An Editor who could publish their own work
     * would make /content-approval decorative.
     */
    actions: [],
  },
];

/** Pages every signed-in user gets regardless of role. */
const ALWAYS_ALLOWED = ['/settings/profile'];

/** Keep in lockstep with lib/auth/actions.ts, the seed asserts this below. */
const ALL_ACTIONS = [
  'lead.approve',
  'lead.reject',
  'invoice.issue',
  'invoice.void',
  'payment.verify',
  'payment.record',
  'content.publish',
  'content.review',
  'user.manage',
  'role.manage',
  'student.edit',
  'session.manage',
  'assessment.submit',
  'progress.edit',
  'material.manage',
  'settings.edit',
  'data.export',
];

// ─────────────────────────────────────────────────────────────────────────

function log(step, detail = '') {
  console.log(`  ${step.padEnd(34)} ${detail}`);
}

async function seedRoles(sql) {
  console.log('\nRoles and grants');

  for (const role of ROLES) {
    const actions = role.actions === 'ALL' ? ALL_ACTIONS : role.actions;

    const unknown = actions.filter((a) => !ALL_ACTIONS.includes(a));
    if (unknown.length) {
      throw new Error(`Role ${role.code} grants unknown action(s): ${unknown.join(', ')}`);
    }

    const [row] = await sql`
      INSERT INTO roles (code, name, description, is_system, home, tone, is_customer)
      VALUES (${role.code}, ${role.name}, ${role.description}, true, ${role.home}, ${role.tone},
              ${role.isCustomer ?? false})
      ON CONFLICT (code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        home        = EXCLUDED.home,
        tone        = EXCLUDED.tone,
        is_customer = EXCLUDED.is_customer,
        is_system   = true
      RETURNING id
    `;

    // Replace grants wholesale so a removed page/action actually disappears.
    // A role with no pages gets none: ALWAYS_ALLOWED is the INTERNAL profile
    // page, and granting it to a customer would put them in the staff nav.
    const pages = role.pages.length ? [...new Set([...role.pages, ...ALWAYS_ALLOWED])] : [];
    await sql`DELETE FROM role_pages WHERE role_id = ${row.id}`;
    if (pages.length) {
      await sql`INSERT INTO role_pages ${sql(pages.map((href) => ({ role_id: row.id, href })))}`;
    }

    await sql`DELETE FROM role_actions WHERE role_id = ${row.id}`;
    if (actions.length) {
      await sql`INSERT INTO role_actions ${sql(actions.map((action) => ({ role_id: row.id, action })))}`;
    }

    log(`${role.code} (${role.name})`, `${pages.length} pages · ${actions.length} actions`);
  }
}

async function seedHead(sql) {
  console.log('\nHead account');

  const email = process.env.SEED_HEAD_EMAIL;
  if (!email) {
    log('skipped', 'SEED_HEAD_EMAIL not set');
    return;
  }
  const fullName = process.env.SEED_HEAD_NAME ?? 'Ketua Metroscope';

  const supabase = createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Does this identity already exist in Supabase Auth?
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw new Error(`Could not list auth users: ${listErr.message}`);

  let authUser = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  let generatedPassword = null;

  if (authUser) {
    // Never reset an existing operator's password from a seed script.
    log('auth user', 'already exists, left untouched');
  } else {
    // A generated password is printed once and never stored. The operator is
    // expected to change it on first sign-in.
    generatedPassword =
      process.env.SEED_HEAD_PASSWORD ?? crypto.randomBytes(18).toString('base64url');

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`Could not create auth user: ${error.message}`);
    authUser = data.user;
    log('auth user', 'created');
  }

  const [head] = await sql`SELECT id FROM roles WHERE code = 'HEAD'`;
  if (!head) throw new Error('HEAD role missing, seedRoles() must run first.');

  // public.users mirrors auth.users by id (schema.ts: "mirrors auth.users.id").
  await sql`
    INSERT INTO users (id, email, full_name, display_name, primary_role_id, status)
    VALUES (${authUser.id}, ${email}, ${fullName}, ${fullName.split(' ')[0]}, ${head.id}, 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET
      email           = EXCLUDED.email,
      primary_role_id = COALESCE(users.primary_role_id, EXCLUDED.primary_role_id)
  `;
  log('users row', 'upserted');

  await sql`
    INSERT INTO user_roles (user_id, role_id)
    VALUES (${authUser.id}, ${head.id})
    ON CONFLICT DO NOTHING
  `;
  log('HEAD granted', authUser.id);

  if (generatedPassword && !process.env.SEED_HEAD_PASSWORD) {
    console.log('\n  ┌─────────────────────────────────────────────────────────────');
    console.log('  │  Generated password, shown once, not stored anywhere:');
    console.log(`  │    ${email}`);
    console.log(`  │    ${generatedPassword}`);
    console.log('  │  Change it on first sign-in.');
    console.log('  └─────────────────────────────────────────────────────────────');
  }
}

/**
 * Email templates.
 *
 * Copy lives in the database so the Head can fix wording without a deploy. The
 * seed inserts each code once and then leaves it alone, re-running must not
 * overwrite an edit somebody made through the UI, which is the whole reason the
 * copy is in a table rather than in this file.
 *
 * `{{placeholders}}` are substituted by lib/notifications/templates.ts. There is
 * no template language: no conditionals, no loops. Copy that needs a branch
 * needs a second template.
 *
 * End-user copy is Indonesian (CLAUDE.md).
 */
const TEMPLATES = [
  {
    code: 'lead.received',
    subject: 'Pendaftaran {{childName}} sudah kami terima',
    body: `Halo {{parentName}},

Terima kasih sudah mendaftarkan {{childName}} di Metroscope untuk {{programName}}.

Pendaftaran sudah masuk dan tim kami akan menghubungi Anda dalam 1x24 jam untuk mengatur jadwal konsultasi gratis.

Kalau ada yang ingin ditanyakan lebih dulu, balas saja email ini.

Salam,
Tim Metroscope`,
  },
  {
    code: 'staff.invited',
    subject: 'Akun Metroscope kamu sudah dibuat',
    body: `Halo {{fullName}},

Akun Metroscope kamu sudah dibuat dengan role {{roleNames}}.

Buat kata sandi dulu untuk mulai:
{{setPasswordUrl}}

Setelah itu masuk lewat {{loginUrl}} pakai email ini.

Kalau kamu merasa tidak seharusnya menerima email ini, abaikan saja, akunnya tidak bisa dipakai sampai kata sandinya dibuat.

Salam,
Tim Metroscope`,
  },
  {
    code: 'enrollment.created',
    subject: 'Selamat datang di Metroscope, akun & tagihan {{childName}}',
    body: `Halo {{parentName}},

Selamat! {{childName}} resmi terdaftar di {{programName}}.

Langkah 1, buat kata sandi Anda
{{setPasswordUrl}}

Langkah 2, selesaikan pembayaran pendaftaran
No. tagihan : {{invoiceNumber}}
Jumlah      : {{amount}}
Jatuh tempo : {{dueDate}}

Setelah pembayaran diverifikasi tim kami, akun {{childName}} langsung aktif dan semua materi terbuka. Sebelum itu Anda tetap bisa masuk ke portal untuk melihat tagihan dan mengunggah bukti transfer.

Ada yang ingin ditanyakan? Balas saja email ini.

Salam,
Tim Metroscope`,
  },
  {
    code: 'payment.submitted',
    subject: 'Bukti transfer {{invoiceNumber}} sudah kami terima',
    body: `Halo {{parentName}},

Bukti transfer untuk tagihan {{invoiceNumber}} ({{amount}}) sudah masuk dan sedang diperiksa tim Keuangan.

Kami akan mengabari Anda begitu verifikasi selesai, biasanya dalam 1x24 jam pada hari kerja. Tidak perlu mengirim ulang.

Salam,
Tim Metroscope`,
  },
  {
    code: 'payment.verified',
    /** The receipt. FR-PAY-1 lets a parent print this from the portal too. */
    subject: 'Pembayaran {{invoiceNumber}} sudah lunas, terima kasih',
    body: `Halo {{parentName}},

Pembayaran untuk {{childName}} sudah kami verifikasi. Terima kasih!

No. tagihan : {{invoiceNumber}}
Dibayar     : {{paidAmount}}
Sisa        : {{remaining}}

Akun {{childName}} kini aktif. Semua materi, jadwal, dan progress sudah terbuka di portal.

{{portalUrl}}

Salam,
Tim Metroscope`,
  },
  {
    code: 'invoice.issued',
    subject: 'Tagihan {{period}} untuk {{childName}}',
    body: `Halo {{parentName}},

Tagihan bulan {{period}} untuk {{childName}} sudah terbit.

No. tagihan : {{invoiceNumber}}
Jumlah      : {{amount}}
Jatuh tempo : {{dueDate}}

Detail rekening tujuan dan unggah bukti transfer ada di portal:
{{portalUrl}}

Salam,
Tim Metroscope`,
  },
  {
    code: 'invoice.reminder',
    subject: 'Pengingat tagihan {{invoiceNumber}}, {{childName}}',
    body: `Halo {{parentName}},

{{reminderLine}}

No. tagihan : {{invoiceNumber}}
Jatuh tempo : {{dueDate}}
{{feeLine}}

Bayar dan unggah bukti transfer lewat portal:
{{portalUrl}}

Kalau pembayaran sudah dikirim dan email ini tetap datang, abaikan saja, mungkin bukti transfer Anda masih diperiksa. Ada kendala? Balas email ini.

Salam,
Tim Metroscope`,
  },
  {
    code: 'payment.rejected',
    subject: 'Bukti transfer {{invoiceNumber}} perlu dikirim ulang',
    body: `Halo {{parentName}},

Mohon maaf, bukti transfer untuk tagihan {{invoiceNumber}} belum bisa kami verifikasi.

Catatan dari tim Keuangan:
{{reason}}

Silakan unggah ulang bukti transfer lewat portal. Tagihan masih {{amount}} dengan jatuh tempo {{dueDate}}.

{{portalUrl}}

Kalau ada yang membingungkan, balas saja email ini. Kami bantu cek bersama.

Salam,
Tim Metroscope`,
  },
  {
    /**
     * One template for both outcomes of a reschedule request (doc 14 §3.2).
     *
     * The decision is the only thing that differs, and `{{decisionLine}}`
     * carries it, two near-identical templates would be two places a portal
     * link or a sign-off has to be updated, and one of them would be missed.
     * The same reasoning `invoice.reminder` uses for its four stages.
     */
    code: 'reschedule.decided',
    subject: 'Kabar permintaan reschedule {{childName}}',
    body: `Halo {{parentName}},

Permintaan reschedule les {{childName}} yang dijadwalkan {{originalWhen}} sudah kami proses.

{{decisionLine}}

{{portalUrl}}

Kalau ada yang perlu didiskusikan, balas saja email ini.

Salam,
Tim Metroscope`,
  },
  {
    /**
     * FR-ASN-5, the parent is told the assessment exists (doc 14 §3.5).
     *
     * Score and category, then a link. The mentor's qualitative note is
     * deliberately NOT in the email: it belongs beside the four criteria it
     * refers to, on a page behind a login, rather than in a message that gets
     * forwarded and printed.
     */
    code: 'assessment.ready',
    subject: 'Hasil assessment {{childName}}, {{period}}',
    body: `Halo {{parentName}},

Assessment {{childName}} untuk periode {{period}} sudah selesai ditulis oleh {{mentorName}}.

Skor rata-rata: {{avgScore}}/10 ({{category}})
Poin yang didapat: +{{points}}

Skor per kriteria dan catatan lengkap dari mentor bisa dibaca di portal:

{{portalUrl}}

Salam,
Tim Metroscope`,
  },
];

async function seedTemplates(sql) {
  console.log('\nEmail templates');

  for (const t of TEMPLATES) {
    const [row] = await sql`
      INSERT INTO notification_templates (code, channel, subject, body, is_active)
      VALUES (${t.code}, 'EMAIL', ${t.subject}, ${t.body}, true)
      ON CONFLICT (code) DO NOTHING
      RETURNING code
    `;
    log(t.code, row ? 'created' : 'already present, left as edited');
  }
}

/** doc 12 §10.2: the system must never be left with nobody able to grant roles. */
async function assertAdministrable(sql) {
  const [{ n }] = await sql`
    SELECT count(*)::int AS n
    FROM user_roles ur
    JOIN role_actions ra ON ra.role_id = ur.role_id
    WHERE ra.action = 'role.manage'
  `;
  console.log('\nInvariants');
  if (n === 0) {
    log('role.manage holders', '⚠️  ZERO. Nobody can administer this system');
  } else {
    log('role.manage holders', `${n} ✓`);
  }
}

async function main() {
  loadEnvLocal();
  const sql = postgres(required('DIRECT_URL'), { max: 1, connect_timeout: 15 });

  try {
    await seedRoles(sql);
    await seedTemplates(sql);
    await seedHead(sql);
    await assertAdministrable(sql);
    console.log('\nSeed complete.\n');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
