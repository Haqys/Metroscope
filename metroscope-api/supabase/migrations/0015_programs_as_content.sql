-- ═══════════════════════════════════════════════════════════════════════════
--  Programmes as CMS content (doc 13 §9.4, doc 14 §2.5).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 2.1 gave programmes the pipeline columns; this gives them the two things an
-- editor actually needs and the public pages cannot do without.

/**
 * A cover from the media library, replacing `hero_image_key`.
 *
 * `hero_image_key` was a bare storage key typed into a text column: nothing
 * checked the object existed, nothing recorded that the programme used it, and
 * `media_usage`, the whole reason 2.2 can answer "is this image safe to
 * delete?", never saw it. So deleting an image out of the library would leave
 * a live programme page rendering a broken hero, and nothing would have warned
 * the person deleting it.
 *
 * A FK to `media_assets` makes the reference real, and the registry's
 * `onDraftUpdate` hook now writes `media_usage` for programmes exactly as it
 * does for articles.
 */
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS cover_id uuid REFERENCES media_assets(id) ON DELETE SET NULL;

/**
 * Nothing to migrate: `hero_image_key` was added in 0012 and no editor UI ever
 * wrote to it, so every row is NULL. Asserted rather than assumed, a silent
 * data loss during a column swap is not something to discover later.
 */
DO $$
DECLARE stragglers integer;
BEGIN
  SELECT count(*) INTO stragglers FROM programs WHERE hero_image_key IS NOT NULL;
  IF stragglers > 0 THEN
    RAISE EXCEPTION 'hero_image_key holds % row(s); migrate them before dropping', stragglers;
  END IF;
END $$;

ALTER TABLE programs DROP COLUMN IF EXISTS hero_image_key;

CREATE INDEX IF NOT EXISTS programs_cover_idx ON programs (cover_id);

/**
 * `updated_at`, so the CMS list can say when a programme was last touched.
 *
 * Articles have had one since 0014 and programmes did not, which forced
 * `listContent`, the query that is supposed to know nothing about content
 * types, to select `created_at AS "updatedAt"` for everything. The editorial
 * list therefore showed a programme's CREATION date under a column headed
 * "diperbarui", which is wrong in the quiet way: it looks like a date, it is a
 * date, and it answers a different question.
 */
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE programs SET updated_at = created_at WHERE updated_at < created_at;
