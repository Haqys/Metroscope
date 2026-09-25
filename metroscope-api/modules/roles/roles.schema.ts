import { z } from 'zod';
import { ACTIONS } from '@/lib/auth/actions';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Roles are DATA (doc 12 §10.1, doc 14 Task 0.4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Head invents a role, ticks the pages it may open and the verbs it may
 * use, and it persists. Until now `/settings/roles` wrote to a React `useState`
 * seeded from `lib/roles-data.ts`, so a custom role survived exactly as long as
 * the tab stayed open, the page performed the mechanism doc 12 describes
 * without implementing it.
 */

/** Uppercase snake, the stable key business logic and RLS policies match on. */
const ROLE_CODE = /^[A-Z][A-Z0-9_]{2,31}$/;

/**
 * A page href must be one the app actually has.
 *
 * Not validated against a hardcoded list here: the catalogue lives in each
 * frontend (`lib/pages.ts`), and duplicating it server-side would give two
 * lists to keep in step. What the server does enforce is shape, a grant like
 * `https://evil.example` or `../admin` is refused, so a stored href can always
 * be used as a same-origin path.
 */
const PAGE_HREF = z
  .string()
  .min(2)
  .max(120)
  .regex(/^\/[A-Za-z0-9\-_/[\]]*$/, 'Href halaman tidak valid.');

export const CreateRole = z
  .object({
    code: z.string().regex(ROLE_CODE, 'Kode role harus HURUF_BESAR, 3–32 karakter.'),
    name: z.string().min(2).max(60),
    description: z.string().max(500).optional(),
    home: PAGE_HREF,
    tone: z.string().max(200).optional(),
    pages: z.array(PAGE_HREF).max(80).default([]),
    actions: z.array(z.enum(ACTIONS)).max(ACTIONS.length).default([]),
  })
  .strict()
  /**
   * A role whose landing page it cannot open drops the holder on a 403 the
   * moment they sign in. Cheap to prevent, confusing to diagnose.
   */
  .refine((v) => v.pages.includes(v.home), {
    message: 'Halaman utama harus termasuk halaman yang diberikan.',
    path: ['home'],
  });

export const UpdateRole = z
  .object({
    name: z.string().min(2).max(60).optional(),
    description: z.string().max(500).nullable().optional(),
    home: PAGE_HREF.optional(),
    tone: z.string().max(200).optional(),
    pages: z.array(PAGE_HREF).max(80).optional(),
    actions: z.array(z.enum(ACTIONS)).max(ACTIONS.length).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan.' });

export type CreateRoleInput = z.infer<typeof CreateRole>;
export type UpdateRoleInput = z.infer<typeof UpdateRole>;

export interface RoleDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** Guardians, not team. Never assignable from /team; never satisfies is_staff(). */
  isCustomer: boolean;
  home: string;
  tone: string | null;
  pages: string[];
  actions: string[];
  /** How many accounts hold it, the delete guard, and useful in the UI. */
  memberCount: number;
}
