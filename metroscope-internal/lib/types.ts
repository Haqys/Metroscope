/**
 * Domain types, inlined from the deleted @metroscope/types package.
 *
 * These stay local per project until the shared SDK is published
 * (doc 15 section 1), duplicating a handful of string unions is cheaper than
 * a workspace dependency that would break independent Vercel deploys.
 */
/**
 * The seeded system roles. STAFF ONLY.
 *
 * STUDENT and PARENT were removed on 2026-07-30: nothing ever seeded or granted
 * them. Customers authenticate with a `users` row and a `students` row and NO
 * `user_roles` entry at all, owning a student is what identifies a family, and
 * `app.owns_student()` is what scopes their data. Keeping dead codes in a union
 * invites gating on one, which would lock out every customer (see
 * metroscope-portal/app/portal/layout.tsx).
 *
 * If Phase 1.4 wants real customer roles, seed them and add them here together.
 */
export const ROLES = ['HEAD', 'SECRETARY', 'FINANCE', 'MENTOR', 'EDITOR'] as const;

export type Role = (typeof ROLES)[number];
/** Accepts custom roles invented by the Head (doc 12 section 1). */
export type RoleCode = Role | (string & {});

export const INTERNAL_ROLES: Role[] = [...ROLES];

export type RegistrationType = 'CONSULTATION' | 'DIRECT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ContentType = 'ARTICLE' | 'PORTFOLIO' | 'IG_STORY' | 'ANNOUNCEMENT' | 'TESTIMONIAL';
export type ContentStatus = 'PENDING' | 'APPROVED' | 'NEEDS_REVISION';

/**
 * A role as the API described it, name, landing page, chip colour.
 *
 * Comes from GET /v1/auth/me. It replaces lib/roles-data.ts: a role invented
 * by the Head five minutes ago resolves here exactly like a seeded one, which
 * a local table by definition cannot do.
 */
export interface RoleSummary {
  code: RoleCode;
  name: string;
  home: string;
  tone: string | null;
}

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  roles: RoleCode[];
  /** The same roles, with display data. */
  roleDetails: RoleSummary[];
  primaryRole: RoleCode;
  fullName: string;
  displayName?: string | null;
  photoUrl?: string | null;
  studentId?: string;
  mentorId?: string;
}
