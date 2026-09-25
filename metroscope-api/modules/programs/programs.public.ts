import { sql } from 'drizzle-orm';
import { asAnon } from '@/lib/db/rls';
import { ApiError } from '@/lib/http/errors';
import { publicUrl } from '../media/media.service';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The public programme surface (doc 13 §9.4, doc 14 §2.5).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Same shape as `articles.public.ts`, and for the same reason: everything runs
 * inside `asAnon`, so **RLS decides what is public**. `programs_select_public`
 * says `is_published`, which 0012 made a GENERATED column over `status`, so
 * there is exactly one fact about whether a programme is live, and no query can
 * disagree with it by forgetting a predicate.
 *
 * A draft programme is not merely unlisted, it is unreadable: an unpublished
 * price is a commercial decision that has not been made yet, and the pipeline
 * exists so that it is a person who decides when it becomes public.
 */

const CARD = sql`
  p.id, p.slug, p.name, p.category::text AS category, p.levels,
  p.summary, p.description,
  p.duration_months AS "durationMonths", p.cadence,
  p.price_monthly AS "priceMonthly",
  p.published_at AS "publishedAt", p.updated_at AS "updatedAt",
  m.storage_key AS "coverKey", m.alt AS "coverAlt", m.width AS "coverWidth", m.height AS "coverHeight"
`;

const JOINS = sql`
  FROM programs p
  LEFT JOIN media_assets m ON m.id = p.cover_id
`;

/**
 * Postgres timestamps → ISO 8601, cover key → public URL.
 *
 * The same normalisation articles do, and the same reason: the driver returns
 * `2026-08-07 03:42:40.653811+00`, which `new Date()` parses happily, so every
 * visible date looks right while `datePublished` in the JSON-LD carries
 * something a crawler drops.
 */
const ISO_FIELDS = ['publishedAt', 'updatedAt'] as const;

function normalise<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map((r) => {
    const out: Record<string, unknown> = {
      ...r,
      coverUrl: r.coverKey ? publicUrl(String(r.coverKey)) : null,
    };
    for (const field of ISO_FIELDS) {
      const value = out[field];
      if (typeof value === 'string' || value instanceof Date) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) out[field] = date.toISOString();
      }
    }
    return out;
  });
}

/**
 * Every published programme, for the marketing index AND the registration
 * picker.
 *
 * One endpoint, not two. The picker needs `id`, `slug`, `name`, `levels` and
 * `priceMonthly`; the index needs those plus the marketing copy and cover. A
 * second endpoint for the picker is how the two lists end up disagreeing about
 * which programmes exist, which is exactly the bug the fixture used to cause,
 * where `/programs` advertised slugs the API had never heard of.
 *
 * `body` is excluded: it is long-form copy that only the detail page renders.
 */
export async function listPublicPrograms() {
  return asAnon(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT ${CARD} ${JOINS}
      ORDER BY p.price_monthly, p.name
    `);
    return { items: normalise(Array.from(rows) as Record<string, unknown>[]) };
  });
}

/**
 * One published programme, with SEO overrides and its own success stories.
 *
 * The stories are published ARTICLES carrying this `program_id`, the relation
 * 2.3 put on the article table. The fixture had a hand-written `porto` array
 * per programme (award, competition, year) with no source of truth behind it;
 * this replaces it with content that a real editorial workflow produces, and
 * adds no table to do it.
 */
export async function getPublicProgram(slug: string) {
  return asAnon(async (tx) => {
    const rows = await tx.execute<Record<string, unknown> & { id: string }>(sql`
      SELECT ${CARD}, p.body, p.locale,
             s.title AS "seoTitle", s.description AS "seoDescription",
             s.canonical AS "seoCanonical", s.og_image_key AS "seoOgImageKey",
             s.noindex AS "seoNoindex", s.json_ld AS "seoJsonLd"
      ${JOINS}
      LEFT JOIN seo_meta s ON s.entity_type = 'program' AND s.entity_id = p.id
      WHERE p.slug = ${slug}
    `);
    const row = Array.from(rows).at(0);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Program tidak ditemukan.');

    /**
     * Read through `asAnon` too, so an unpublished article about this programme
     * cannot surface on a public page by way of a join nobody thought about.
     */
    const stories = await tx.execute(sql`
      SELECT a.slug, a.title, a.excerpt, a.published_at AS "publishedAt",
             a.reading_min AS "readingMin",
             am.storage_key AS "coverKey", am.alt AS "coverAlt"
      FROM articles a
      LEFT JOIN media_assets am ON am.id = a.cover_id
      WHERE a.program_id = ${row.id}
      ORDER BY a.published_at DESC NULLS LAST
      LIMIT 3
    `);

    const [withUrl] = normalise([row]);
    return {
      ...withUrl,
      seoOgImageUrl: row.seoOgImageKey ? publicUrl(String(row.seoOgImageKey)) : null,
      stories: normalise(Array.from(stories) as Record<string, unknown>[]),
    };
  });
}
