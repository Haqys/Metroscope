import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal, required } from './load-env.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Sign-in accounts for every student and every staff role.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run db:seed:accounts -- --confirm
 *
 * Creates a Supabase Auth account, a `users` row and a role grant for:
 *
 *   · each of the 43 students   {name}-student@metroscope.id  / metroscope123
 *   · one account per staff role {role}-staff@metroscope.id   / {role}123
 *   · the Head, from SEED_HEAD_* in the environment
 *
 * Every account is created with `email_confirm: true`, so nobody has to click a
 * link in a mailbox that does not exist yet, metroscope.id is not registered,
 * and without auto-confirmation none of these could sign in at all.
 *
 * ⚠️ THESE ARE SHARED, GUESSABLE PASSWORDS.
 *
 * `metroscope123` is used by all 43 students AND by the Head, and the staff
 * passwords are `{role}123`. Anyone who learns one student's login can reach
 * the account that administers the system. That is a deliberate choice for a
 * handover/demo posture, not an accident, but it must not survive contact with
 * real families' data. Before this system holds anything real:
 *
 *   1. give the Head a unique password;
 *   2. rotate the staff passwords;
 *   3. move students onto per-family credentials with a real reset flow
 *      (which needs the sending domain live, docs/14 §3.8B).
 *
 * Re-running is safe: an account that already exists is left alone, never
 * silently re-passworded.
 */

loadEnvLocal();

if (!process.argv.includes('--confirm')) {
  console.error(`
\x1b[31mRefusing to run without --confirm.\x1b[0m

This creates sign-in accounts with SHARED, GUESSABLE passwords on
${new URL(required('DIRECT_URL')).hostname}.

  npm run db:seed:accounts -- --confirm
`);
  process.exit(1);
}

const sql = postgres(required('DIRECT_URL'), { max: 1 });
const supabase = createClient(
  required('NEXT_PUBLIC_SUPABASE_URL'),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const DOMAIN = 'metroscope.id';
const STUDENT_PASSWORD = 'metroscope123';

/**
 * One account per staff role. The password follows the role, as asked.
 * HEAD is absent here. It comes from SEED_HEAD_* so the environment stays the
 * single source of truth for who owns the system.
 */
const STAFF = [
  {
    role: 'SECRETARY',
    email: `secretary-staff@${DOMAIN}`,
    password: 'secretary123',
    name: 'Sekretaris Metroscope',
  },
  {
    role: 'FINANCE',
    email: `finance-staff@${DOMAIN}`,
    password: 'finance123',
    name: 'Keuangan Metroscope',
  },
  {
    role: 'MENTOR',
    email: `mentor-staff@${DOMAIN}`,
    password: 'mentor123',
    name: 'Mentor Metroscope',
  },
  {
    role: 'EDITOR',
    email: `editor-staff@${DOMAIN}`,
    password: 'editor123',
    name: 'Editor Metroscope',
  },
];

/**
 * A name to the local part of an address.
 *
 * "M. Asfabian Barra Cetta" → "m-asfabian-barra-cetta". Diacritics are folded
 * and punctuation dropped rather than percent-encoded: an address with a dot
 * inside a label is legal but a nuisance, and these are typed by humans.
 */
function slugifyName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const log = (m) => console.log(m);
const step = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/** Auth account + users row + role grant, idempotently. */
async function ensureAccount({ email, password, fullName, roleCode }) {
  const [existing] = await sql`SELECT id FROM users WHERE lower(email) = ${email.toLowerCase()}`;
  if (existing) return { id: existing.id, created: false };

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`${email}: ${error.message}`);

  const [{ id: roleId }] = await sql`SELECT id FROM roles WHERE code = ${roleCode}`;
  await sql`
    INSERT INTO users (id, email, full_name, status, primary_role_id)
    VALUES (${data.user.id}, ${email}, ${fullName}, 'ACTIVE', ${roleId})`;
  await sql`
    INSERT INTO user_roles (user_id, role_id) VALUES (${data.user.id}, ${roleId})
    ON CONFLICT DO NOTHING`;

  return { id: data.user.id, created: true };
}

