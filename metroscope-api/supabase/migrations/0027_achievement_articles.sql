-- ═══════════════════════════════════════════════════════════════════════════
--  Achievement articles, the chained-authorship seam (doc 03 FR-UPD-4 /
--  FR-ART-8, doc 13 §10.5, doc 14 §3.7).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- FR-UPD-4, in full: "Recording a **win** emits `competition.result`, which
-- **auto-creates an `Article` DRAFT** in category *Prestasi Siswa* with student,
-- competition, result, and certificate pre-filled, assigned to the Editor
-- (FR-ART-8). The mentor never writes an article."
--
-- doc 13 §10.5 calls it "the single biggest content-ops efficiency gain
-- available, and it costs one event handler", implementing doc 11 §10.1's
-- chained authorship: **the mentor supplies facts, the Editor writes, the Head
-- approves.**
--
-- ## Why a trigger and not the outbox
--
-- The outbox exists for effects that leave this database, an email can fail,
-- needs retry, and must survive a crash. Inserting a DRAFT row does none of
-- that: it is a write to a table two feet away, inside the transaction that
-- caused it. A trigger therefore gives what an outbox here could only
-- approximate:
--
--   * **unbypassable**: every path that sets WINNER creates the draft, whether
--     that is the API, a migration, a psql session or a future bulk import.
--     Putting it in one HTTP route would make the invariant a property of one
--     call site rather than of the data;
--   * **exactly once, transactionally**: no window in which the result says
--     WINNER and the draft is missing, which is the misleading state §19 of the
--     brief names;
--   * **no delivery semantics to get wrong**: no retry, no dead letter, no
--     "processed" flag that can lie.
--
-- The uniqueness invariant below is what makes it safe under concurrency, which
-- an application-level `if (!existing) create` could never be.

-- ── the facts an article can be about ──────────────────────────────────
/**
 * `competition_id` is the column 0014 predicted.
 *
 * Its own comment said: "Facts an article can be about. `competitions` has no
 * table until Phase 3." §3.4 built the table; this is the foreign key it was
 * waiting for, and it is what doc 13 §10.9's related-article rule means by
 * "same program/competition".
 */
ALTER TABLE articles ADD COLUMN IF NOT EXISTS competition_id uuid
  REFERENCES competitions(id) ON DELETE SET NULL;

/**
 * The idempotency key, and the reason this is a database concern.
 *
 * One achievement article per competition target, per (student, competition),
 * which is exactly what `competition_targets` is unique on. Two concurrent
 * transitions to WINNER, a retried request, a double-clicked button and a
 * re-run of the same UPDATE all collide here rather than producing a second
 * draft about the same child winning the same lomba.
 *
 * A partial index because ordinary articles have no target and must not compete
 * for the constraint; `ON DELETE SET NULL` because withdrawing a participant is
 * not a reason to destroy editorial work somebody may already have written.
 */
