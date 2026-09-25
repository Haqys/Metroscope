-- ═══════════════════════════════════════════════════════════════════════════
--  Media library (doc 13 §9.7, doc 14 §2.2).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tier 3 of the content model, and deliberately the tier that knows nothing
-- about the other two. No column here names an article, a page or a programme:
-- media is a shared subsystem those types consume, not a feature of any of them.
-- `media_usage` records what points at an asset using the same
-- (entity_type, entity_id) shape `content_versions` and `seo_meta` use.

CREATE TABLE IF NOT EXISTS media_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /** Path inside the bucket. Server-chosen, never client-supplied. */
  storage_key  text NOT NULL UNIQUE,
  mime_type    text NOT NULL,
  size_bytes   integer NOT NULL DEFAULT 0,
  /** Intrinsic pixels, read by the browser at upload. NULL for non-images. */
  width        integer,
  height       integer,

  /**
   * Alt text. Nullable in the column, REQUIRED before an image may be used, 
   * doc 13 §9.7 makes it an accessibility and SEO gate rather than a field
   * somebody fills in later and never does. `is_ready` below is the gate.
   */
  alt          text,
  caption      text,
  title        text NOT NULL,
  folder       text,

  /**
   * Focal point as fractions of width/height, defaulting to centre. Cropping a
   * hero to a phone viewport otherwise decapitates people.
   */
  focal_x      real NOT NULL DEFAULT 0.5,
  focal_y      real NOT NULL DEFAULT 0.5,

  /** Content hash, so re-uploading the same file finds the existing asset. */
  checksum     text,

  /**
   * The upload is direct-to-storage, so a row exists before its bytes do.
   * PENDING rows are invisible to every consumer and swept by their absence of
   * a confirmation, without this an interrupted upload leaves a broken image
   * in the library that looks perfectly normal until somebody places it.
   */
  status       text NOT NULL DEFAULT 'PENDING',

  uploaded_by_id uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  /**
   * Soft delete. An asset is never removed while anything might still point at
   * it, a hard delete would turn every published page using it into a broken
   * image with no way back.
   */
  deleted_at   timestamptz,

  CONSTRAINT media_status_valid CHECK (status IN ('PENDING', 'READY')),
  CONSTRAINT media_focal_range CHECK (
    focal_x BETWEEN 0 AND 1 AND focal_y BETWEEN 0 AND 1
  )
);

CREATE INDEX IF NOT EXISTS media_assets_browse_idx
  ON media_assets (deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_folder_idx ON media_assets (folder);
/**
 * Dedupe lookup. Partial, because only live assets should match: re-uploading
 * a file you previously deleted should give you a fresh asset, not resurrect
 * the deleted one behind your back.
 */
CREATE INDEX IF NOT EXISTS media_assets_checksum_idx
  ON media_assets (checksum) WHERE deleted_at IS NULL;

/**
 * Where an asset is used, "can I delete this?" answered with a list rather
 * than a guess (doc 13 §9.7).
 *
 * Generic by construction: nothing here references a content table, so
 * articles and pages register usage in Phase 2.3/2.6 without this migration
 * changing. Nothing writes to it yet, and that is correct. There is nothing
 * to attach media to until those tasks land.
 */
CREATE TABLE IF NOT EXISTS media_usage (
  asset_id    uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  field       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, entity_type, entity_id, field)
);

CREATE INDEX IF NOT EXISTS media_usage_entity_idx ON media_usage (entity_type, entity_id);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_usage  ENABLE ROW LEVEL SECURITY;
