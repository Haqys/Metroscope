-- ═══════════════════════════════════════════════════════════════════════════
--  Article system (doc 13 §10, doc 14 §2.3).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- doc 13 §10.1: the old `Content { type, title, body, status }` could store an
-- article but could not run a content operation, no slug (so no URL), no
-- excerpt (so no card or meta description), no category or tag (so no browsing
-- and no internal linking), no author (so no E-E-A-T signal), no versions.
--
-- Articles join the pipeline built in 2.1 rather than bringing their own:
-- `status`, `version`, `publish_at`, `published_at` and the review columns are
-- the same shape `programs` uses, so `content.service.ts` needs no new branch.

/**
 * Category = navigation, tag = SEO clustering (doc 13 §10.3).
 *
 * One category per article, many tags. Letting both be many is the most common
 * failure in blog IA: the navigation stops being a tree and every article
 * appears everywhere.
 */
CREATE TABLE IF NOT EXISTS article_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  slug         text NOT NULL,
  /** doc 13 §9.6, the column now, the translation UI much later. */
  locale       text NOT NULL DEFAULT 'id',

  title        text NOT NULL,
  subtitle     text,
  /**
   * Required by the product, nullable in the column.
   *
   * It is the card copy AND the meta description, so an article without one
   * renders an empty card and lets a search engine invent the snippet. The
   * pipeline enforces it at SUBMIT rather than at INSERT, a draft you have
   * just started legitimately has no excerpt yet.
   */
  excerpt      text,

  /**
   * TipTap / ProseMirror document, stored as its portable JSON AST.
   *
   * Not HTML: sanitising user HTML is a permanent liability and it cannot be
   * rendered structurally. Not Markdown: the editors are not technical and
   * embeds get ugly (doc 13 §10.4).
   */
  body         jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,

  cover_id     uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  category_id  uuid REFERENCES article_categories(id),
  author_id    uuid REFERENCES users(id),

  featured     boolean NOT NULL DEFAULT false,
  /** Manual ordering on the index. NULL sorts after everything pinned. */
  pinned_rank  integer,
  /** Computed from the AST on every save, never trusted from the client. */
  reading_min  integer NOT NULL DEFAULT 1,

  /** Facts an article can be about. `competitions` has no table until Phase 3. */
  student_id   uuid REFERENCES students(id) ON DELETE SET NULL,
  program_id   uuid REFERENCES programs(id) ON DELETE SET NULL,

  -- ── the shared pipeline's columns (2.1) ──
  status         content_status NOT NULL DEFAULT 'DRAFT',
  publish_at     timestamptz,
  published_at   timestamptz,
  review_note    text,
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at    timestamptz,
  version        integer NOT NULL DEFAULT 0,

  view_count   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  /**
   * Unique per locale, not globally: the Indonesian and English versions of an
   * article share a slug by design (doc 13 §9.6).
   */
  CONSTRAINT articles_slug_locale_key UNIQUE (slug, locale)
);

CREATE INDEX IF NOT EXISTS articles_status_idx ON articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS articles_category_idx ON articles (category_id, status);
CREATE INDEX IF NOT EXISTS articles_cover_idx ON articles (cover_id);

/**
 * Full-text search over the parts a human searches by.
 *
 * The body is deliberately excluded: it is a JSON AST, and `to_tsvector` over
 * the raw JSON indexes node type names ("paragraph", "heading") as if they were
 * words. Title, subtitle and excerpt are what an editor actually remembers.
 */
CREATE INDEX IF NOT EXISTS articles_search_idx ON articles
  USING gin (to_tsvector('simple',
    coalesce(title, '') || ' ' || coalesce(subtitle, '') || ' ' || coalesce(excerpt, '')));

CREATE TABLE IF NOT EXISTS article_tags (
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

CREATE INDEX IF NOT EXISTS article_tags_tag_idx ON article_tags (tag_id);

-- The seed set from doc 13 §10.3. Idempotent so re-running is safe.
INSERT INTO article_categories (slug, name, order_index) VALUES
  ('prestasi-siswa',     'Prestasi Siswa',     1),
  ('tips-lomba',         'Tips Lomba',         2),
  ('panduan-orang-tua',  'Panduan Orang Tua',  3),
  ('info-lomba',         'Info Lomba',         4),
  ('profil-mentor',      'Profil Mentor',      5),
  ('kegiatan-metroscope','Kegiatan Metroscope',6)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE articles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags       ENABLE ROW LEVEL SECURITY;
