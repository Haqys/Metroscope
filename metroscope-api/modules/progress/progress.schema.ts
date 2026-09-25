import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Progress, request shapes (doc 03 FR-UPD-1/2, doc 14 §3.6).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * What no body carries: `status`, `daysSinceUpdate`, `isStale`,
 * `updatedById`. The first three are derived by `app.progress_status()` from a
 * timestamp the server writes, and the fourth is pinned to the caller by
 * `progress_insert`. A client that could send "I am not stale" would be a
 * client that could lie about the one number this board exists to show.
 */

export const ProgressBoardQuery = z.object({
  /**
   * FR-UPD-1 names three states and this filters to them. `all` is the default
   * because the board's banner counts stale students while the list shows
   * everyone. One request, so the count and the rows cannot disagree.
   */
  status: z.enum(['all', 'never', 'stale', 'current']).default('all'),
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ProgressBoardInput = z.infer<typeof ProgressBoardQuery>;

/**
 * FR-UPD-2, "inline per-topic slider editing; no wizard required".
 *
 * A list of (topicId, percent) rather than a whole-student replacement: a
 * mentor who moves one slider should not have their save silently zero the
 * topics that were not on screen. `.min(1)` because an empty save is a save
 * that would still stamp `updated_at` and reset the staleness clock without
 * anybody having looked at anything.
 */
export const UpdateProgressBody = z.object({
  entries: z
    .array(
      z.object({
        topicId: z.string().uuid(),
        percent: z.number().int().min(0).max(100),
      }),
    )
    .min(1, 'Pilih minimal satu topik untuk diperbarui.')
    .max(100)
    .superRefine((entries, ctx) => {
      const seen = new Set<string>();
      for (const entry of entries) {
        if (seen.has(entry.topicId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Topik yang sama dikirim dua kali.',
          });
          return;
        }
        seen.add(entry.topicId);
      }
    }),
});
export type UpdateProgressInput = z.infer<typeof UpdateProgressBody>;

// ── topics (FR-UPD-2's prerequisite, see 0026) ─────────────────────────

export const CreateTopicBody = z.object({
  programId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  orderIndex: z.number().int().min(0).max(10_000).optional(),
});
export type CreateTopicInput = z.infer<typeof CreateTopicBody>;

export const UpdateTopicBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    orderIndex: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada yang diubah.' });
export type UpdateTopicInput = z.infer<typeof UpdateTopicBody>;
