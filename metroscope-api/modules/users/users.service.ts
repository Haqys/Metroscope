import { sql } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { enqueue } from '@/lib/queue';
import { ensureAuthUser } from '@/lib/auth/provision';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import type {
  CreateUserInput,
  ListUsersQueryInput,
  StaffMember,
  UpdateUserRolesInput,
  UpdateUserStatusInput,
} from './users.schema';

/** drizzle's `execute<T>` wants an index signature; the domain type should not carry one. */
type Row = StaffMember & Record<string, unknown>;

/**
 * Bind a string list as ONE parameter.
 *
 * `WHERE code = ANY(${array})` looks right and is not: drizzle expands a JS
 * array into separate placeholders, so it compiles to `ANY(($1, $2))`, a row
 * expression, which Postgres rejects outright. It failed loudly here; the
 * dangerous version is a single-element list, where `ANY(($1))` is valid SQL
 * that means something else.
 *
 * One JSON parameter, unnested server-side. Still fully parameterised.
 */
const textList = (values: string[]) =>
  sql`(SELECT jsonb_array_elements_text(${JSON.stringify(values)}::jsonb))`;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Team accounts and their role grants (doc 14 Task 0.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Reads run `asUser`, so `users_select` decides the rows: yourself, plus the
 * staff directory if you are staff, plus everyone if you hold `user.manage`.
 * Guardians are therefore invisible here to anyone but a team administrator,
 * a Mentor looking up a colleague's extension must not get a list of parents.
 */

const SELECT_USERS = sql`
  SELECT u.id,
         u.full_name    AS "fullName",
         u.display_name AS "displayName",
         u.email,
         u.phone,
         u.photo_url    AS "photoUrl",
         u.status,
         COALESCE(ARRAY(
           SELECT r.code FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id ORDER BY r.code
         ), '{}') AS roles,
         (SELECT r.code FROM roles r WHERE r.id = u.primary_role_id) AS "primaryRole"
  FROM users u
`;

/**
 * The staff filter uses `app.is_staff_account(u.id)`, not an inline
 * `EXISTS (SELECT 1 FROM user_roles ...)`.
 *
 * The same trap as in `users_select`, one layer up: this query runs as the
 * caller, so a subquery over `user_roles` is itself filtered by
 * `user_roles_select`, which exposes only the caller's own rows. Every other
 * account then fails the membership test and the directory returns exactly one
 * person. You. The helper carries owner rights, so it answers for everybody.
 */
export async function listUsers(
  ctx: RequestContext,
  query: ListUsersQueryInput,
): Promise<{ items: StaffMember[] }> {
  const term = query.q?.trim();

  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<Row>(sql`
      ${SELECT_USERS}
      WHERE (${query.scope === 'all'} OR app.is_staff_account(u.id))
        AND (${term ?? null}::text IS NULL
             OR u.full_name ILIKE ${'%' + (term ?? '') + '%'}
             OR u.email     ILIKE ${'%' + (term ?? '') + '%'})
      ORDER BY u.full_name
      LIMIT ${query.limit}
    `);
    return { items: Array.from(rows) as StaffMember[] };
  });
}

async function findUser(ctx: RequestContext, id: string): Promise<StaffMember | null> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<Row>(sql`${SELECT_USERS} WHERE u.id = ${id}`);
    return (Array.from(rows) as StaffMember[]).at(0) ?? null;
  });
}

/**
 * Invite a colleague (doc 14 Task 0.4).
 *
 * The auth account is created first and outside the transaction, for the reason
 * `lib/auth/provision.ts` spells out: `users.id` mirrors `auth.users.id`, which
 * only the admin API can assign.
 *
 * No password is set. The invite email carries a set-password link minted at
 * SEND time, not here, a link generated now and stuck in a retry queue for six
 * hours would arrive already expired, and the new colleague would be locked out
 * of the account they were just told about.
 *
 * Customer roles are refused: PARENT exists so guardians have an identity, and
 * an account created from `/team` is by definition not a guardian.
 */
export async function createUser(
  ctx: RequestContext,
  input: CreateUserInput,
): Promise<StaffMember> {
  const roleRows = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; code: string; is_customer: boolean }>(sql`
      SELECT id, code, is_customer FROM roles WHERE code IN ${textList(input.roles)}
    `);
    return Array.from(rows) as { id: string; code: string; is_customer: boolean }[];
  });

  const missing = input.roles.filter((c) => !roleRows.some((r) => r.code === c));
  if (missing.length) {
    throw new ApiError(422, 'UNKNOWN_ROLE', `Role tidak dikenal: ${missing.join(', ')}.`);
  }
  const customer = roleRows.filter((r) => r.is_customer);
  if (customer.length) {
    throw new ApiError(
      422,
      'CUSTOMER_ROLE_NOT_ASSIGNABLE',
      `Role ${customer.map((r) => r.code).join(', ')} untuk pelanggan, bukan tim.`,
    );
  }

  const email = input.email.trim().toLowerCase();
  const existing = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`SELECT id FROM users WHERE email = ${email}`);
    return (Array.from(rows) as { id: string }[]).at(0) ?? null;
  });
  if (existing) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'Email ini sudah dipakai akun lain.');
  }

  const authUserId = await ensureAuthUser(email, input.fullName, 'staff-invite');

  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO users (id, email, phone, full_name, display_name, primary_role_id, status)
      VALUES (${authUserId}, ${email}, ${input.phone ?? null}, ${input.fullName},
              ${input.displayName ?? null},
              ${roleRows.find((r) => r.code === input.primaryRole)!.id}, 'ACTIVE')
      RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat akun.');
    }
    for (const role of roleRows) {
      await tx.execute(sql`
        INSERT INTO user_roles (user_id, role_id) VALUES (${authUserId}, ${role.id})
        ON CONFLICT (user_id, role_id) DO NOTHING
      `);
    }
  });

  // After the transaction commits, enqueueing inside it would wait on the
  // connection the transaction holds (`max: 1`) and deadlock.
  await enqueue('notification.staff-invited', { userId: authUserId });

  await writeAuditLog({
    ctx,
    action: 'user.create',
    entity: 'user',
    entityId: authUserId,
    after: { email, roles: input.roles, primaryRole: input.primaryRole },
  });

  return (await findUser(ctx, authUserId))!;
}

