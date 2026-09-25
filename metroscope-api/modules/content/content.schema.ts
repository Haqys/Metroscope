import { z } from 'zod';

/**
 * The editorial state machine, as data (doc 13 §9.2).
 *
 * Encoding the legal moves in one table rather than scattering `if (status ===
 * …)` through the service means an illegal transition is impossible to express,
 * and the UI can ask what is currently allowed instead of reimplementing the
 * rules and drifting.
 */
export const CONTENT_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export type ContentAction =
  'submit' | 'approve' | 'reject' | 'schedule' | 'publish' | 'unpublish' | 'archive' | 'restore';

interface Transition {
  from: ContentStatus[];
  to: ContentStatus;
  /**
   * Action verb required. `null` means "any staff member who can reach the
   * page", used only for `submit`, which is an author asking for review and
   * grants nothing.
   */
  action: 'content.review' | 'content.publish' | null;
  /** A reason is mandatory: the next person needs to know what to change. */
  requiresNote?: boolean;
}

export const TRANSITIONS: Record<Exclude<ContentAction, 'restore'>, Transition> = {
  submit: { from: ['DRAFT'], to: 'IN_REVIEW', action: null },
  approve: { from: ['IN_REVIEW'], to: 'APPROVED', action: 'content.review' },
  /**
   * Back to DRAFT with a note, not to a REJECTED dead end. Rejection in an
   * editorial flow means "needs changes", and a status nothing can leave is a
   * row somebody has to fix in the database.
   */
  reject: { from: ['IN_REVIEW'], to: 'DRAFT', action: 'content.review', requiresNote: true },
  schedule: { from: ['APPROVED'], to: 'SCHEDULED', action: 'content.publish' },
  /**
   * SCHEDULED is included so the cron can publish through the same path a
   * human does. One code path, one audit shape, one revalidation.
   */
  publish: { from: ['APPROVED', 'SCHEDULED'], to: 'PUBLISHED', action: 'content.publish' },
  /**
   * Unpublishing returns to DRAFT rather than ARCHIVED: taking a page down is
   * usually "fix it and put it back", and forcing an archive→draft round trip
   * to do that is friction with no safety benefit.
   */
  unpublish: { from: ['PUBLISHED'], to: 'DRAFT', action: 'content.publish' },
  archive: {
    from: ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED'],
    to: 'ARCHIVED',
    action: 'content.publish',
  },
};

export const ListContentQuery = z
  .object({
    type: z.string().min(1).max(40).optional(),
    status: z.enum(CONTENT_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const TransitionBody = z
  .object({
    note: z.string().max(2000).optional(),
    /** Required by `schedule`; ignored elsewhere. Must be in the future. */
    publishAt: z.coerce.date().optional(),
  })
  .strict();

export const RestoreBody = z
  .object({
    version: z.coerce.number().int().min(1),
    note: z.string().max(2000).optional(),
  })
  .strict();

export const SeoBody = z
  .object({
    title: z.string().max(70).nullable().optional(),
    description: z.string().max(200).nullable().optional(),
    canonical: z.string().url().max(500).nullable().optional(),
    ogImageKey: z.string().max(300).nullable().optional(),
    noindex: z.boolean().optional(),
  })
  .strict();

/**
 * Programme editable fields. Per-type because the pipeline is generic but the
 * content is not, a programme has a price, an article will have a body AST.
 */
export const ProgramDraftBody = z
  .object({
    name: z.string().min(2).max(160).optional(),
    slug: z
      .string()
      .min(2)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka dan tanda hubung')
      .optional(),
    summary: z.string().max(400).nullable().optional(),
    /** The paragraph under the title on the public page. */
    description: z.string().max(4000).nullable().optional(),
    body: z.string().max(20000).nullable().optional(),
    category: z.enum(['ACADEMIC', 'NON_ACADEMIC', 'CREATIVE']).optional(),
    levels: z
      .array(z.enum(['SD', 'SMP', 'SMA']))
      .min(1)
      .max(3)
      .optional(),
    durationMonths: z.number().int().min(1).max(60).optional(),
    cadence: z.string().max(120).nullable().optional(),
    /** Integer IDR. Never a float, money is integers everywhere in this system. */
    priceMonthly: z.number().int().min(0).max(1_000_000_000).optional(),
    /** A media library asset, not a bare storage key, see migration 0015. */
    coverId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada perubahan.' });

export type ListContentQueryInput = z.infer<typeof ListContentQuery>;
export type TransitionInput = z.infer<typeof TransitionBody>;
export type RestoreInput = z.infer<typeof RestoreBody>;
export type SeoInput = z.infer<typeof SeoBody>;
export type ProgramDraftInput = z.infer<typeof ProgramDraftBody>;

export interface ContentRow {
  id: string;
  type: string;
  title: string;
  slug: string | null;
  status: ContentStatus;
  version: number;
  publishAt: string | null;
  publishedAt: string | null;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  updatedAt: string | null;
}

/**
 * The consent record (doc 14 §3.7).
 *
 * Separate from the draft body for the same reason the SEO panel is: it is a
 * precondition of PUBLISHING, not part of what the reviewer approved. Folding
 * it into `updateDraft` would make it editable only while the article is a
 * DRAFT, so a Head who hits the consent gate at publish time, on an APPROVED
 * article, would have to reject it back down, record the consent, resubmit and
 * re-approve, purely to type one sentence.
 */
export const ConsentBody = z.object({
  /**
   * Where the consent came from, in the recorder's own words ("WhatsApp Bu Rani
   * 3 Agu 2026"). Free text on purpose: the point is that a human had a real
   * conversation, and a dropdown of channels invites picking one without it.
   */
  source: z.string().trim().min(3).max(300).nullable(),
  at: z.coerce.date().nullable().optional(),
});
export type ConsentInput = z.infer<typeof ConsentBody>;