ALTER TABLE articles ADD COLUMN IF NOT EXISTS competition_target_id uuid
  REFERENCES competition_targets(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS articles_competition_target_uq
  ON articles (competition_target_id) WHERE competition_target_id IS NOT NULL;

-- ── consent, before a child's name goes on the open web ────────────────
/**
 * The same two columns `testimonials` carries, for the same reason.
 *
 * doc 13 §9.4 makes the consent record part of what a testimonial is, because
 * a testimonial is a named parent talking about a named child. An achievement
 * article is a named child, their school, their placing and the date, the same
 * category of publication, and a stronger one, because the subject is the minor
 * rather than the person speaking.
 *
 * Deliberately scoped to ANY article naming a student, not to achievement
 * articles specifically. An editor who writes a profile piece about a child by
 * hand is publishing exactly the same thing, and a rule that only caught the
 * generated ones would be a rule about how the row was created rather than
 * about whose name is on it.
 *
 * Enforced at PUBLISH by `assertArticleReady`, the pipeline's existing
 * `beforeTransition` hook, which is also where the testimonial rule lives.
 */
ALTER TABLE articles ADD COLUMN IF NOT EXISTS consent_source text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS consent_at timestamptz;

CREATE INDEX IF NOT EXISTS articles_competition_idx ON articles (competition_id);


-- ── the trigger ────────────────────────────────────────────────────────
/**
 * Draft an achievement article when a target becomes a WINNER.
 *
 * **Only on the transition.** The WHEN clause on the trigger fires solely when
 * `result` actually changes into `WINNER`, so none of these produce a draft:
 * a readiness slider moving 20 → 80, a certificate arriving, a note being
 * edited, a second save of the same WINNER row, or any other column changing
 * while the result stands still. §3.4 made `recorded_by_id` move only when the
 * result moves; this is the same event, seen from the other side.
 *
 * **WINNER only.** `competition_result` has five values and only one of them is
 * a win. FINALIST and PARTICIPANT are real outcomes worth recording and are not
 * achievements to publish; inferring that "not PENDING" means "won" would put a
 * child's name on the website for turning up.
 *
 * SECURITY DEFINER with a pinned search_path: the insert happens as the table
 * owner because the mentor firing it holds no `/site` grant, and
 * `articles_write` would refuse them. That is correct, a mentor recording a
 * result is not an author, and this is the system drafting, not them.
 */
CREATE OR REPLACE FUNCTION app.draft_achievement_article()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  student_name  text;
  student_level text;
  comp_name     text;
  comp_level    text;
  comp_organizer text;
  category      uuid;
  base_slug     text;
  final_slug    text;
  suffix        int := 2;
  award_line    text;
  headline      text;
BEGIN
  SELECT s.name, s.level::text INTO student_name, student_level
  FROM students s WHERE s.id = NEW.student_id;

  -- The level is rendered in Indonesian, not as the enum. A parent reading the
  -- published article should not meet the word NATIONAL.
  SELECT c.name,
         CASE c.level
           WHEN 'SCHOOL' THEN 'Sekolah'
           WHEN 'REGIONAL' THEN 'Kabupaten/Kota'
           WHEN 'PROVINCIAL' THEN 'Provinsi'
           WHEN 'NATIONAL' THEN 'Nasional'
           WHEN 'INTERNATIONAL' THEN 'Internasional'
         END,
         c.organizer
    INTO comp_name, comp_level, comp_organizer
  FROM competitions c WHERE c.id = NEW.competition_id;

  SELECT id INTO category FROM article_categories WHERE slug = 'prestasi-siswa';

  /**
   * The headline uses the organiser's own words for the placing when the mentor
   * recorded them ("Juara 2", "Medali Perunggu"), and says only "Juara" when
   * they did not. Nothing here invents a rank: `award` is a column a human
   * filled in, and §3.4 refuses an award on a result that is not a win.
   */
  award_line := COALESCE(NULLIF(trim(NEW.award), ''), 'Juara');
  headline := student_name || ', ' || award_line || ' ' || comp_name;

  -- Accents folded inline rather than through an extension or a helper: the
  -- unaccent extension is not installed, and a slug is not a reason to need it.
  base_slug := regexp_replace(
    lower(translate(student_name || '-' || award_line || '-' || comp_name,
                    'áàâäãéèêëíìîïóòôöõúùûüçñÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ',
                    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  base_slug := left(base_slug, 110);
  IF base_slug = '' THEN base_slug := 'prestasi-siswa'; END IF;

  /**
   * The same slug policy `uniqueSlug()` implements in the service: the base,
   * then -2, -3… until free. Unique per (slug, locale), so an achievement can
   * never silently overwrite an ordinary article.
   */
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM articles a WHERE a.slug = final_slug AND a.locale = 'id') LOOP
    final_slug := left(base_slug, 108) || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;

  /**
   * `author_id` is NULL, and that is the point.
   *
   * FR-UPD-4 says the draft is "assigned to the Editor" and "the mentor never
   * writes an article". Stamping the mentor who recorded the result would put a
   * byline on a piece they did not write, doc 13 §10.5 wants a real byline for
   * E-E-A-T, and picking an arbitrary Editor would credit whoever the query
   * happened to return. The Editor who opens it sets themselves, and the
   * pipeline refuses to publish without one.
   *
   * Every value below is a column somebody recorded. No quotes, no scores that
   * were not entered, no invented dates.
   */
  INSERT INTO articles (
    title, slug, locale, excerpt, body, category_id, author_id,
    student_id, competition_id, competition_target_id, status
  )
  VALUES (
    headline,
    final_slug,
    'id',
    student_name || ' meraih ' || award_line || ' di ' || comp_name || '.',
    jsonb_build_object(
      'type', 'doc',
      'content', jsonb_build_array(
        jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
          jsonb_build_object('type', 'text', 'text',
            student_name
            || COALESCE(' (' || student_level || ')', '')
            || ' meraih ' || award_line || ' di ' || comp_name
            || COALESCE(' yang diselenggarakan ' || comp_organizer, '')
            || '.'))),
        jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
          jsonb_build_object('type', 'text', 'text',
            'Tingkat lomba: ' || COALESCE(comp_level, '-')
            || COALESCE('. Skor: ' || NEW.score::text, '')
            || '.'))),
        jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
          jsonb_build_object('type', 'text', 'text',
            'Draf ini dibuat otomatis dari hasil lomba yang dicatat mentor. '
            || 'Editor melengkapi ceritanya, dan artikel baru terbit setelah '
            || 'izin orang tua tercatat dan Ketua menyetujui.')))
      )
    ),
    category,
    NULL,
    NEW.student_id,
    NEW.competition_id,
    NEW.id,
    'DRAFT'
  )
  /**
   * The one line that makes concurrency safe.
   *
   * Two transactions racing to set WINNER both reach this INSERT; the partial
   * unique index lets exactly one through and turns the other into a no-op
   * rather than an error, so a legitimate second UPDATE never fails because a
   * draft already exists.
   */
  ON CONFLICT (competition_target_id) WHERE competition_target_id IS NOT NULL
  DO NOTHING;

  RETURN NULL;
