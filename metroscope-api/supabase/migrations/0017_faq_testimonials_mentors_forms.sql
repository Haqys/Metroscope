-- ═══════════════════════════════════════════════════════════════════════════
--  The remaining public surfaces (doc 13 §9.2, §9.4, doc 14 §2.7).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- doc 13 §9.2 puts Testimonials, Mentors and FAQ in Tier 2, "many rows, list +
-- editor", and says every Tier-1 and Tier-2 item shares ONE editorial
-- pipeline. So each of these gets the same status/version/review columns
-- `articles`, `programs` and `pages` already carry, and each becomes a registry
-- entry rather than a second publishing system.
--
-- `/contact` and `/competitions` deliberately get NO table here. The contact
-- PAGE is a CMS page (§2.6) carrying a `contact_form` block; only its
-- SUBMISSIONS need storage. Competitions are Phase 3, see doc 14 §2.7.

/**
 * FAQ, doc 13 §9.4: "Q&A, categorised, used on /faq + portal Help + JSON-LD".
 *
 * No slug and no public URL of its own: an entry is rendered inside `/faq` and
 * inside a `faq_accordion` block, never at an address of its own. Its registry
 * entry therefore declares `publicPath: null`, which the pipeline already
 * handles, a type without a URL simply never writes a redirect.
 */
CREATE TABLE IF NOT EXISTS faq_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question    text NOT NULL,
  answer      text NOT NULL,
  /** Free-text grouping for the accordion. Not a table: an FAQ has a handful. */
  category    text,
  order_index integer NOT NULL DEFAULT 0,
  locale      text NOT NULL DEFAULT 'id',

  status         content_status NOT NULL DEFAULT 'DRAFT',
  publish_at     timestamptz,
  published_at   timestamptz,
  review_note    text,
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at    timestamptz,
  version        integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faq_entries_order_idx ON faq_entries (status, order_index);

/**
 * Testimonials, doc 13 §9.4: "Parent testimonials + **consent record**".
 *
 * The consent columns are the point, not decoration. These are quotes from
 * named parents about named children, and doc 13 §10.2 moved
 * `consentSource`/`consentAt` here deliberately. A testimonial without a
 * recorded consent source is one nobody can prove permission for, so the
 * pipeline requires it before publication rather than after a complaint.
 */
CREATE TABLE IF NOT EXISTS testimonials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote         text NOT NULL,
  author_name   text NOT NULL,
  /** "Orang tua Aditya, SMP", context, not an account reference. */
  author_role   text,
  program_id    uuid REFERENCES programs(id) ON DELETE SET NULL,
  photo_id      uuid REFERENCES media_assets(id) ON DELETE SET NULL,

  /** How permission was obtained, and when. Free text: it is a record, not an enum. */
  consent_source text,
  consent_at     timestamptz,

  featured      boolean NOT NULL DEFAULT false,
  order_index   integer NOT NULL DEFAULT 0,
  locale        text NOT NULL DEFAULT 'id',

  status         content_status NOT NULL DEFAULT 'DRAFT',
  publish_at     timestamptz,
  published_at   timestamptz,
  review_note    text,
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at    timestamptz,
  version        integer NOT NULL DEFAULT 0,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS testimonials_order_idx ON testimonials (status, order_index);
CREATE INDEX IF NOT EXISTS testimonials_photo_idx ON testimonials (photo_id);

/**
 * Mentor profiles, doc 13 §9.4: "Public mentor profiles (from `User.bio`,
 * `photoUrl`)".
 *
 * A SEPARATE table rather than public columns on `users`, and the separation is
 * the security design. `users` holds guardian emails and phone numbers, and it
 * is closed to `anon` for that reason, §2.4 had to add a narrow SECURITY
 * DEFINER helper just to print an article byline. Putting public marketing copy
 * in that table would mean every public mentor query reaches into the table
 * that must never be publicly readable, and the only thing standing between the
 * two would be a column list somebody could widen by accident.
 *
 * Here `anon` reads `mentor_profiles` and never touches `users` at all. The
 * link is one FK, used internally to know which staff member a profile is for.
 */
CREATE TABLE IF NOT EXISTS mentor_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** One public profile per account. */
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  slug        text NOT NULL,
  /** Public display name, NOT read from `users.full_name` at render time. */
  display_name text NOT NULL,
  headline    text,
  bio         text,
  photo_id    uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  /** "OSN Matematika", "Debat", what a parent is choosing between. */
  specialisms text[] NOT NULL DEFAULT '{}',

  order_index integer NOT NULL DEFAULT 0,
  locale      text NOT NULL DEFAULT 'id',

  status         content_status NOT NULL DEFAULT 'DRAFT',
  publish_at     timestamptz,
  published_at   timestamptz,
  review_note    text,
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at    timestamptz,
  version        integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mentor_profiles_slug_locale_key UNIQUE (slug, locale)
);

CREATE INDEX IF NOT EXISTS mentor_profiles_order_idx ON mentor_profiles (status, order_index);
CREATE INDEX IF NOT EXISTS mentor_profiles_photo_idx ON mentor_profiles (photo_id);

/**
 * Contact submissions, doc 13 §9.4: "/site/forms · Contact/consultation
 * submissions inbox".
 *
 * NOT a registry entry, and not editorial content: a submission is a message
 * from the public, not something anybody drafts, reviews or publishes. It has
 * no status pipeline for the same reason a lead does not. It is handled, not
 * released.
 *
 * This table holds names, emails and phone numbers typed by members of the
 * public. It is never readable by `anon` under any condition, and the public
 * endpoint that writes it returns nothing but an acknowledgement.
 */
CREATE TABLE IF NOT EXISTS form_submissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** Which form. One table, because the inbox question is the same for all. */
  kind       text NOT NULL DEFAULT 'CONTACT',

  name       text NOT NULL,
  email      text,
  phone      text,
  message    text NOT NULL,
  /** The page the visitor submitted from, for context in the inbox. */
  source_path text,

  handled     boolean NOT NULL DEFAULT false,
  handled_by_id uuid REFERENCES users(id),
  handled_at  timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- A message with no way to reply to it is not actionable.
  CONSTRAINT form_submissions_reachable CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS form_submissions_inbox_idx
  ON form_submissions (handled, created_at DESC);

ALTER TABLE faq_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
