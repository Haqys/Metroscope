-- ═══════════════════════════════════════════════════════════════════════════
--  Master data: programs, topics.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The only tables in the schema that `anon` may read at all, and only the
-- published rows: the marketing site lists programmes and prices to people who
-- have not signed in. Unpublished rows are drafts with real prices in them and
-- stay invisible.

DROP POLICY IF EXISTS programs_select_public ON programs;
CREATE POLICY programs_select_public ON programs
  FOR SELECT TO anon
  USING (is_published);

DROP POLICY IF EXISTS programs_select ON programs;
CREATE POLICY programs_select ON programs
  FOR SELECT TO authenticated
  USING (is_published OR app.is_staff());

/**
 * Programmes are now CMS content as well as operational config (doc 14 §2.1),
 * and the two have different authors.
 *
 * This policy used to be `settings.edit` alone. That predates the editorial
 * pipeline and broke it in a way worth recording: an Editor holds no action
 * verbs at all, so `SELECT … FOR UPDATE`, which Postgres checks against the
 * UPDATE policy, not the SELECT one, matched no row, and the pipeline
 * reported "not found" for a programme sitting right there. The failure looked
 * like a missing row and was actually a missing privilege.
 *
 * The split below is the editorial model, enforced by RLS rather than only by
 * the API:
 *
 *   USING        anyone who can reach the CMS may read and lock a row.
 *   WITH CHECK   where it is allowed to LAND is the real control. An author
 *                can leave content in DRAFT or IN_REVIEW, writing and asking
 *                for review. Moving it to APPROVED, SCHEDULED, PUBLISHED or
 *                ARCHIVED needs a content verb, so an author cannot publish
 *                themselves even if the API gate were bypassed entirely.
 *
 * `settings.edit` keeps full write access: price, levels and duration are
 * operational facts that Finance and the Head set outside the editorial flow.
 */
DROP POLICY IF EXISTS programs_write ON programs;
CREATE POLICY programs_write ON programs
  FOR ALL TO authenticated
  USING (app.has_action('settings.edit') OR app.has_page('/site'))
  WITH CHECK (
    app.has_action('settings.edit')
    OR app.has_action('content.review')
    OR app.has_action('content.publish')
    OR (app.has_page('/site') AND status IN ('DRAFT', 'IN_REVIEW'))
  );

-- ── topics ─────────────────────────────────────────────────────────────
-- Visibility follows the parent programme rather than being restated, so a
-- programme moving to draft takes its syllabus with it automatically.
DROP POLICY IF EXISTS topics_select_public ON topics;
CREATE POLICY topics_select_public ON topics
  FOR SELECT TO anon
  USING (
    EXISTS (SELECT 1 FROM programs p WHERE p.id = topics.program_id AND p.is_published)
  );

DROP POLICY IF EXISTS topics_select ON topics;
CREATE POLICY topics_select ON topics
  FOR SELECT TO authenticated
  USING (
    app.is_staff()
    OR EXISTS (SELECT 1 FROM programs p WHERE p.id = topics.program_id AND p.is_published)
  );

DROP POLICY IF EXISTS topics_write ON topics;
CREATE POLICY topics_write ON topics
  FOR ALL TO authenticated
  USING (app.has_action('settings.edit'))
  WITH CHECK (app.has_action('settings.edit'));