END;
$$;


/**
 * Two triggers, not one, because a WHEN clause cannot ask which operation it is.
 *
 * `TG_OP` is only bound inside the function body, and `OLD` does not exist for
 * an INSERT, so a combined `AFTER INSERT OR UPDATE` trigger cannot express
 * "changed into WINNER" and "created as WINNER" in one condition. Splitting
 * them keeps each WHEN valid for its own operation and keeps the transition
 * test where the planner can use it, rather than pushing the decision into the
 * function where every unrelated UPDATE would pay for the call.
 *
 * The INSERT case is not hypothetical: a row can be created already won by a
 * data import or a correction, and the brief's rule is that ANY legitimate path
 * to WINNER drafts exactly once.
 */
DROP TRIGGER IF EXISTS competition_target_won ON competition_targets;
DROP TRIGGER IF EXISTS competition_target_won_insert ON competition_targets;
DROP TRIGGER IF EXISTS competition_target_won_update ON competition_targets;

CREATE TRIGGER competition_target_won_insert
AFTER INSERT ON competition_targets
FOR EACH ROW
WHEN (NEW.result = 'WINNER')
EXECUTE FUNCTION app.draft_achievement_article();

CREATE TRIGGER competition_target_won_update
AFTER UPDATE OF result ON competition_targets
FOR EACH ROW
WHEN (NEW.result = 'WINNER' AND OLD.result IS DISTINCT FROM 'WINNER')
EXECUTE FUNCTION app.draft_achievement_article();

COMMENT ON FUNCTION app.draft_achievement_article() IS
  'FR-UPD-4: a recorded win drafts an article. Transactional, transition-only, '
  'idempotent through articles_competition_target_uq. Draft is not publication.';
