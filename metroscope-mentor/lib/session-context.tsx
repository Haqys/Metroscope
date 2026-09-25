'use client';

import { createContext, useContext } from 'react';
import type { Session } from '@/lib/session';

/**
 * The signed-in user, handed down from the server layout.
 *
 * The shell and its controls are client components (they own open/closed state
 * and route matching), so they cannot fetch the session themselves, a client
 * component has no access to the HttpOnly cookie, which is the entire point of
 * the cookie being HttpOnly. The server layout resolves it once per navigation
 * and passes it through here.
 *
 * This carries no secret: it is the same identity and grant list the API would
 * return to this caller anyway. It is a rendering convenience, never an
 * authorisation decision, `pages` decides what the nav shows, and the API
 * decides what the data allows.
 */
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('useSession() must be used inside <SessionProvider> (the (shell) layout).');
  }
  return session;
}
