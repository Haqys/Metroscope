import { redirect } from 'next/navigation';
import { MentorShell } from '@/components/mentor/mentor-shell';
import { SessionProvider } from '@/lib/session-context';
import { requireSession } from '@/lib/session';

/**
 * The surface gate.
 *
 * Middleware only established that somebody is signed in. It cannot know their
 * roles, because grants live in the database rather than the token (doc 04
 * constraint 7). This answers "does this person teach here?".
 *
 * HEAD is admitted alongside MENTOR: Balqis leads the team *and* mentors, which
 * is the case that forced multi-role in the first place (doc 11 §12).
 */
const ALLOWED = ['MENTOR', 'HEAD'];

export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  if (!session.roles.some((r) => ALLOWED.includes(r))) {
    redirect('/forbidden');
  }

  return (
    <SessionProvider session={session}>
      <MentorShell>{children}</MentorShell>
    </SessionProvider>
  );
}
