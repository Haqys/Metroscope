import type { RoleSummary } from './types';

/**
 * Presentation helpers for a signed-in user.
 *
 * Split out of lib/session.ts because CLIENT components need these, the shell,
 * the sidebar, the profile form. lib/session.ts reaches for next/headers to read
 * the HttpOnly cookie, and importing it from a client component drags that into
 * the browser bundle, which fails the build with a message about the pages/
 * directory that has nothing to do with the actual problem.
 *
 * Nothing here touches the request. Pure functions over a user-shaped object.
 */
export interface DisplayUser {
  fullName: string;
  displayName?: string | null;
}

/** Initials for avatars, derived from the name, never stored separately. */
export function initialsOf(user: DisplayUser): string {
  const source = user.displayName?.trim() || user.fullName;
  return source
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Name shown in UI: friendly name when set, otherwise the legal name. */
export function nameOf(user: DisplayUser): string {
  return user.displayName?.trim() || user.fullName;
}

/**
 * Human label for a role code, resolved from data the API supplied.
 *
 * This read `lib/roles-data.ts`, a local copy of the role table. A copy can
 * only describe roles somebody hardcoded, so a CUSTOM role (the entire point of
 * roles being data, doc 12 §1) rendered as its raw code, and a renamed role
 * kept its old label until the file was edited to match.
 *
 * Callers pass the roles they already hold: `session.roleDetails` for the
 * signed-in user, or the `GET /v1/roles` list when labelling somebody else.
 */
export function roleLabel(code: string, known: RoleSummary[] = []): string {
  return known.find((r) => r.code === code)?.name ?? code;
}

/** Chip colours, resolved the same way. */
export function roleTone(code: string, known: RoleSummary[] = []): string {
  return (
    known.find((r) => r.code === code)?.tone ?? 'bg-neutral-100 text-neutral-600 ring-neutral-200'
  );
}

/**
 * The avatar source, if there is one. See the portal's copy: `photo_url` was
 * never read by any shell because nothing could set it until the /me upload
 * endpoints landed.
 */
export function photoOf(user: { photoUrl?: string | null }): string | null {
  const url = user.photoUrl?.trim();
  return url ? url : null;
}
