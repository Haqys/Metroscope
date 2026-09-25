-- ═══════════════════════════════════════════════════════════════════════════
--  Competitions (doc 13 §12.8, doc 14 §3.4).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two populations with almost nothing in common read these tables. The
-- catalogue is a marketing asset, doc 13 §5.1 calls the public competition
-- calendar "the single best organic lead magnet Metroscope owns", so `anon`
-- reads published rows. Everything hanging off it names a child, and none of
-- those tables is reachable by `anon` at all: migration 0023 grants them to
-- `authenticated` only, so these policies are the second gate, not the first.
--
-- The write split is the interesting part and it is deliberate:
--
--   catalogue            → the `/site` page grant + the CMS pipeline's verbs
--   roster (who enters)  → `student.edit`. Secretary work (doc 13 §8.3)
--   readiness & result   → `progress.edit`. Mentor work  (doc 13 §8.3)
--
-- A Secretary can enter a child in a lomba and cannot invent their result; a
-- Mentor can record the result and cannot quietly add a participant. Both are
-- things the roles' own definitions ask for, and one verb covering both would
-- have made the distinction unenforceable.

-- ── the catalogue ──────────────────────────────────────────────────────
/**
 * Published competitions are public. Drafts are visible to whoever is either
 * writing them (`/site`) or running them (`/competitions`), the second is what
 * lets a Secretary see next season's lomba before Marketing has published it,
 * which is precisely when the roster work starts.
 */
DROP POLICY IF EXISTS competitions_select_public ON competitions;
CREATE POLICY competitions_select_public ON competitions
  FOR SELECT TO anon USING (status = 'PUBLISHED');

DROP POLICY IF EXISTS competitions_select ON competitions;
CREATE POLICY competitions_select ON competitions
  FOR SELECT TO authenticated
  USING (
    status = 'PUBLISHED'
    OR app.has_page('/site')
    OR app.has_page('/competitions')
  );

/**
 * Authoring is a `/site` job and landing in a published state needs a verb, 
 * the same shape as every other content type, so an author cannot publish their
 * own work. Reading `/competitions` grants nothing here on purpose: the roster
 * roles have no business rewriting the public page.
 */
DROP POLICY IF EXISTS competitions_write ON competitions;
CREATE POLICY competitions_write ON competitions
  FOR ALL TO authenticated
  USING (app.has_page('/site'))
  WITH CHECK (
    app.has_action('content.review')
    OR app.has_action('content.publish')
    OR (app.has_page('/site') AND status IN ('DRAFT', 'IN_REVIEW'))
  );

-- ── participants ───────────────────────────────────────────────────────
/**
 * A family reads their own children's entries; staff running competitions read
 * all of them.
 *
 * `app.owns_student` is the same predicate the portal uses everywhere else, so
 * a guardian's "Lomba Saya" needs no filter of its own, a missing WHERE here
 * returns their children and nobody else's.
 */
DROP POLICY IF EXISTS competition_targets_select ON competition_targets;
CREATE POLICY competition_targets_select ON competition_targets
  FOR SELECT TO authenticated
  USING (app.has_page('/competitions') OR app.owns_student(student_id));

/**
 * Entering and withdrawing a student is roster work: `student.edit`.
 *
 * Split from the UPDATE below rather than expressed as one FOR ALL policy,
 * because FOR ALL would give whoever can enter a student the ability to write
 * their result too, and the whole point of the split is that recording an
 * outcome is a mentor's statement about what happened, not an administrator's.
 */
DROP POLICY IF EXISTS competition_targets_insert ON competition_targets;
CREATE POLICY competition_targets_insert ON competition_targets
  FOR INSERT TO authenticated
  WITH CHECK (app.has_action('student.edit'));

DROP POLICY IF EXISTS competition_targets_delete ON competition_targets;
CREATE POLICY competition_targets_delete ON competition_targets
  FOR DELETE TO authenticated
  USING (app.has_action('student.edit'));

/**
 * Readiness and result: `progress.edit`.
 *
 * doc 13 §8.3 lists "record competition result" and "update progress" among the
 * Mentor's five key actions, and `readiness_pct` is the number `/schedule`'s
 * sidebar has printed since the beginning with nothing behind it. This is what
 * finally puts something behind it.
 */
DROP POLICY IF EXISTS competition_targets_update ON competition_targets;
CREATE POLICY competition_targets_update ON competition_targets
  FOR UPDATE TO authenticated
  USING (app.has_action('progress.edit'))
  WITH CHECK (app.has_action('progress.edit'));

-- ── teams ──────────────────────────────────────────────────────────────
/**
 * A guardian sees a team their child is in, the name and the coach, because
 * "which team is my child on" is a question the portal has to answer. They do
 * not see the roster: `team_members_select` below narrows to their own child,
 * so the other families' names stay where they belong.
 */
DROP POLICY IF EXISTS teams_select ON teams;
CREATE POLICY teams_select ON teams
  FOR SELECT TO authenticated
  USING (
    app.has_page('/competitions')
    OR EXISTS (
      SELECT 1 FROM team_members m
      WHERE m.team_id = teams.id AND app.owns_student(m.student_id)
    )
  );

DROP POLICY IF EXISTS teams_write ON teams;
CREATE POLICY teams_write ON teams
  FOR ALL TO authenticated
  USING (app.has_action('student.edit'))
  WITH CHECK (app.has_action('student.edit'));

DROP POLICY IF EXISTS team_members_select ON team_members;
CREATE POLICY team_members_select ON team_members
  FOR SELECT TO authenticated
  USING (app.has_page('/competitions') OR app.owns_student(student_id));

DROP POLICY IF EXISTS team_members_write ON team_members;
CREATE POLICY team_members_write ON team_members
  FOR ALL TO authenticated
  USING (app.has_action('student.edit'))
  WITH CHECK (app.has_action('student.edit'));
