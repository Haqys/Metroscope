import { sql } from 'drizzle-orm';
import { ApiError } from '@/lib/http/errors';
import type { ContentTx } from '../content/content.registry';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Reconcile `media_usage` for one piece of content (doc 14 §2.2, §2.5).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Usage is what makes "is this image safe to delete?" answerable, the media
 * module refuses to delete an asset that anything still points at. Whoever
 * places the image writes the join, because 2.2's contract is that media stays
 * content-type agnostic: it knows an asset is used, never by what.
 *
 * Extracted from `articles.derive.ts` in 2.5, when programme covers became the
 * second consumer. It stayed inside articles while there was only one, an
 * abstraction with a single caller is a guess about the second, and this one
 * turned out to need a different `field` vocabulary, which is exactly the sort
 * of thing a premature extraction gets wrong.
 *
 * Rewritten wholesale rather than diffed. A piece of content references a
 * handful of images, and a diff that drifts leaves a phantom row protecting an
 * image nothing uses, which is worse than the write it saves, because it
 * fails closed forever and looks like the guard working.
 */
export interface MediaUse {
  assetId: string;
  /** Where it sits, `cover`, `body`, `hero`. Free-form, per content type. */
  field: string;
}

export async function syncMediaUsage(
  tx: ContentTx,
  entityType: string,
  entityId: string,
  uses: MediaUse[],
): Promise<void> {
  if (uses.length === 0) {
    await tx.execute(sql`
      DELETE FROM media_usage WHERE entity_type = ${entityType} AND entity_id = ${entityId}
    `);
    return;
  }

  const assetIds = [...new Set(uses.map((u) => u.assetId))];
  const list = sql.join(
    assetIds.map((i) => sql`${i}::uuid`),
    sql`, `,
  );

  /**
   * A referenced asset must exist, checked before the write.
   *
   * Left to the FK, an id the caller invented surfaces as a 500 naming a
   * constraint, and the editor is told nothing about which image was wrong.
   */
  const known = await tx.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM media_assets WHERE id IN (${list})
  `);
  if (((Array.from(known) as { n: number }[]).at(0)?.n ?? 0) !== assetIds.length) {
    throw new ApiError(422, 'UNKNOWN_MEDIA', 'Ada gambar yang tidak ada di pustaka media.');
  }

  const pairs = sql.join(
    uses.map((u) => sql`(${u.assetId}::uuid, ${u.field})`),
    sql`, `,
  );

  await tx.execute(sql`
    DELETE FROM media_usage
    WHERE entity_type = ${entityType} AND entity_id = ${entityId}
      AND (asset_id, field) NOT IN (${pairs})
  `);

  await tx.execute(sql`
    INSERT INTO media_usage (asset_id, entity_type, entity_id, field)
    VALUES ${sql.join(
      uses.map((u) => sql`(${u.assetId}::uuid, ${entityType}, ${entityId}::uuid, ${u.field})`),
      sql`, `,
    )}
    ON CONFLICT (asset_id, entity_type, entity_id, field) DO NOTHING
  `);
}
