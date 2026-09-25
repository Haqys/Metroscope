/** Cookie set by the API on login; its presence gates protected routes. */
export const REFRESH_COOKIE = 'ms_rt';

/** Route prefixes per surface (matches docs/02-sitemap.md). */
export const PORTAL_PREFIX = '/portal';
export const INTERNAL_PREFIXES = [
  '/overview',
  '/tasks',
  '/registrations',
  '/students',
  '/tutors',
  '/schedule',
  '/competitions',
  '/materials',
  '/finance',
  '/assessments',
  '/progress',
  '/performance',
  '/content',
  '/content-approval',
  '/me',
  '/settings',
] as const;

export const LOGIN_ROUTE = '/login';

/**
 * sessionStorage key used by the program-page starter form to hand
 * name/phone off to the /register wizard (kept out of the URL, no PII
 * in query strings). The wizard consumes and clears it on mount.
 */
export const REG_PREFILL_KEY = 'ms_reg_prefill';

/**
 * Business contact address, or null when none is configured.
 *
 * This was the literal `halo@metroscope.id`, and `metroscope.id` is not a
 * registered domain. It is offered by the registration wizard as the way
 * through when a submission fails, so the one visitor guaranteed to use it was
 * the one whose enquiry had just been lost, and it sent them somewhere that
 * bounces. Null now, unless `NEXT_PUBLIC_CONTACT_EMAIL` says otherwise, and
 * every call site checks. See `lib/standalone.ts`.
 */
export const ADMIN_EMAIL: string | null = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

/** Human labels for roles (end-user copy in Indonesian). */
export const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Siswa',
  PARENT: 'Orang Tua',
  HEAD: 'Ketua',
  SECRETARY: 'Sekretaris',
  FINANCE: 'Keuangan',
  MENTOR: 'Mentor',
  EDITOR: 'Editor',
};
