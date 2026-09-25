import type { RequestContext } from '@/lib/auth/context';

/**
 * The closed set of action verbs (doc 04 §8.5 / doc 12 §10.2).
 *
 * Page grants drive navigation; ACTION grants drive the API. Small enough to
 * render as checkboxes in /settings/roles, expressive enough to separate
 * reading a queue from acting on it.
 *
 * Hundreds of granular permissions were rejected: unusable UI, easy to
 * misconfigure, impossible to audit.
 */
export const ACTIONS = [
  'lead.approve',
  'lead.reject',
  'invoice.issue',
  'invoice.void',
  'payment.verify',
  'payment.record',
  'content.publish',
  'content.review',
  'user.manage',
  'role.manage',
  'student.edit',
  'session.manage',
  'assessment.submit',
  'progress.edit',
  /**
   * The seventeenth, added in §3.3.
   *
   * doc 13 §8.3 lists "assign material" among the Mentor's key actions and none
   * of the sixteen covered it. The alternative was to let the `/materials` page
   * grant authorise writes, which would have been the first place in this
   * codebase where a page grant meant permission rather than navigation, and the
   * rule it breaks is the one the verb layer exists to enforce.
   *
   * "Small and closed" is about not shipping hundreds of granular permissions
   * (see below); it is not about the number sixteen. /settings/roles renders
   * these as checkboxes, so this is one more checkbox.
   */
  'material.manage',
  'settings.edit',
  'data.export',
] as const;

export type Action = (typeof ACTIONS)[number];

export function hasAction(ctx: RequestContext, action: Action): boolean {
  return ctx.actions.includes(action);
}

/** Throwing variant for use inside services, where ctx is always present. */
export function assertAction(ctx: RequestContext, action: Action): void {
  if (!hasAction(ctx, action)) {
    throw new Error(`Missing required action grant: ${action}`);
  }
}
