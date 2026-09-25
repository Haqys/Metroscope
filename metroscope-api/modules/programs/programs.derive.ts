import { sql } from 'drizzle-orm';
import type { RequestContext } from '@/lib/auth/context';
import type { ContentTx } from '../content/content.registry';
import { syncMediaUsage } from '../media/media.usage';

/**
 * Programme-derived state (doc 14 §2.5).
 *
 * One job: keep `media_usage` in step with the cover, inside the same
 * transaction as the edit that changed it. Same hook articles use, same shared
 * helper underneath, the pipeline still knows nothing about either type.
 *
 * Articles need more from their hook (reading time from the body, tag
 * membership, images embedded in the AST). A programme's marketing copy is a
 * text column with no embeds, so there is nothing else to derive, and inventing
 * symmetry it does not need would be the wrong kind of tidy.
 */
export async function syncProgramDerived(
  tx: ContentTx,
  _ctx: RequestContext,
  id: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { coverId } = patch as { coverId?: string | null };

  /**
   * Only when the cover is actually part of this edit.
   *
   * `undefined` means "not mentioned" and must leave the existing usage row
   * alone; `null` means "removed" and must clear it. Treating the two the same
   * would drop the usage row on every unrelated save, a price change would
   * quietly make the hero image deletable.
   */
  if (coverId !== undefined) {
    await syncMediaUsage(tx, 'program', id, coverId ? [{ assetId: coverId, field: 'cover' }] : []);
  }

  return {};
}

/**
 * Release a programme's media usage when the row goes away.
 *
 * `media_usage` has no FK to the content it describes. It cannot, because it
 * points at many tables, so nothing cascades. Without this, deleting a
 * programme leaves a row claiming an image is in use, and that image can never
 * be deleted again.
 */
export async function releaseProgramMedia(tx: ContentTx, id: string): Promise<void> {
  await tx.execute(sql`
    DELETE FROM media_usage WHERE entity_type = 'program' AND entity_id = ${id}
  `);
}
