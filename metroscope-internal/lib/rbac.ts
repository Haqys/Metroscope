import type { RoleSummary } from './types';

/**
 * Where a role lands, and which workspaces an account can switch between.
 *
 * Everything else this file used to do is gone. It answered "may this account
 * open this page?" from `lib/roles-data.ts`, a local copy of the role table,
 * and a stale local copy of an answer the server already owns can only ever
 * disagree with it. The sidebar reads `session.pages`, and every byte that
 * matters is authorised by the API and RLS.
 *
 * What remains is presentation, and it now takes the role data as an argument
 * rather than importing a table: a role invented by the Head resolves here
 * exactly like a seeded one.
 */

/**
 * Customer roles never reach the internal surface.
 *
 * The authoritative version of this question lives in the database as
 * `roles.is_customer` (see 0011_role_is_customer.sql). This list is the
 * client-side echo of it, used only to decide which workspace chips to show.
 */
const CUSTOMER_ROLES = ['PARENT'];

export function isCustomerRole(code: string): boolean {
  return CUSTOMER_ROLES.includes(code);
}

/** Landing route after login, from the account's primary role. */
export function homeFor(primaryRole: string, known: RoleSummary[] = []): string {
  if (isCustomerRole(primaryRole)) return '/portal';
  return known.find((r) => r.code === primaryRole)?.home ?? '/home';
}

/** Workspaces the account can switch between (only shown when > 1). */
export function workspacesFor(
  known: RoleSummary[] = [],
): { role: string; name: string; href: string }[] {
  return known
    .filter((r) => !isCustomerRole(r.code))
    .map((r) => ({ role: r.code, name: r.name, href: r.home }));
}
