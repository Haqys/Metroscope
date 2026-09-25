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
 * Codes this app does not recognise fall through to the code itself, which is
 * correct for a custom role invented by the Head (doc 12 §1).
 */
const ROLE_LABEL_MAP: Record<string, string> = {
  HEAD: 'Ketua',
  SECRETARY: 'Sekretaris',
  FINANCE: 'Keuangan',
  MENTOR: 'Mentor',
  EDITOR: 'Editor',
};

export function roleLabel(code: string): string {
  return ROLE_LABEL_MAP[code] ?? code;
}

/** @deprecated prefer `roleLabel()`, kept for call sites still using a map. */
export const ROLE_LABEL: Record<string, string> = new Proxy(
  {},
  { get: (_t, key: string) => roleLabel(key) },
) as Record<string, string>;

/**
 * The avatar source, if there is one.
 *
 * `photo_url` has been a column since the schema was written and, until the
 * upload endpoints existed, was always null, so every shell rendered initials
 * unconditionally and nothing read it. Now that a profile photo can actually
 * be set, the chips have to prefer it or the upload appears to do nothing.
 */
export function photoOf(user: { photoUrl?: string | null }): string | null {
  const url = user.photoUrl?.trim();
  return url ? url : null;
}
