import { sql } from 'drizzle-orm';
import { ApiError } from '@/lib/http/errors';
import type { RequestContext } from '@/lib/auth/context';
import type { ContentTx } from '../content/content.registry';
import { syncMediaUsage } from '../media/media.usage';

/**
 * Derived state for the §2.7 collections (doc 14 §2.7).
 *
 * One job each, and it is the same job programmes have: keep `media_usage` in
 * step with a single photo, inside the transaction that changed it. Same shared
 * helper, so the 2.2 delete guard protects a testimonial photo exactly as it
 * protects an article cover.
 */

/**
 * `undefined` means "not mentioned"; `null` means "removed".
 *
 * Collapsing them would release the photo on every unrelated save, reordering
 * a testimonial would quietly make its picture deletable. The programme hook
 * makes the same distinction for the same reason.
 */
async function syncPhoto(tx: ContentTx, entityType: string, id: string, patch: unknown) {
  const { photoId } = patch as { photoId?: string | null };
  if (photoId === undefined) return;
  await syncMediaUsage(tx, entityType, id, photoId ? [{ assetId: photoId, field: 'photo' }] : []);
}

export async function syncTestimonialDerived(
  tx: ContentTx,
  _ctx: RequestContext,
  id: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await syncPhoto(tx, 'testimonial', id, patch);
  return {};
}

export async function syncMentorDerived(
  tx: ContentTx,
  _ctx: RequestContext,
  id: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await syncPhoto(tx, 'mentor', id, patch);
  return {};
}

/**
 * A testimonial may not be published without a recorded consent source.
 *
 * doc 13 §9.4 calls the consent record part of what `/site/testimonials`
 * manages, and §10.2 moved `consentSource`/`consentAt` onto this model
 * deliberately. This is the one content type where the missing field is not a
 * quality problem but a permission problem: the quote names a parent and often
 * their child, and "we will add the consent note later" means publishing
 * something nobody can prove permission for.
 *
 * Enforced at PUBLISH rather than at INSERT, a draft being written legitimately
 * has no consent note yet, and enforced in the registry's guard so it applies
 * to the scheduled-publish cron too, not only to the button.
 */
export async function assertTestimonialConsent(tx: ContentTx, id: string): Promise<void> {
  const rows = await tx.execute<{ consent_source: string | null }>(sql`
    SELECT consent_source FROM testimonials WHERE id = ${id}
  `);
  const row = (Array.from(rows) as { consent_source: string | null }[]).at(0);
  if (!row?.consent_source?.trim()) {
    throw new ApiError(
      422,
      'CONSENT_REQUIRED',
      'Testimoni butuh catatan izin sebelum terbit, tulis dari mana persetujuannya didapat.',
    );
  }
}