try {
  // ═══ 1. HEAD ═══════════════════════════════════════════════════════
  step('1. Head');

  const headEmail = required('SEED_HEAD_EMAIL');
  const headName = process.env.SEED_HEAD_NAME ?? 'Ketua';
  const headPassword = required('SEED_HEAD_PASSWORD');

  const head = await ensureAccount({
    email: headEmail,
    password: headPassword,
    fullName: headName,
    roleCode: 'HEAD',
  });
  log(`  ${head.created ? 'created' : 'exists '}  ${headEmail.padEnd(38)} HEAD`);

  // ═══ 2. STAFF ══════════════════════════════════════════════════════
  step('2. Staff roles');

  for (const s of STAFF) {
    const r = await ensureAccount({
      email: s.email,
      password: s.password,
      fullName: s.name,
      roleCode: s.role,
    });
    log(`  ${r.created ? 'created' : 'exists '}  ${s.email.padEnd(38)} ${s.role}`);
  }

  // ═══ 3. STUDENTS ═══════════════════════════════════════════════════
  step('3. Students');

  /**
   * Each student gets their own account and becomes their own `user_id`,
   * replacing the shared roster placeholder. `app.owns_student()` then resolves
   * per student, so a family signing in sees exactly one child rather than all
   * 43, which is what the placeholder would have done the moment it could log
   * in. It cannot, which is why it was safe until now.
   *
   * The role is PARENT: it is the only customer role, and it is what the portal
   * middleware admits. There is no separate STUDENT role in this system.
   */
  const students = await sql`SELECT id, name, slug, user_id FROM students ORDER BY slug`;
  const [{ id: parentRoleId }] = await sql`SELECT id FROM roles WHERE code = 'PARENT'`;

  let created = 0;
  let linked = 0;
  const collisions = new Map();

  for (const s of students) {
    const local = slugifyName(s.name);
    const email = `${local}-student@${DOMAIN}`;

    /** Two students sharing a name would share an address. Say so, do not merge. */
    if (collisions.has(email)) {
      log(`  \x1b[31mCOLLISION\x1b[0m ${email}, ${collisions.get(email)} and ${s.name}`);
      continue;
    }
    collisions.set(email, s.name);

    const acc = await ensureAccount({
      email,
      password: STUDENT_PASSWORD,
      fullName: s.name,
      roleCode: 'PARENT',
    });
    if (acc.created) created++;

    if (s.user_id !== acc.id) {
      await sql`UPDATE students SET user_id = ${acc.id} WHERE id = ${s.id}`;
      linked++;
    }
    await sql`
      INSERT INTO user_roles (user_id, role_id) VALUES (${acc.id}, ${parentRoleId})
      ON CONFLICT DO NOTHING`;
  }

  log(`  ${created} accounts created · ${linked} students re-pointed at their own account`);

  // ═══ 4. THE PLACEHOLDER ════════════════════════════════════════════
  step('4. Roster placeholder');

  const [placeholder] = await sql`
    SELECT id FROM users WHERE email = ${`roster-unassigned@${DOMAIN}`}`;
  if (placeholder) {
    const [{ n }] = await sql`
      SELECT count(*)::int n FROM students WHERE user_id = ${placeholder.id}`;
    if (n === 0) {
      await sql`DELETE FROM user_roles WHERE user_id = ${placeholder.id}`;
      await sql`DELETE FROM users WHERE id = ${placeholder.id}`;
      log('  removed, every student now has their own account');
    } else {
      log(`  kept, ${n} students still attached to it`);
    }
  } else {
    log('  absent');
  }

  // ═══ RESULT ════════════════════════════════════════════════════════
  step('Result');
  const summary = await sql`
    SELECT r.code, count(*)::int n
    FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
    GROUP BY r.code ORDER BY r.code`;
  for (const x of summary) log(`  ${x.code.padEnd(11)} ${x.n}`);

  const [orphan] = await sql`
    SELECT count(*)::int n FROM students s
    WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id)`;
  log(`\n  students with no account: ${orphan.n}`);
} finally {
  await sql.end();
}
