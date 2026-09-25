import { sql } from 'drizzle-orm';
import { asUser } from '@/lib/db/rls';
import { writeAuditLog } from '@/lib/audit';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import type { CreateRoleInput, RoleDetail, UpdateRoleInput } from './roles.schema';

/** drizzle's `execute<T>` wants an index signature; the domain type should not carry one. */
type Row = RoleDetail & Record<string, unknown>;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Role administration (doc 14 Task 0.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything runs `asUser`, so `roles_write` / `role_actions_write`, which
 * require `role.manage`, are evaluated for every statement. The API's action
 * gate and RLS both fire; neither is load-bearing alone.
 *
 * `role_actions_write` is the single most important WITH CHECK in the schema:
 * without it, anyone who could write grants could grant themselves
 * `payment.verify` and approve their own refunds.
 */

const SELECT_ROLES = sql`
  SELECT r.id,
         r.code,
         r.name,
         r.description,
         r.is_system   AS "isSystem",
         r.is_customer AS "isCustomer",
         r.home,
         r.tone,
         COALESCE(ARRAY(SELECT rp.href FROM role_pages rp WHERE rp.role_id = r.id ORDER BY rp.href), '{}') AS pages,
         COALESCE(ARRAY(SELECT ra.action FROM role_actions ra WHERE ra.role_id = r.id ORDER BY ra.action), '{}') AS actions,
         (SELECT count(*) FROM user_roles ur WHERE ur.role_id = r.id)::int AS "memberCount"
  FROM roles r
`;

/**
 * The administrative half of a role, which pages it opens, which verbs it
 * carries, how many people hold it, is only returned to somebody who can act
 * on it (§3.8 Workstream G).
 *
 * `roles_select` is `USING (true)` deliberately: the shell resolves role names
 * and colours to render a chip, and that is true for a guardian as much as for
 * the Head. But this endpoint composes three things the chip does not need, and
 * together they are the internal authorisation model, the page catalogue, the
 * verb list, and the staff headcount behind each role. A parent had all of it
 * for the asking.
 *
 * Nothing is refused and no verb is invented: the fields are simply selected
 * for the caller, which is the rule doc 08 §5 states for public data and which
 * applies just as well one gate further in.
 *
 * **`role.manage` alone, not `/team`.** §3.8 also admitted holders of the
 * `/team` page, and §3.8B found what that meant in the browser: a Secretary
 * opening `/settings/roles` read every role's full page list, permission count
 * and headcount, the same catalogue that had just been closed to guardians,
 * still open one role up. `/team` is the staff directory; it labels people with
 * role NAMES, which the reduced payload still carries. Only `role-manager.tsx`
 * consumes `pages`, `actions` and `memberCount`, and that is the Head's editor
 * on the Head's page, doc 12 makes roles the Head's to manage, and `pages.ts`
 * marks `/settings/roles` locked for exactly that reason.
 */
function isAdministrative(ctx: RequestContext): boolean {
  return ctx.actions.includes('role.manage');
}

function publicRoleFields(role: RoleDetail): RoleDetail {
  return { ...role, pages: [], actions: [], memberCount: 0 };
}

export async function listRoles(ctx: RequestContext): Promise<RoleDetail[]> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<Row>(sql`
      ${SELECT_ROLES} ORDER BY r.is_system DESC, r.name
    `);
    const roles = Array.from(rows) as RoleDetail[];
    return isAdministrative(ctx) ? roles : roles.map(publicRoleFields);
  });
}

async function findRole(ctx: RequestContext, id: string): Promise<RoleDetail | null> {
  return asUser(ctx, async (tx) => {
    const rows = await tx.execute<Row>(sql`${SELECT_ROLES} WHERE r.id = ${id}`);
    return (Array.from(rows) as RoleDetail[]).at(0) ?? null;
  });
}

/** Replace a role's grants. Called inside the caller's transaction. */
async function writeGrants(
  tx: Parameters<Parameters<typeof asUser>[1]>[0],
  roleId: string,
  pages: string[] | undefined,
  actions: string[] | undefined,
) {
  if (pages) {
    await tx.execute(sql`DELETE FROM role_pages WHERE role_id = ${roleId}`);
    for (const href of new Set(pages)) {
      await tx.execute(sql`INSERT INTO role_pages (role_id, href) VALUES (${roleId}, ${href})`);
    }
  }
  if (actions) {
    await tx.execute(sql`DELETE FROM role_actions WHERE role_id = ${roleId}`);
    for (const action of new Set(actions)) {
      await tx.execute(
        sql`INSERT INTO role_actions (role_id, action) VALUES (${roleId}, ${action})`,
      );
    }
  }
}

