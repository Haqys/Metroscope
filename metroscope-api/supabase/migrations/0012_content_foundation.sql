-- ═══════════════════════════════════════════════════════════════════════════
--  Content foundation. One editorial pipeline for every content type.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- doc 13 §9.2 stakes the CMS on a single shared pipeline: the same review flow,
-- the same audit trail, the same revalidation hook, whether the thing being
-- published is a programme, an article or a page. Five content types each with
-- their own status column is how a CMS becomes unmaintainable at the sixth.
--
-- This migration creates the spine. Programmes are its first consumer (doc 14
-- §2.5); articles, pages and media attach to the same tables.

-- ── the editorial state machine (doc 13 §9.2) ──────────────────────────
DO $$ BEGIN
  CREATE TYPE content_status AS ENUM (
    'DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

/**
 * An immutable snapshot per publish, so "restore this version" is one click
 * and so an accidental publish is recoverable without a database restore.
 *
 * `entity_type` is text rather than a foreign key on purpose: the whole point
 * is that one table serves programmes, articles, pages and anything added
 * later. The cost is no referential integrity, which is acceptable for an
 * append-only audit structure that is never joined for correctness.
 */
CREATE TABLE IF NOT EXISTS content_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  version     integer NOT NULL,
  snapshot    jsonb NOT NULL,
  author_id   uuid REFERENCES users(id),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, version)
);

CREATE INDEX IF NOT EXISTS content_versions_entity_idx
  ON content_versions (entity_type, entity_id, version DESC);

/**
 * Per-entity SEO overrides. Everything here is OPTIONAL, the renderer derives
 * sensible values from the content itself and uses these only when set, so an
 * editor who ignores this panel still gets correct metadata (doc 13 §10.7).
 */
CREATE TABLE IF NOT EXISTS seo_meta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  title         text,
  description   text,
  canonical     text,
  og_image_key  text,
  noindex       boolean NOT NULL DEFAULT false,
  json_ld       jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

/**
 * 301s, written automatically when a published slug changes (doc 13 §10.8).
 *
 * Without this every rename silently drops the rankings the article earned, 
 * the most expensive kind of quiet failure for a business that acquires
 * customers through content.
 */
CREATE TABLE IF NOT EXISTS redirects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path   text NOT NULL UNIQUE,
  to_path     text NOT NULL,
  status_code integer NOT NULL DEFAULT 301,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redirects_status_code_valid CHECK (status_code IN (301, 302, 307, 308)),
  -- A redirect to itself is an infinite loop the moment it is deployed.
  CONSTRAINT redirects_not_self CHECK (from_path <> to_path)
);

-- ── programmes join the pipeline ───────────────────────────────────────

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS status content_status NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS hero_image_key text,
  ADD COLUMN IF NOT EXISTS publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0,
  /** doc 13 §9.6, build the column, not the UI. Costs nothing now. */
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'id';

-- Anything already visible was published; everything else starts as a draft.
UPDATE programs SET status = 'PUBLISHED', published_at = COALESCE(published_at, created_at)
WHERE is_published AND status = 'DRAFT';

/**
 * `is_published` becomes DERIVED, not a second source of truth.
 *
 * It is load-bearing: `programs_select_public USING (is_published)` is what
 * lets `anon` read the catalogue, and `GET /v1/public/programs` filters on it.
 * Adding `status` beside it would create two columns that must agree, and the
 * day they disagree is the day an unpublished price is public.
 *
 * A generated column keeps every existing policy and query working untouched
 * while making `status` the only thing anyone writes.
 */
/**
 * Four policies read this column and must be dropped before it can be swapped:
 * `programs_select_public`, `programs_select`, and both `topics_*` policies,
 * which reach through to `programs.is_published`.
 *
 * They are NOT recreated here. `supabase/policies/30_master_data.sql` is their
 * only home and `npm run db:policies` re-applies the whole directory on every
 * deploy, defining them in a migration too is the exact duplication that
 * silently reverted the invoice money-guard in 0006–0008. The deploy order is
 * migrate → policies, so the gap closes in the same release.
 *
 * The predicates themselves do not change: `is_published` still exists and
 * still means the same thing. Only its authorship moves.
 */
DROP POLICY IF EXISTS programs_select_public ON programs;
DROP POLICY IF EXISTS programs_select ON programs;
DROP POLICY IF EXISTS topics_select_public ON topics;
DROP POLICY IF EXISTS topics_select ON topics;

ALTER TABLE programs DROP COLUMN IF EXISTS is_published;
ALTER TABLE programs
  ADD COLUMN is_published boolean
  GENERATED ALWAYS AS (status = 'PUBLISHED') STORED;

CREATE INDEX IF NOT EXISTS programs_status_idx ON programs (status, published_at DESC);

-- ── RLS on, policies live in supabase/policies/ ────────────────────────
ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_meta         ENABLE ROW LEVEL SECURITY;
ALTER TABLE redirects        ENABLE ROW LEVEL SECURITY;
