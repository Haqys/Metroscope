/** Cookie set by the API on login; its presence gates protected routes. */
export const REFRESH_COOKIE = 'ms_rt';

/** Route prefixes per surface (matches docs/02-sitemap.md). */
export const PORTAL_PREFIX = '/portal';
export const INTERNAL_PREFIXES = [
  '/home',
  '/inbox',
  '/tasks',
  '/overview',
  '/leads',
  '/students',
  '/schedule',
  '/competitions',
  '/materials',
  '/assessments',
  '/progress',
  '/finance',
  '/team',
  '/content',
  '/content-approval',
  '/settings',
] as const;

export const LOGIN_ROUTE = '/login';

/**
 * sessionStorage key used by the program-page starter form to hand
 * name/phone off to the /register wizard (kept out of the URL, no PII
 * in query strings). The wizard consumes and clears it on mount.
 */
export const REG_PREFILL_KEY = 'ms_reg_prefill';

/** Business contact address, the only outbound channel in v1. */
export const ADMIN_EMAIL = 'halo@metroscope.id';

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