export async function createRole(ctx: RequestContext, input: CreateRoleInput): Promise<RoleDetail> {
  const created = await asUser(ctx, async (tx) => {
    const existing = await tx.execute<{ id: string }>(
      sql`SELECT id FROM roles WHERE code = ${input.code}`,
    );
    if (Array.from(existing).length > 0) {
      throw new ApiError(409, 'ROLE_CODE_TAKEN', `Kode role "${input.code}" sudah dipakai.`);
    }

    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO roles (code, name, description, is_system, home, tone)
      VALUES (${input.code}, ${input.name}, ${input.description ?? null}, false,
              ${input.home}, ${input.tone ?? null})
      RETURNING id
    `);
    const id = (Array.from(rows) as { id: string }[]).at(0)?.id;
    if (!id) throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang membuat role.');

    await writeGrants(tx, id, input.pages, input.actions);
    return id;
  });

  await writeAuditLog({
    ctx,
    action: 'role.create',
    entity: 'role',
    entityId: created,
    after: { code: input.code, pages: input.pages, actions: input.actions },
  });

  return (await findRole(ctx, created))!;
}

export async function updateRole(
  ctx: RequestContext,
  id: string,
  input: UpdateRoleInput,
): Promise<RoleDetail> {
  const before = await findRole(ctx, id);
  if (!before) throw new ApiError(404, 'NOT_FOUND', 'Role tidak ditemukan.');

  /**
   * A system role's grants stay editable; its identity does not.
   *
   * `code` is what business logic and future RLS policies match on, renaming
   * FINANCE would silently detach every rule that names it. `name`, `tone` and
   * the grants are presentation and policy, and the Head is meant to tune those.
   */
  if (before.isSystem && input.home && !(input.pages ?? before.pages).includes(input.home)) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Halaman utama harus termasuk halaman role.');
  }

  const nextPages = input.pages ?? before.pages;
  const nextHome = input.home ?? before.home;
  if (!nextPages.includes(nextHome)) {
    throw new ApiError(
      422,
      'VALIDATION_FAILED',
      'Halaman utama harus termasuk halaman yang diberikan.',
    );
  }

  /**
   * The never-zero-Heads invariant.
   *
   * `role.manage` is the verb that grants verbs. Removing it from the last role
   * that holds it locks the organisation out of its own permission system with
   * no way back through the product, only through psql. The seed asserts this
   * on every run; enforcing it here too means the UI cannot create the state
   * the seed would refuse to.
   */
  if (
    input.actions &&
    before.actions.includes('role.manage') &&
    !input.actions.includes('role.manage')
  ) {
    const others = await asUser(ctx, async (tx) => {
      const rows = await tx.execute<{ n: number }>(sql`
        SELECT count(DISTINCT ur.user_id)::int AS n
        FROM user_roles ur
        JOIN role_actions ra ON ra.role_id = ur.role_id
        WHERE ra.action = 'role.manage' AND ur.role_id <> ${id}
      `);
      return (Array.from(rows) as { n: number }[]).at(0)?.n ?? 0;
    });
    if (others === 0) {
      throw new ApiError(
        409,
        'LAST_ROLE_MANAGER',
        'Ini satu-satunya role yang bisa mengatur role. Beri izin itu ke role lain dulu.',
      );
    }
  }

  await asUser(ctx, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      UPDATE roles
      SET name        = COALESCE(${input.name ?? null}, name),
          description = CASE WHEN ${input.description !== undefined}
                             THEN ${input.description ?? null} ELSE description END,
          home        = COALESCE(${input.home ?? null}, home),
          tone        = COALESCE(${input.tone ?? null}, tone)
      WHERE id = ${id}
      RETURNING id
    `);
    if (Array.from(rows).length === 0) {
      throw new ApiError(403, 'FORBIDDEN', 'Tidak berwenang mengubah role ini.');
    }
    await writeGrants(tx, id, input.pages, input.actions);
  });

  const after = (await findRole(ctx, id))!;
  await writeAuditLog({
    ctx,
    action: 'role.update',
    entity: 'role',
    entityId: id,
    before: { pages: before.pages, actions: before.actions },
    after: { pages: after.pages, actions: after.actions },
  });
  return after;
}

export async function deleteRole(ctx: RequestContext, id: string): Promise<void> {
  const role = await findRole(ctx, id);
  if (!role) throw new ApiError(404, 'NOT_FOUND', 'Role tidak ditemukan.');

  if (role.isSystem) {
    throw new ApiError(409, 'SYSTEM_ROLE', 'Role bawaan tidak bisa dihapus.');
  }
  /**
   * Refuse rather than cascade. Deleting a held role would strip access from
   * people mid-session with no record of what they used to have, and the
   * holder list is exactly the information the person deleting it needs.
   */
  if (role.memberCount > 0) {
    throw new ApiError(
      409,
      'ROLE_IN_USE',
      `Masih dipakai ${role.memberCount} akun. Pindahkan mereka dulu.`,
    );
  }

  await asUser(ctx, async (tx) => {
    await tx.execute(sql`DELETE FROM role_pages WHERE role_id = ${id}`);
    await tx.execute(sql`DELETE FROM role_actions WHERE role_id = ${id}`);
    await tx.execute(sql`DELETE FROM roles WHERE id = ${id}`);
  });

  await writeAuditLog({
    ctx,
    action: 'role.delete',
    entity: 'role',
    entityId: id,
    before: { code: role.code, pages: role.pages, actions: role.actions },
  });
}
