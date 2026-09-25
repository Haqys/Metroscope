-- ═══════════════════════════════════════════════════════════════════════════
--  Pages and blocks (doc 13 §9.3, doc 14 §2.6).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- doc 13 §9.3: "Homepage and landing pages must be composed of reusable blocks,
-- not fixed fields, otherwise every marketing experiment is an engineering
-- ticket."
--
-- Pages join the pipeline built in 2.1 rather than bringing their own: the
-- status, version, publish_at, published_at and review columns are the same
-- shape `programs` and `articles` use, so `content.service.ts` needs no branch.

CREATE TABLE IF NOT EXISTS pages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  slug         text NOT NULL,
  /** doc 13 §9.6, the column now, the translation UI much later. */
  locale       text NOT NULL DEFAULT 'id',

  title        text NOT NULL,
  /** Editor-facing note. Never rendered. It explains what the page is for. */
  description  text,

  -- ── the shared pipeline's columns (2.1) ──
  status         content_status NOT NULL DEFAULT 'DRAFT',
  publish_at     timestamptz,
  published_at   timestamptz,
  review_note    text,
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at    timestamptz,
  version        integer NOT NULL DEFAULT 0,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pages_slug_locale_key UNIQUE (slug, locale)
);

CREATE INDEX IF NOT EXISTS pages_status_idx ON pages (status, slug);

/**
 * A block is a typed, ordered, positioned fragment of a page.
 *
 * `props` is jsonb and validated per `type` by Zod in the API, the database
 * cannot express "these keys when type='hero', those when type='stat_row'", and
 * a table per block type would make adding one a migration instead of a schema
 * plus a component (doc 13 §9.3: "Adding a block type is one Zod schema + one
 * React component + one registry entry").
 *
 * `type` is deliberately NOT a Postgres enum. The set grows as marketing needs
 * grow, and an enum makes each addition a migration with a lock, while the
 * value is already constrained by a closed registry the API refuses to look
 * past. The constraint that matters lives where the props are validated.
 */
CREATE TABLE IF NOT EXISTS page_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  type       text NOT NULL,

  /**
   * Sparse ordering, not 1,2,3.
   *
   * Blocks are created at multiples of 100 so a reorder rewrites only the rows
   * that moved. Consecutive integers force a renumber of everything after the
   * insertion point, and two editors reordering at once then fight over rows
   * neither of them touched.
   */
  order_index integer NOT NULL DEFAULT 0,
  props       jsonb NOT NULL DEFAULT '{}'::jsonb,

  /**
   * Visibility, and the window it applies in (doc 13 §9.3, seasonal
   * campaigns). A block hidden by date needs no republish to appear or go: the
   * public read filters on it, so an enrolment banner can be scheduled once and
   * left alone.
   */
  visible      boolean NOT NULL DEFAULT true,
  visible_from  timestamptz,
  visible_until timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A window that ends before it starts hides the block forever, silently.
  CONSTRAINT page_blocks_window_valid
    CHECK (visible_from IS NULL OR visible_until IS NULL OR visible_from < visible_until)
);

CREATE INDEX IF NOT EXISTS page_blocks_page_idx ON page_blocks (page_id, order_index);

/**
 * Preview grants: a signed, expiring right to read ONE unpublished page.
 *
 * doc 13 §9.5 asks for a "shareable link with expiry so the Head can review on
 * a phone". The token is stored hashed for the same reason a password is: this
 * table is readable by staff, and a plaintext token in a row is a working key
 * to unpublished content for anyone who can see it.
 *
 * Scoped to one entity, so a leaked link exposes the page it was made for and
 * nothing else, not the drafts of everything.
 */
CREATE TABLE IF NOT EXISTS preview_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_by_id uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS preview_grants_expiry_idx ON preview_grants (expires_at);

ALTER TABLE pages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_blocks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE preview_grants ENABLE ROW LEVEL SECURITY;
