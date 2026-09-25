import { PortalShell } from '@/components/portal/portal-sidebar';
import { SessionProvider } from '@/lib/session-context';
import { requireSession } from '@/lib/session';

/**
 * Customer surface, a signed-in session is the only requirement.
 *
 * Deliberately no role check, unlike the internal and mentor shells. Roles are
 * a STAFF concept: `user_roles` rows exist for the five system roles, and the
 * conversion transaction creates a parent's account with a `students` row and
 * no role at all. So a parent's `roles` array is empty by design, and gating on
 * a PARENT role code here would lock out every customer.
 *
 * Nothing is lost by admitting anyone signed in: every row this shell renders
 * is scoped by RLS to `app.owns_student()`, so a staff member who wandered in
 * would see an empty portal rather than somebody else's child.
 *
 * The unused STUDENT and PARENT role codes were removed on 2026-07-30 so nobody
 * is tempted to gate on one. If Phase 1.4 wants real customer roles, seed them
 * and add the gate together, a code without a grant is a lockout waiting to
 * happen.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <SessionProvider session={session}>
      <PortalShell>{children}</PortalShell>
    </SessionProvider>
  );
}
