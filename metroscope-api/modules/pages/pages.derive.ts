import { sql } from 'drizzle-orm';
import type { RequestContext } from '@/lib/auth/context';
import type { ContentTx } from '../content/content.registry';
import { syncMediaUsage } from '../media/media.usage';
import { mediaIdsIn } from './blocks.registry';

/**
 * Page-derived state (doc 14 §2.6).
 *
 * A page holds no images of its own, every picture lives in a block's props.
 * So `media_usage` is reconciled from the BLOCKS, and it has to be recomputed
 * whenever a block changes, not only when the page row does.
 *
 * `syncPageMedia` is therefore called from the block writers as well as from
 * the pipeline's draft hook. Both go through the shared helper, so the delete
 * guard in 2.2 protects a picture placed in a block exactly as it protects an
 * article cover.
 */
export async function syncPageMedia(tx: ContentTx, pageId: string): Promise<void> {
  const rows = await tx.execute<{ props: unknown }>(sql`
    SELECT props FROM page_blocks WHERE page_id = ${pageId}
  `);

  /**
   * De-duplicated across blocks, because `media_usage` is keyed by
   * (asset, entity, field) and the same picture may legitimately appear in two
   * blocks on one page. One row per asset per page is the fact worth storing:
   * the question the guard asks is "does anything still use this?", not "how
   * many times".
   */
  const ids = new Set<string>();
  for (const row of Array.from(rows) as { props: unknown }[]) {
    for (const id of mediaIdsIn(row.props)) ids.add(id);
  }

  await syncMediaUsage(
    tx,
    'page',
    pageId,
    [...ids].map((assetId) => ({ assetId, field: 'block' })),
  );
}

/**
 * The registry's `onDraftUpdate` hook for pages.
 *
 * The page row itself carries only a title, a slug and a description, so there
 * is nothing to derive from a patch of it, but the hook still runs the media
 * reconciliation. That covers the case a block writer cannot: restoring an old
 * version rewrites the page through the pipeline, and its blocks with it.
 */
export async function syncPageDerived(
  tx: ContentTx,
  _ctx: RequestContext,
  id: string,
  _patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await syncPageMedia(tx, id);
  return {};
}
