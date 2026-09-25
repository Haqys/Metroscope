import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { ACTIONS, type Action } from '@/lib/auth/actions';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Resolve a caller's grants FROM THE DATABASE, not from their token.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * doc 04 §0.3 describes a JWT that carries roles[] and actions[]. Supabase can
 * do that through a custom access token hook, but putting grants in the token
 * has two costs this system cannot absorb:
 *
 *   1. Revocation lags. Removing payment.verify from a role does nothing until
 *      every holder's token expires. For an action that approves millions of
 *      rupiah, "eventually" is the wrong semantics.
 *   2. Two sources of truth. RLS resolves grants from user_roles/role_actions
 *      via app.has_action(). If the API trusted the token instead, Gate 2 and
 *      Gate 3 could disagree, and the gate that disagrees silently is the one
 *      that lets something through.
 *
 * Resolving here means both gates read the same rows, so they cannot diverge.
 * The token proves WHO you are; the database decides WHAT you may do.
 *
 * Cost is one indexed query per authenticated request. At this system's scale
 * that is far cheaper than the class of bug it removes. If it ever shows up in
 * a p99, cache it in Redis keyed by user with explicit invalidation on role
 * change, not by moving grants back into the token.
 */
/**
 * A role as the UI needs to render it: what to call it, where it lands, what
 * colour its chip is.
 *
 * Carried alongside the codes because every surface needs it and there was
 * previously no way to get it. Each frontend kept its own copy of the role
 * table (`lib/roles-data.ts`) purely to turn `FINANCE` into "Keuangan". A
 * custom role invented by the Head appeared in that copy as its raw code, or
 * not at all.
 */
export interface RoleSummary {
  code: string;
  name: string;
  home: string;
  tone: string | null;
}

export interface Grants {
  roles: string[];
  roleDetails: RoleSummary[];
  actions: Action[];
  pages: string[];
  primaryRole: string | null;
}

const EMPTY: Grants = {
  roles: [],
  roleDetails: [],
  actions: [],
  pages: [],
  primaryRole: null,
};

export async function resolveGrants(userId: string): Promise<Grants> {
  const rows = await db.execute<{
    roles: string[] | null;
    role_details: RoleSummary[] | null;
    actions: string[] | null;
    pages: string[] | null;
    primary_role: string | null;
  }>(sql`
    SELECT
      COALESCE(ARRAY(
        SELECT r.code FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ${userId}
        ORDER BY r.code
      ), '{}')                                            AS roles,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'code', r.code, 'name', r.name, 'home', r.home, 'tone', r.tone
               ) ORDER BY r.code)
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ${userId}
      ), '[]'::jsonb)                                     AS role_details,
      COALESCE(ARRAY(
        SELECT DISTINCT ra.action FROM user_roles ur
        JOIN role_actions ra ON ra.role_id = ur.role_id
        WHERE ur.user_id = ${userId}
        ORDER BY ra.action
      ), '{}')                                            AS actions,
      COALESCE(ARRAY(
        SELECT DISTINCT rp.href FROM user_roles ur
        JOIN role_pages rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = ${userId}
        ORDER BY rp.href
      ), '{}')                                            AS pages,
      (
        SELECT r.code FROM users u
        JOIN roles r ON r.id = u.primary_role_id
        WHERE u.id = ${userId}
      )                                                   AS primary_role
  `);

  const row = rows[0];
  if (!row) return EMPTY;

  const roles = row.roles ?? [];

  /**
   * Drop anything not in the closed verb list. A stale row left by a renamed
   * verb must not become an unchecked permission. ACTIONS is the contract and
   * the database is data, so the code filters rather than trusting.
   */
  const actions = (row.actions ?? []).filter((a): a is Action =>
    (ACTIONS as readonly string[]).includes(a),
  );

  return {
    roles,
    roleDetails: row.role_details ?? [],
    actions,
    pages: row.pages ?? [],
    // Fall back to the first role so a user whose primary_role_id was never set
    // still lands somewhere sensible instead of nowhere.
    primaryRole: row.primary_role ?? roles[0] ?? null,
  };
}