export async function setUserRoles(
  ctx: RequestContext,
  id: string,
  input: UpdateUserRolesInput,
): Promise<StaffMember> {
  const before = await findUser(ctx, id);
  if (!before) throw new ApiError(404, 'NOT_FOUND', 'Akun tidak ditemukan.');

  const roleIds = await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string; code: string }>(sql`
      SELECT id, code FROM roles WHERE code IN ${textList(input.roles)}
    `);
    return Array.from(rows) as { id: string; code: string }[];
  });

  const missing = input.roles.filter((c) => !roleIds.some((r) => r.code === c));
  if (missing.length) {
    throw new ApiError(422, 'UNKNOWN_ROLE', `Role tidak dikenal: ${missing.join(', ')}.`);
  }

  /**
   * Never leave the organisation with nobody who can grant roles.
   *
   * Same invariant as `updateRole`, from the other direction: this one catches
   * removing the last HOLDER rather than emptying the last role. Checked before
   * the write, because afterwards the caller may no longer be able to read the
   * rows needed to notice.
   */
  const losesRoleManage =
    before.roles.length > 0 &&
    (await holdsAction(ctx, before.roles, 'role.manage')) &&
    !(await holdsAction(ctx, input.roles, 'role.manage'));

  if (losesRoleManage) {
    const others = await asUser(ctx, async (tx) => {
      const rows = await tx.execute<{ n: number }>(sql`
        SELECT count(DISTINCT ur.user_id)::int AS n
        FROM user_roles ur
        JOIN role_actions ra ON ra.role_id = ur.role_id
        WHERE ra.action = 'role.manage' AND ur.user_id <> ${id}
      `);
      return (Array.from(rows) as { n: number }[]).at(0)?.n ?? 0;
    });
    if (others === 0) {
      throw new ApiError(
        409,
        'LAST_ROLE_MANAGER',
        'Ini satu-satunya akun yang bisa mengatur role. Tunjuk penggantinya dulu.',
      );
    }
  }

  await asUser(ctx, async (tx) => {
    /**
     * Insert first, delete second, the order is load-bearing.
     *
     * Delete-then-insert self-revokes when an administrator edits their OWN
     * roles: `user_roles_write` requires `role.manage`, `app.has_action()`
     * resolves it by reading `user_roles`, and the DELETE has already removed
     * the rows granting it inside this transaction. The INSERT then fails on
     * the policy the caller satisfied one statement earlier, and the whole
     * request 500s. Adding the new grants while the old ones still stand keeps
     * the caller authorised throughout.
     */
    for (const role of roleIds) {
      await tx.execute(sql`
        INSERT INTO user_roles (user_id, role_id) VALUES (${id}, ${role.id})
        ON CONFLICT (user_id, role_id) DO NOTHING
      `);
    }
    const primary = roleIds.find((r) => r.code === input.primaryRole)!;
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE users SET primary_role_id = ${primary.id} WHERE id = ${id} RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah akun ini.');
    }

    // Last, for the reason above: this is the statement that can revoke the
    // caller's own authority, so nothing may depend on it afterwards.
    await tx.execute(sql`
      DELETE FROM user_roles
      WHERE user_id = ${id}
        AND role_id::text NOT IN ${textList(roleIds.map((r) => r.id))}
    `);
  });

  await writeAuditLog({
    ctx,
    action: 'user.roles',
    entity: 'user',
    entityId: id,
    before: { roles: before.roles, primaryRole: before.primaryRole },
    after: { roles: input.roles, primaryRole: input.primaryRole },
  });

  return (await findUser(ctx, id))!;
}

/** Does any of these role codes carry the action? */
async function holdsAction(ctx: RequestContext, codes: string[], action: string): Promise<boolean> {
  if (codes.length === 0) return false;
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ yes: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM roles r
        JOIN role_actions ra ON ra.role_id = r.id
        WHERE r.code IN ${textList(codes)} AND ra.action = ${action}
      ) AS yes
    `);
    return (Array.from(rows) as { yes: boolean }[]).at(0)?.yes ?? false;
  });
}

/**
 * Deactivate rather than delete (see 10_identity.sql. There is no DELETE
 * policy on `users` anywhere). A removed row takes the audit trail with it,
 * and the audit trail is the one thing that must outlive the account.
 */
export async function setUserStatus(
  ctx: RequestContext,
  id: string,
  input: UpdateUserStatusInput,
): Promise<StaffMember> {
  const before = await findUser(ctx, id);
  if (!before) throw new ApiError(404, 'NOT_FOUND', 'Akun tidak ditemukan.');

  if (id === ctx.user?.id && input.status === 'INACTIVE') {
    throw new ApiError(
      409,
      'CANNOT_DEACTIVATE_SELF',
      'Kamu tidak bisa menonaktifkan akunmu sendiri.',
    );
  }

  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE users SET status = ${input.status} WHERE id = ${id} RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah akun ini.');
    }
  });

  await writeAuditLog({
    ctx,
    action: 'user.status',
    entity: 'user',
    entityId: id,
    before: { status: before.status },
    after: { status: input.status },
  });

  return (await findUser(ctx, id))!;
}
