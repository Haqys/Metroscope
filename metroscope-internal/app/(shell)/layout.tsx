import { redirect } from 'next/navigation';
import { InternalShell } from '@/components/internal/internal-sidebar';
import { SessionProvider } from '@/lib/session-context';
import { requireSession } from '@/lib/session';
import { INTERNAL_ROLES } from '@/lib/types';

/**
 * The surface gate.
 *
 * Middleware only established that SOMEBODY is signed in. It cannot know their
 * roles, because grants live in the database rather than the token (doc 04
 * constraint 7). This is where "should this person be on the internal
 * dashboard?" is answered, using the grants from GET /v1/auth/me.
 *
 * It is a redirect for the sake of the human, not a security boundary. A parent
 * who forces their way past it sees an empty shell: every byte behind it is
 * authorised independently by the API and filtered again by RLS.
 */
export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const allowed = session.roles.some((r) => (INTERNAL_ROLES as string[]).includes(r));
  // A custom role invented by the Head is still staff. It holds page grants
  // even though its code is not in INTERNAL_ROLES (doc 12 §1).
  const hasInternalPages = session.pages.some((p) => p !== '/settings/profile');

  if (!allowed && !hasInternalPages) {
    redirect('/forbidden');
  }

  return (
    <SessionProvider session={session}>
      <InternalShell>{children}</InternalShell>
    </SessionProvider>
  );
}
